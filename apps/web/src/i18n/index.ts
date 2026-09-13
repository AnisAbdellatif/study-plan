import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { detectLocale, intlLocale, isLocale, LOCALE_STORAGE_KEY, LOCALES, type Locale } from './config.ts'
import { defaultNS, resources } from './resources.ts'

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLocale(),
  fallbackLng: 'de',
  supportedLngs: [...LOCALES],
  defaultNS,
  ns: Object.keys(resources.de),
  interpolation: { escapeValue: false },
  initAsync: false,
  returnEmptyString: false,
})

function applyDocumentLanguage(language: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = language
  document.title = i18n.t('brand')
  document.querySelector('meta[name="description"]')?.setAttribute('content', i18n.t('description'))
}

applyDocumentLanguage(i18n.language)

// Only an explicit change is remembered; until then the browser language decides.
i18n.on('languageChanged', (language) => {
  applyDocumentLanguage(language)
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, language)
  } catch {
    // Without storage the choice lasts until the page is reloaded.
  }
})

export const currentLocale = (): Locale => (isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'de')

export const currentIntlLocale = (): string => intlLocale(currentLocale())

export default i18n
