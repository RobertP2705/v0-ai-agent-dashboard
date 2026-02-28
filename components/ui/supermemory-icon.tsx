import { cn } from "@/lib/utils"

interface SupermemoryIconProps {
  className?: string
  spinning?: boolean
}

/**
 * Supermemory brand icon extracted from the official logo-fullmark.svg.
 * Two interlocking arrows forming the supermemory mark.
 */
export function SupermemoryIcon({ className, spinning }: SupermemoryIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 206 168"
      fill="currentColor"
      className={cn(className, spinning && "animate-spin-slow")}
    >
      <path d="M205.864 66.263h-76.401V0h-24.684v71.897c0 7.636 3.021 14.97 8.391 20.373l62.383 62.777 17.454-17.564-46.076-46.365h58.948v-24.84l-.015-.015Z" />
      <path d="M12.872 30.517l46.075 46.365H0v24.84h76.4v66.264h24.685V96.089c0-7.637-3.021-14.97-8.39-20.374l-62.37-62.762-17.453 17.564Z" />
    </svg>
  )
}
