"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { X, ChevronRight, ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

interface TourStep {
  /** CSS selector or data-tour attribute value to highlight */
  target: string
  title: string
  description: string
  /** Preferred placement of the tooltip */
  placement: "top" | "bottom" | "left" | "right"
}

const tourSteps: TourStep[] = [
  {
    target: "[data-tour='sidebar-projects']",
    title: "Projects Hub",
    description:
      "All your research lives here. Create projects to organize tasks, papers, and agent teams. Click any project to dive in.",
    placement: "right",
  },
  {
    target: "[data-tour='sidebar-global']",
    title: "Global Views",
    description:
      "Teams and API Credits are accessible from anywhere, regardless of which project you're in.",
    placement: "right",
  },
  {
    target: "[data-tour='header-title']",
    title: "Contextual Header",
    description:
      "The header always shows your current context -- which project or global view you're looking at, plus your live system status.",
    placement: "bottom",
  },
  {
    target: "[data-tour='sidebar-guide']",
    title: "Quick Guide",
    description:
      "You can restart this walkthrough anytime by clicking the Quick Guide button in the sidebar.",
    placement: "right",
  },
]

interface OnboardingTourProps {
  active: boolean
  onFinish: () => void
}

export function OnboardingTour({ active, onFinish }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [tooltipPos, setTooltipPos] = useState<{
    top: number
    left: number
    placement: string
  } | null>(null)
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)
  const rafRef = useRef<number>(0)

  const positionTooltip = useCallback(() => {
    if (!active) return
    const step = tourSteps[currentStep]
    if (!step) return

    const el = document.querySelector(step.target)
    if (!el) {
      // Element not visible yet; try to find a fallback or skip
      setHighlightRect(null)
      setTooltipPos(null)
      return
    }

    const rect = el.getBoundingClientRect()
    setHighlightRect(rect)

    const gap = 12
    const tooltipWidth = 320
    const tooltipHeight = 160 // approximate

    let top = 0
    let left = 0
    let placement = step.placement

    switch (placement) {
      case "right":
        top = rect.top + rect.height / 2 - tooltipHeight / 2
        left = rect.right + gap
        if (left + tooltipWidth > window.innerWidth) {
          placement = "left"
          left = rect.left - gap - tooltipWidth
        }
        break
      case "left":
        top = rect.top + rect.height / 2 - tooltipHeight / 2
        left = rect.left - gap - tooltipWidth
        if (left < 0) {
          placement = "right"
          left = rect.right + gap
        }
        break
      case "bottom":
        top = rect.bottom + gap
        left = rect.left + rect.width / 2 - tooltipWidth / 2
        break
      case "top":
        top = rect.top - gap - tooltipHeight
        left = rect.left + rect.width / 2 - tooltipWidth / 2
        break
    }

    // Clamp to viewport
    top = Math.max(8, Math.min(top, window.innerHeight - tooltipHeight - 8))
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8))

    setTooltipPos({ top, left, placement })
  }, [active, currentStep])

  useEffect(() => {
    if (!active) return
    positionTooltip()

    const handleResize = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(positionTooltip)
    }

    window.addEventListener("resize", handleResize)
    window.addEventListener("scroll", handleResize, true)
    return () => {
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("scroll", handleResize, true)
      cancelAnimationFrame(rafRef.current)
    }
  }, [active, positionTooltip])

  // Reset step when tour starts
  useEffect(() => {
    if (active) setCurrentStep(0)
  }, [active])

  const handleNext = useCallback(() => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      onFinish()
    }
  }, [currentStep, onFinish])

  const handlePrev = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1)
  }, [currentStep])

  if (!active) return null

  const step = tourSteps[currentStep]

  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding tour"
    >
      {/* Overlay backdrop with highlight cutout */}
      <svg
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {highlightRect && (
              <rect
                x={highlightRect.left - 4}
                y={highlightRect.top - 4}
                width={highlightRect.width + 8}
                height={highlightRect.height + 8}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Highlight ring */}
      {highlightRect && (
        <div
          className="absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Click overlay to prevent interaction outside tooltip */}
      <div
        className="absolute inset-0"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Tooltip */}
      {tooltipPos && step && (
        <div
          className="absolute z-10 w-80 animate-in fade-in-0 slide-in-from-bottom-2 rounded-lg border border-border bg-card p-4 shadow-2xl"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
          }}
        >
          {/* Close button */}
          <button
            onClick={onFinish}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close tour"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          {/* Step indicator */}
          <div className="mb-2 flex items-center gap-1.5">
            {tourSteps.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === currentStep
                    ? "w-4 bg-primary"
                    : i < currentStep
                      ? "w-1.5 bg-primary/50"
                      : "w-1.5 bg-muted",
                )}
              />
            ))}
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {currentStep + 1}/{tourSteps.length}
            </span>
          </div>

          {/* Content */}
          <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {step.description}
          </p>

          {/* Navigation */}
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="h-7 gap-1 px-2 text-xs"
            >
              <ChevronLeft className="h-3 w-3" />
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleNext}
              className="h-7 gap-1 px-3 text-xs"
            >
              {currentStep === tourSteps.length - 1 ? "Finish" : "Next"}
              {currentStep < tourSteps.length - 1 && (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
