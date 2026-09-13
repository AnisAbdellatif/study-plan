import { useTranslation } from 'react-i18next'
import { LegalPage, LegalSection, OperatorField } from './legal-page.tsx'
import { operator } from './operator.ts'

export function ImpressumPage() {
  const { t } = useTranslation('legal')
  return (
    <LegalPage title={t('impressum.title')}>
      <LegalSection id="operator" heading={t('impressum.operatorHeading')}>
        <p>
          <OperatorField field="name" />
          <br />
          <OperatorField field="street" />
          <br />
          <OperatorField field="postalCity" />
        </p>
      </LegalSection>

      <LegalSection id="contact" heading={t('impressum.contactHeading')}>
        <p>
          {t('labels.email')} <OperatorField field="email" />
          {operator.phone ? (
            <>
              <br />
              {t('labels.phone')} {operator.phone}
            </>
          ) : null}
        </p>
      </LegalSection>

      <LegalSection id="programme-data" heading={t('impressum.programmeDataHeading')}>
        <p>{t('impressum.programmeData')}</p>
      </LegalSection>
    </LegalPage>
  )
}
