"use client"

import { useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { GripHorizontal } from "lucide-react"

interface ResizableCardProps {
  children: React.ReactNode
  className?: string
  defaultHeight?: number
  minHeight?: number
  maxHeight?: number
}

export function ResizableCard({
  children,
  className,
  defaultHeight = 320,
  minHeight = 80,
  maxHeight = 1200,
}: ResizableCardProps) {
  const [height, setHeight] = useState(defaultHeight)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      dragging.current = true
      startY.current = e.clientY
      startH.current = height
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [height],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      const delta = e.clientY - startY.current
      setHeight(Math.max(minHeight, Math.min(maxHeight, startH.current + delta)))
    },
    [minHeight, maxHeight],
  )

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn("relative flex flex-col", className)}
      style={{ height }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex h-4 shrink-0 cursor-row-resize items-center justify-center rounded-b-md border-t border-border/50 bg-secondary/30 opacity-0 transition-opacity hover:opacity-100 active:opacity-100"
      >
        <GripHorizontal className="h-3 w-3 text-muted-foreground/50" />
      </div>
    </div>
  )
}
