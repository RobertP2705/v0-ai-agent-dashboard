"""Create research report PDFs and upload to Supabase Storage."""

from __future__ import annotations

import base64
import io
import os
import uuid
from typing import Any

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "create_report_pdf",
        "description": "Generate a short research-paper-style PDF report and upload it to storage. Use the provided title, abstract, sections, and optional figures (from modal_sandbox matplotlib output). Returns the public URL for download.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Report title.",
                },
                "abstract": {
                    "type": "string",
                    "description": "Short abstract (1-3 sentences).",
                },
                "sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "heading": {"type": "string"},
                            "body": {"type": "string"},
                        },
                        "required": ["heading", "body"],
                    },
                    "description": "List of sections, each with heading and body text.",
                },
                "figures": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "caption": {"type": "string"},
                            "base64_image": {"type": "string", "description": "Base64-encoded image (e.g. PNG from matplotlib)."},
                        },
                        "required": ["caption", "base64_image"],
                    },
                    "description": "Optional list of figures to embed (caption + base64 PNG).",
                },
            },
            "required": ["title", "abstract", "sections"],
        },
    },
}


def _build_pdf_bytes(
    title: str,
    abstract: str,
    sections: list[dict[str, str]],
    figures: list[dict[str, str]] | None = None,
) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=12,
    )
    heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=12,
        spaceAfter=6,
        spaceBefore=12,
    )
    body_style = styles["Normal"]
    body_style.spaceAfter = 8
    abstract_style = ParagraphStyle(
        "Abstract",
        parent=styles["Normal"],
        leftIndent=18,
        rightIndent=18,
        spaceAfter=14,
    )

    story = []
    story.append(Paragraph(title, title_style))
    story.append(Spacer(1, 6))
    story.append(Paragraph("<b>Abstract</b>", heading_style))
    story.append(Paragraph(abstract.replace("\n", "<br/>"), abstract_style))
    story.append(Spacer(1, 8))

    for sec in sections:
        heading = sec.get("heading", "")
        body = sec.get("body", "")
        if heading:
            story.append(Paragraph(heading, heading_style))
        if body:
            story.append(Paragraph(body.replace("\n", "<br/>"), body_style))
        story.append(Spacer(1, 6))

    figures = figures or []
    for i, fig in enumerate(figures):
        caption = fig.get("caption", f"Figure {i + 1}")
        b64 = fig.get("base64_image", "")
        if b64:
            try:
                raw = base64.b64decode(b64)
                img = Image(io.BytesIO(raw), width=4 * inch, height=3 * inch)
                story.append(Spacer(1, 12))
                story.append(img)
                story.append(Spacer(1, 4))
                story.append(Paragraph(f"<i>{caption}</i>", body_style))
                story.append(Spacer(1, 8))
            except Exception:
                story.append(Paragraph(f"[Figure: {caption}]", body_style))

    doc.build(story)
    return buffer.getvalue()


def create_report_pdf(
    task_id: str,
    title: str,
    abstract: str,
    sections: list[dict[str, Any]],
    figures: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build PDF, upload to Supabase Storage, insert task_report row, return URL."""
    from .. import db

    if not task_id:
        return {"error": "task_id is required", "public_url": ""}

    try:
        pdf_bytes = _build_pdf_bytes(title, abstract, sections, figures)
    except Exception as e:
        return {"error": f"PDF build failed: {e}", "public_url": ""}

    file_name = "report.pdf"
    unique_id = str(uuid.uuid4())
    storage_path = f"{task_id}/{unique_id}.pdf"

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return {"error": "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set", "public_url": ""}

    try:
        from supabase import create_client
        sb = create_client(url, key)
        bucket = "reports"
        # Create the bucket if it does not exist (public so public_url works)
        try:
            sb.storage.create_bucket(bucket, options={"public": True})
        except Exception as create_err:
            err_msg = str(create_err).lower()
            if "already exists" not in err_msg and "duplicate" not in err_msg:
                return {"error": f"Storage bucket create failed: {create_err}", "public_url": ""}
        sb.storage.from_(bucket).upload(
            storage_path,
            pdf_bytes,
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )
        public_url = f"{url}/storage/v1/object/public/{bucket}/{storage_path}"
    except Exception as e:
        return {"error": f"Storage upload failed: {e}", "public_url": ""}

    try:
        db.insert_task_report(
            task_id=task_id,
            title=title,
            file_name=file_name,
            storage_path=storage_path,
            public_url=public_url,
        )
    except Exception as e:
        return {"error": f"DB insert failed: {e}", "public_url": public_url}

    return {"public_url": public_url, "title": title, "storage_path": storage_path}
