import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn.ts'

/** The logo. Decorative: it always sits next to the product name, which carries the meaning. */
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

const SIZES = {
  /** The homepage: the board header and the start page. */
  lg: { logo: 'size-11', text: 'text-2xl' },
  /** Account, sign-in and admin pages. */
  sm: { logo: 'size-7', text: 'text-base' },
} as const

/** Logo and product name in the brand typeface. */
export function BrandMark({ size = 'sm', className }: { size?: keyof typeof SIZES; className?: string }) {
  const { t } = useTranslation('common')
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandLogo className={SIZES[size].logo} />
      <span
        className={cn(
          'font-brand font-semibold tracking-tight text-zinc-900 dark:text-zinc-100',
          SIZES[size].text,
        )}
      >
        {t('brand')}
      </span>
    </span>
  )
}
