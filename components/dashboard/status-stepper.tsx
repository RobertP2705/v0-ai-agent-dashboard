"use client"

import { cn } from "@/lib/utils"
import { Check, Loader2, Circle } from "lucide-react"
import type { StepperStep } from "@/lib/simulation-data"

interface StatusStepperProps {
  steps: StepperStep[]
}

export function StatusStepper({ steps }: StatusStepperProps) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                step.status === "completed" &&
                  "border-success bg-success/20 text-success",
                step.status === "active" &&
                  "border-primary bg-primary/20 text-primary",
                step.status === "pending" &&
                  "border-border bg-secondary text-muted-foreground"
              )}
            >
              {step.status === "completed" && <Check className="h-3 w-3" />}
              {step.status === "active" && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {step.status === "pending" && <Circle className="h-2 w-2" />}
            </div>
            <span
              className={cn(
                "font-mono text-[10px] whitespace-nowrap",
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
                "mx-2 h-px w-6 shrink-0",
                step.status === "completed" ? "bg-success/50" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
