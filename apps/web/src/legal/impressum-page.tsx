import { Filled, LegalPage } from './legal-page.tsx'
import { operator } from './operator.ts'

export function ImpressumPage() {
  return (
    <LegalPage title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        <Filled value={operator.name} placeholder="Vor- und Nachname" />
        <br />
        <Filled value={operator.street} placeholder="Straße und Hausnummer" />
        <br />
        <Filled value={operator.postalCity} placeholder="PLZ und Ort" />
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <Filled value={operator.email} placeholder="E-Mail-Adresse" />
        {operator.phone ? (
          <>
            <br />
            Telefon: {operator.phone}
          </>
        ) : null}
      </p>

      <h2>Hinweis zu den Studiengangsdaten</h2>
      <p>
        Die Studiengangsvorlagen werden nach bestem Wissen aus den öffentlich zugänglichen Prüfungsordnungen
        und Modulkatalogen der Hochschulen erstellt. Maßgeblich sind allein die amtlichen Dokumente der
        jeweiligen Hochschule. Der berechnete Notenschnitt ist eine unverbindliche Vorschau.
      </p>
    </LegalPage>
  )
}
