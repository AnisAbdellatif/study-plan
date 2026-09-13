import { useTranslation } from 'react-i18next'
import { LegalPage, OperatorField } from './legal-page.tsx'
import { operator } from './operator.ts'

export function ImpressumPage() {
  const { t } = useTranslation('legal')
  return (
    <LegalPage title={t('impressum.title')}>
      <h2>{t('impressum.operatorHeading')}</h2>
      <p>
        <OperatorField field="name" />
        <br />
        <OperatorField field="street" />
        <br />
        <OperatorField field="postalCity" />
      </p>

      <h2>{t('impressum.contactHeading')}</h2>
      <p>
        {t('labels.email')} <OperatorField field="email" />
        {operator.phone ? (
          <>
            <br />
            {t('labels.phone')} {operator.phone}
          </>
        ) : null}
      </p>

      <h2>{t('impressum.programmeDataHeading')}</h2>
      <p>{t('impressum.programmeData')}</p>
    </LegalPage>
  )
}
