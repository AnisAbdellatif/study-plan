import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { LegalPage, LegalSection, OperatorField } from './legal-page.tsx'

const SECTIONS = [
  'controller',
  'summary',
  'website',
  'guest',
  'account',
  'sharing',
  'emails',
  'contact',
  'assistant',
  'abuse',
  'cookies',
  'rights',
  'misc',
] as const
const SUMMARY_ITEMS = [
  'guest',
  'account',
  'noTracking',
  'cookie',
  'sharing',
  'assistant',
  'contact',
  'selfService',
] as const
const ACCOUNT_ITEMS = ['identity', 'password', 'plans', 'reminders', 'language', 'sessions'] as const

/**
 * Describes what this app actually processes. Keep it in sync with apps/api (schema, auth, logging), the
 * container logging in deploy/ and the browser storage keys in apps/web whenever those change. The texts live in
 * the `legal` namespace; change the German original first, then the English courtesy translation.
 */
export function DatenschutzPage() {
  const { t } = useTranslation('legal')
  const heading = (id: (typeof SECTIONS)[number]) => t(`privacy.${id}.heading`)
  return (
    <LegalPage
      title={t('privacy.title')}
      updated={t('privacy.updated')}
      sections={SECTIONS.map((id) => ({ id, heading: heading(id) }))}
    >
      <LegalSection id="controller" heading={heading('controller')}>
        <p>
          <OperatorField field="name" />
          <br />
          <OperatorField field="street" />
          <br />
          <OperatorField field="postalCity" />
          <br />
          {t('labels.email')} <OperatorField field="email" />
        </p>
      </LegalSection>

      <LegalSection id="summary" heading={heading('summary')}>
        <ul className="list-none! rounded-xl bg-indigo-50/70 py-4 pr-4 ring-1 ring-indigo-100 dark:bg-indigo-950/30 dark:ring-indigo-900/60">
          {SUMMARY_ITEMS.map((item) => (
            <li key={item} className="flex gap-3">
              <Check aria-hidden className="mt-1.5 size-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>{t(`privacy.summary.${item}`)}</span>
            </li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection id="website" heading={heading('website')}>
        <p>{t('privacy.website.serverLogs')}</p>
        <p>{t('privacy.website.appLogs')}</p>
        <p>
          <Trans
            t={t}
            i18nKey="privacy.website.hosting"
            components={{ hosting: <OperatorField field="hostingProvider" /> }}
          />
        </p>
      </LegalSection>

      <LegalSection id="guest" heading={heading('guest')}>
        <p>{t('privacy.guest.storage')}</p>
      </LegalSection>

      <LegalSection id="account" heading={heading('account')}>
        <p>{t('privacy.account.intro')}</p>
        <ul>
          {ACCOUNT_ITEMS.map((item) => (
            <li key={item}>{t(`privacy.account.${item}`)}</li>
          ))}
        </ul>
        <p>{t('privacy.account.legalBasis')}</p>
        <p>{t('privacy.account.adminView')}</p>
        <p>{t('privacy.account.grades')}</p>
      </LegalSection>

      <LegalSection id="sharing" heading={heading('sharing')}>
        <p>{t('privacy.sharing.body')}</p>
      </LegalSection>

      <LegalSection id="emails" heading={heading('emails')}>
        <p>{t('privacy.emails.account')}</p>
        <p>{t('privacy.emails.reminders')}</p>
        <p>
          <Trans
            t={t}
            i18nKey="privacy.emails.provider"
            components={{ mail: <OperatorField field="mailProvider" /> }}
          />
        </p>
      </LegalSection>

      <LegalSection id="contact" heading={heading('contact')}>
        <p>
          <Trans t={t} i18nKey="privacy.contact.what" components={{ form: <Link to="/contact" /> }} />
        </p>
        <p>{t('privacy.contact.storage')}</p>
        <p>{t('privacy.contact.basis')}</p>
      </LegalSection>

      <LegalSection id="assistant" heading={heading('assistant')}>
        <p>{t('privacy.assistant.what')}</p>
        <p>{t('privacy.assistant.models')}</p>
        <p>{t('privacy.assistant.never')}</p>
        <p>{t('privacy.assistant.storage')}</p>
        <p>{t('privacy.assistant.statistics')}</p>
        <p>{t('privacy.assistant.basis')}</p>
        <p>{t('privacy.assistant.transfer')}</p>
      </LegalSection>

      <LegalSection id="abuse" heading={heading('abuse')}>
        <p>{t('privacy.abuse.body')}</p>
      </LegalSection>

      <LegalSection id="cookies" heading={heading('cookies')}>
        <p>{t('privacy.cookies.body')}</p>
      </LegalSection>

      <LegalSection id="rights" heading={heading('rights')}>
        <p>{t('privacy.rights.list')}</p>
        <p>
          <Trans
            t={t}
            i18nKey="privacy.rights.selfService"
            components={{ account: <Link to="/account" />, contact: <Link to="/contact" /> }}
          />
        </p>
        <p>{t('privacy.rights.complaint')}</p>
      </LegalSection>

      <LegalSection id="misc" heading={heading('misc')}>
        <p>{t('privacy.misc.body')}</p>
      </LegalSection>
    </LegalPage>
  )
}
