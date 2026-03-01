-- Migration 006: Deduplicate papers on insert
--
-- Prevents duplicate papers from accumulating. A paper is considered a
-- duplicate when another row already exists with the same non-null arxiv_id
-- OR the same non-null pdf_url. The trigger fires BEFORE INSERT and silently
-- drops the duplicate row.

-- 1. Clean up existing duplicates FIRST (keep earliest row per arxiv_id)
DELETE FROM papers
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY arxiv_id ORDER BY created_at ASC
      ) AS rn
    FROM papers
    WHERE arxiv_id IS NOT NULL AND arxiv_id != ''
  ) dupes
  WHERE rn > 1
);

-- 2. Clean up duplicates by pdf_url for rows without an arxiv_id
DELETE FROM papers
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY pdf_url ORDER BY created_at ASC
      ) AS rn
    FROM papers
    WHERE pdf_url IS NOT NULL AND pdf_url != ''
      AND (arxiv_id IS NULL OR arxiv_id = '')
  ) dupes
  WHERE rn > 1
);

-- 3. Now safe to create unique indexes (partial — only non-null/non-empty values)
CREATE UNIQUE INDEX IF NOT EXISTS papers_unique_arxiv_id
  ON papers (arxiv_id)
  WHERE arxiv_id IS NOT NULL AND arxiv_id != '';

CREATE UNIQUE INDEX IF NOT EXISTS papers_unique_pdf_url
  ON papers (pdf_url)
  WHERE pdf_url IS NOT NULL AND pdf_url != '';

-- 4. Trigger function: skip insert if a matching paper already exists
CREATE OR REPLACE FUNCTION prevent_duplicate_paper()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM papers
    WHERE (
      (NEW.arxiv_id IS NOT NULL AND NEW.arxiv_id != '' AND papers.arxiv_id = NEW.arxiv_id)
      OR
      (NEW.pdf_url IS NOT NULL AND NEW.pdf_url != '' AND papers.pdf_url = NEW.pdf_url)
    )
  ) THEN
    RETURN NULL; -- skip the insert
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Attach trigger
DROP TRIGGER IF EXISTS trg_prevent_duplicate_paper ON papers;
CREATE TRIGGER trg_prevent_duplicate_paper
  BEFORE INSERT ON papers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_duplicate_paper();
