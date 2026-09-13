import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isLocale, LOCALES } from '../i18n/config.ts'
import { Button } from './ui/button.tsx'
import {
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuTrigger,
} from './ui/menu.tsx'

/** Language dropdown for page headers. The choice is saved in the browser and, when signed in, on the account. */
export function LanguageMenu() {
  const { t, i18n } = useTranslation()
  const current = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'de'

  return (
    <MenuRoot>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label={t('language.current', { language: t(`language.${current}`) })}
          />
        }
      >
        <Languages aria-hidden className="size-4" />
        <span aria-hidden className="text-xs font-semibold uppercase">
          {current}
        </span>
      </MenuTrigger>
      <MenuContent>
        <MenuGroup>
          <MenuGroupLabel>{t('language.label')}</MenuGroupLabel>
          <MenuRadioGroup
            value={current}
            onValueChange={(value: unknown) => {
              if (isLocale(value)) void i18n.changeLanguage(value)
            }}
          >
            {LOCALES.map((locale) => (
              <MenuRadioItem key={locale} value={locale} lang={locale}>
                {t(`language.${locale}`)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuContent>
    </MenuRoot>
  )
}
