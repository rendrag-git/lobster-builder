import { useId, type ReactNode } from 'react'

type TooltipSide = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: TooltipSide
  className?: string
  tooltipClassName?: string
  testId?: string
}

const sideClasses: Record<TooltipSide, string> = {
  'bottom-left': 'left-0 top-full mt-2',
  'bottom-right': 'right-0 top-full mt-2',
  'top-left': 'bottom-full left-0 mb-2',
  'top-right': 'bottom-full right-0 mb-2',
}

export function Tooltip({
  content,
  children,
  side = 'bottom-right',
  className = '',
  tooltipClassName = '',
  testId,
}: TooltipProps) {
  const id = useId()

  return (
    <span
      className={`group relative inline-flex ${className}`}
      aria-describedby={id}
      data-testid={testId}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className={[
          'pointer-events-none invisible absolute z-50 w-72 max-w-[calc(100vw-2rem)] rounded border border-gray-700 bg-gray-950 px-3 py-2 text-left text-[11px] leading-snug text-gray-300 shadow-xl opacity-0 transition-opacity duration-150',
          'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
          sideClasses[side],
          tooltipClassName,
        ].join(' ')}
      >
        {content}
      </span>
    </span>
  )
}
