import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn.ts'
import { Spinner } from './spinner.tsx'

const variants = {
  primary:
    'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:shadow-none dark:shadow-indigo-950/60',
  secondary:
    'bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50 hover:ring-zinc-400 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800 dark:hover:ring-zinc-600',
  ghost: 'text-zinc-700 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-600/50',
} as const

const sizes = {
  sm: 'h-8 px-2.5 text-sm',
  md: 'h-10 px-3.5 text-sm',
  icon: 'size-8',
} as const

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  /** Work started by this button is running: shows a spinner, disables the button and marks it busy. */
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed',
        loading && 'cursor-progress!',
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    >
      {/* Icon buttons swap their icon for the spinner so their size stays the same. */}
      {loading ? <Spinner /> : null}
      {loading && size === 'icon' ? null : children}
    </button>
  )
}
