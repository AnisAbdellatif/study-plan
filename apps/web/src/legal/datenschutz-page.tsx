import { Link } from '@tanstack/react-router'
import { Trans, useTranslation } from 'react-i18next'
import { LegalPage, OperatorField } from './legal-page.tsx'

const SUMMARY_ITEMS = ['guest', 'account', 'noTracking', 'cookie', 'sharing', 'selfService'] as const
const ACCOUNT_ITEMS = ['identity', 'password', 'plans', 'reminders', 'language', 'sessions'] as const

/**
 * Describes what this app actually processes. Keep it in sync with apps/api (schema, auth, logging)
 * and the browser storage keys in apps/web whenever those change. The texts live in the `legal` namespace;
 * change the German original first, then the English courtesy translation.
 */
export function DatenschutzPage() {
  const { t } = useTranslation('legal')
  return (
    <LegalPage title={t('privacy.title')}>
      <h2>{t('privacy.controller.heading')}</h2>
      <p>
        <OperatorField field="name" />
        <br />
        <OperatorField field="street" />
        <br />
        <OperatorField field="postalCity" />
        <br />
        {t('labels.email')} <OperatorField field="email" />
      </p>

      <h2>{t('privacy.summary.heading')}</h2>
      <ul>
        {SUMMARY_ITEMS.map((item) => (
          <li key={item}>{t(`privacy.summary.${item}`)}</li>
        ))}
      </ul>

      <h2>{t('privacy.website.heading')}</h2>
      <p>
        <Trans
          t={t}
          i18nKey="privacy.website.serverLogs"
          components={{ retention: <OperatorField field="serverLogRetention" /> }}
        />
      </p>
      <p>{t('privacy.website.appLogs')}</p>
      <p>
        <Trans
          t={t}
          i18nKey="privacy.website.hosting"
          components={{ hosting: <OperatorField field="hostingProvider" /> }}
        />
      </p>

      <h2>{t('privacy.guest.heading')}</h2>
      <p>{t('privacy.guest.storage')}</p>

      <h2>{t('privacy.account.heading')}</h2>
      <p>{t('privacy.account.intro')}</p>
      <ul>
        {ACCOUNT_ITEMS.map((item) => (
          <li key={item}>{t(`privacy.account.${item}`)}</li>
        ))}
      </ul>
      <p>{t('privacy.account.legalBasis')}</p>
      <p>{t('privacy.account.adminView')}</p>
      <p>{t('privacy.account.grades')}</p>

      <h2>{t('privacy.sharing.heading')}</h2>
      <p>{t('privacy.sharing.body')}</p>

      <h2>{t('privacy.emails.heading')}</h2>
      <p>{t('privacy.emails.account')}</p>
      <p>{t('privacy.emails.reminders')}</p>
      <p>
        <Trans
          t={t}
          i18nKey="privacy.emails.provider"
          components={{ mail: <OperatorField field="mailProvider" /> }}
        />
      </p>

      <h2>{t('privacy.abuse.heading')}</h2>
      <p>{t('privacy.abuse.body')}</p>

      <h2>{t('privacy.cookies.heading')}</h2>
      <p>{t('privacy.cookies.body')}</p>

      <h2>{t('privacy.rights.heading')}</h2>
      <p>{t('privacy.rights.list')}</p>
      <p>
        <Trans t={t} i18nKey="privacy.rights.selfService" components={{ account: <Link to="/account" /> }} />
      </p>
      <p>{t('privacy.rights.complaint')}</p>

      <h2>{t('privacy.misc.heading')}</h2>
      <p>{t('privacy.misc.body')}</p>
      <p>{t('privacy.updated')}</p>
    </LegalPage>
  )
}
