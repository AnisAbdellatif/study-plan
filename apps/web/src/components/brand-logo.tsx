import { cn } from '../lib/cn.ts'

/** The Studienplaner logo. Decorative: it always sits next to the product name, which carries the meaning. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src="/logo.svg"
      alt=""
      aria-hidden
      width={20}
      height={20}
      className={cn('size-5 shrink-0', className)}
    />
  )
}
