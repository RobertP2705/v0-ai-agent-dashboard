"use client"

import { cn } from "@/lib/utils"
import { Check, Loader2, Circle } from "lucide-react"
import type { StepperStep } from "@/lib/simulation-data"

interface StatusStepperProps {
  steps: StepperStep[]
  size?: "sm" | "lg"
}

export function StatusStepper({ steps, size = "sm" }: StatusStepperProps) {
  const lg = size === "lg"

  return (
    <div className="flex w-min min-w-0 items-center gap-0 overflow-x-auto">
      {steps.map((step, i) => (
        <div key={step.id} className="flex shrink-0 items-center">
          <div className={cn("flex items-center", lg ? "gap-2" : "gap-1.5")}>
            <div
              className={cn(
                "flex items-center justify-center rounded-full border transition-all",
                lg ? "h-7 w-7" : "h-5 w-5 text-[10px]",
                step.status === "completed" &&
                  "border-success bg-success/20 text-success",
                step.status === "active" && cn(
                  "border-primary bg-primary/20 text-primary",
                  lg && "shadow-[0_0_8px_rgba(var(--primary-rgb,34,197,94),0.4)]"
                ),
                step.status === "pending" &&
                  "border-border bg-secondary text-muted-foreground"
              )}
            >
              {step.status === "completed" && <Check className={lg ? "h-4 w-4" : "h-3 w-3"} />}
              {step.status === "active" && (
                <Loader2 className={cn(lg ? "h-4 w-4" : "h-3 w-3", "animate-spin")} />
              )}
              {step.status === "pending" && <Circle className={lg ? "h-2.5 w-2.5" : "h-2 w-2"} />}
            </div>
            <span
              className={cn(
                "font-mono whitespace-nowrap",
                lg ? "text-xs" : "text-[10px]",
                step.status === "active"
                  ? "font-medium text-primary"
                  : step.status === "completed"
                    ? "text-success"
                    : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                "shrink-0",
                lg ? "mx-3 h-px w-10" : "mx-2 h-px w-6",
                step.status === "completed" ? "bg-success/50" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
