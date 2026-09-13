import { Link } from '@tanstack/react-router'
import { Filled, LegalPage } from './legal-page.tsx'
import { operator } from './operator.ts'

/**
 * Describes what this app actually processes. Keep it in sync with apps/api (schema, auth, logging)
 * and the browser storage keys in apps/web whenever those change.
 */
export function DatenschutzPage() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <h2>1. Verantwortlich</h2>
      <p>
        <Filled value={operator.name} placeholder="Vor- und Nachname" />
        <br />
        <Filled value={operator.street} placeholder="Straße und Hausnummer" />
        <br />
        <Filled value={operator.postalCity} placeholder="PLZ und Ort" />
        <br />
        E-Mail: <Filled value={operator.email} placeholder="E-Mail-Adresse" />
      </p>

      <h2>2. Das Wichtigste in Kürze</h2>
      <ul>
        <li>Ohne Konto bleibt dein Plan nur in deinem Browser und wird nicht an uns übertragen.</li>
        <li>
          Mit Konto speichern wir deine E-Mail-Adresse, einen verschlüsselten Passwort-Hash, deine Pläne mit
          Noten und Informationen zu deinen Anmeldungen.
        </li>
        <li>
          Es gibt keine Werbung, kein Tracking, keine Analyse-Werkzeuge und keine eingebundenen Inhalte von
          Drittanbietern wie Schriften oder Skripte.
        </li>
        <li>Wir setzen nur ein technisch notwendiges Cookie, und zwar erst, wenn du dich anmeldest.</li>
        <li>Teilst du einen Plan per Link, sieht man darüber nur Semester und Module, nie deine Noten.</li>
        <li>Du kannst deine Daten jederzeit selbst herunterladen und dein Konto selbst löschen.</li>
      </ul>

      <h2>3. Aufruf der Website</h2>
      <p>
        Beim Aufruf der Seite verarbeitet der Webserver technisch notwendige Verbindungsdaten: IP-Adresse,
        Zeitpunkt, aufgerufene Adresse, übertragene Datenmenge und die Kennung deines Browsers. Das ist nötig,
        um die Seite auszuliefern und die Sicherheit des Servers zu gewährleisten (Art. 6 Abs. 1 lit. f
        DSGVO). Diese Protokolle werden nach{' '}
        <Filled value={operator.serverLogRetention} placeholder="Speicherdauer der Server-Logs" /> gelöscht.
      </p>
      <p>
        Die Anwendung selbst protokolliert Anfragen nur mit Methode, Pfad, Statuscode und Dauer, ohne
        IP-Adressen und ohne Inhalte.
      </p>
      <p>
        Der Server wird betrieben bei:{' '}
        <Filled value={operator.hostingProvider} placeholder="Hosting-Anbieter" />. Der Anbieter verarbeitet
        die Daten in unserem Auftrag (Art. 28 DSGVO).
      </p>

      <h2>4. Nutzung ohne Konto</h2>
      <p>
        Dein Plan, deine Noten, Prüfungstermine und dein Zielschnitt werden im lokalen Speicher deines
        Browsers (localStorage) abgelegt. Diese Daten verlassen deinen Browser nicht, außer du exportierst sie
        selbst als Datei oder sicherst sie in einem Konto. Die Speicherung ist für die von dir gewünschte
        Funktion unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Du löschst die Daten über „Neu beginnen“
        oder indem du die Websitedaten in deinem Browser entfernst.
      </p>

      <h2>5. Nutzung mit Konto</h2>
      <p>Wenn du ein Konto erstellst, speichern wir:</p>
      <ul>
        <li>
          deine E-Mail-Adresse, einen Anzeigenamen (automatisch der Teil deiner E-Mail-Adresse vor dem @), ob
          die Adresse bestätigt ist, und wann das Konto angelegt und geändert wurde,
        </li>
        <li>dein Passwort nur als gesalzenen scrypt-Hash, niemals im Klartext,</li>
        <li>
          deine Pläne: Studiengang, Module, Semester, Ergebnisse und Noten mit allen Prüfungsversuchen,
          Prüfungstermine und Zielschnitt,
        </li>
        <li>ob du E-Mail-Erinnerungen eingeschaltet hast,</li>
        <li>
          für jede Anmeldung einen zufälligen Sitzungsschlüssel, ihr Ablaufdatum sowie die IP-Adresse und die
          Browserkennung zum Zeitpunkt der Anmeldung. So kannst du erkennen, wo du angemeldet bist, und
          Missbrauch lässt sich nachvollziehen.
        </li>
      </ul>
      <p>
        Rechtsgrundlage ist die Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO). Eine Anmeldung
        bleibt 30 Tage nach der letzten Nutzung gültig. Alle Kontodaten, Pläne und Anmeldungen werden
        gelöscht, wenn du dein Konto löschst.
      </p>
      <p>
        Zur Betreuung des Dienstes sehen wir in einer Verwaltungsansicht deine E-Mail-Adresse, ob sie
        bestätigt ist, wann du das Konto angelegt und zuletzt genutzt hast, wie viele Pläne und geteilte Links
        du hast und ob Erinnerungen eingeschaltet sind, aber keine Noten und keine Planinhalte. Auf Anfrage
        oder bei Missbrauch können wir dort Bestätigungs-E-Mails senden, Links deaktivieren, Anmeldungen
        beenden und Konten löschen. Jede solche Aktion protokollieren wir mit der Kontokennung, ohne
        E-Mail-Adresse, und löschen das Protokoll nach einem Jahr. Rechtsgrundlage ist unser berechtigtes
        Interesse an einem sicheren und funktionierenden Dienst (Art. 6 Abs. 1 lit. f DSGVO).
      </p>
      <p>
        Noten gehören nicht zu den besonderen Kategorien personenbezogener Daten nach Art. 9 DSGVO. Wir
        behandeln sie trotzdem vertraulich: Sie sind nur über dein Konto abrufbar und werden nicht an andere
        weitergegeben.
      </p>

      <h2>6. Geteilte Pläne</h2>
      <p>
        Wenn du einen Plan teilst, erzeugen wir einen zufälligen Link. Wir speichern davon nur einen Prüfwert
        (Hash), den Zeitpunkt der Erstellung und ob du den Link deaktiviert hast. Wer den Link kennt, sieht
        den Namen des Plans, Studiengang, Semester und Module, aber keine Noten, Prüfungstermine und keinen
        Zielschnitt, und kann den Plan als eigene Kopie übernehmen. Du kannst den Link jederzeit deaktivieren;
        er wird zusammen mit dem Plan oder deinem Konto gelöscht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b
        DSGVO.
      </p>

      <h2>7. E-Mails</h2>
      <p>
        Wir schicken dir E-Mails, die für dein Konto nötig sind: die Bestätigung deiner E-Mail-Adresse und
        Links zum Zurücksetzen deines Passworts (Art. 6 Abs. 1 lit. b DSGVO).
      </p>
      <p>
        Wenn du auf der Kontoseite E-Mail-Erinnerungen einschaltest, erinnern wir dich an Abmeldefristen und
        Prüfungstermine, die du in deinen im Konto gespeicherten Plänen eingetragen hast. Die E-Mails
        enthalten nur Modulnamen und Daten. Damit keine Erinnerung doppelt kommt, speichern wir zu jeder
        verschickten Erinnerung den Plan, die Modulnummer, die Art und das Datum des Termins sowie den
        Versandzeitpunkt und löschen diese Einträge 30 Tage nach dem Termin. Du schaltest die Erinnerungen
        jederzeit auf der Kontoseite oder über den Link in jeder Erinnerung aus. Rechtsgrundlage ist Art. 6
        Abs. 1 lit. b DSGVO.
      </p>
      <p>
        Der Versand aller E-Mails erfolgt über{' '}
        <Filled value={operator.mailProvider} placeholder="E-Mail-Versanddienst" />, der die Daten in unserem
        Auftrag verarbeitet (Art. 28 DSGVO).
      </p>

      <h2>8. Schutz vor Missbrauch</h2>
      <p>
        Um wiederholte Anmeldeversuche und andere automatisierte Angriffe auf Konten zu begrenzen, speichern
        wir kurzzeitig einen Zähler je IP-Adresse und aufgerufener Anmeldefunktion. Abrufe geteilter Pläne
        begrenzen wir ebenso, dafür werden Zähler nur im Arbeitsspeicher gehalten und nicht dauerhaft
        gespeichert. Rechtsgrundlage ist unser berechtigtes Interesse an der Sicherheit der Konten (Art. 6
        Abs. 1 lit. f DSGVO).
      </p>

      <h2>9. Cookies</h2>
      <p>
        Nach der Anmeldung setzen wir ein Cookie mit deinem Sitzungsschlüssel, damit du angemeldet bleibst. Es
        ist für die Anmeldung unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG) und wird beim Abmelden
        entfernt. Weitere Cookies verwenden wir nicht.
      </p>

      <h2>10. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17),
        Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20). Gegen Verarbeitungen auf
        Grundlage berechtigter Interessen kannst du Widerspruch einlegen (Art. 21).
      </p>
      <p>
        Auskunft und Datenübertragbarkeit bekommst du jederzeit selbst über „Daten herunterladen“, und dein
        Konto löschst du selbst, beides auf der <Link to="/konto">Kontoseite</Link>. Für alles andere schreib
        an die oben genannte E-Mail-Adresse.
      </p>
      <p>
        Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum
        Beispiel bei der für deinen Wohnort zuständigen.
      </p>

      <h2>11. Sonstiges</h2>
      <p>
        Die Nutzung ist freiwillig. Ein Konto brauchst du nur, wenn dein Plan auf mehreren Geräten verfügbar
        sein soll. Es findet keine automatisierte Entscheidungsfindung und kein Profiling statt.
      </p>
      <p>Stand: September 2026</p>
    </LegalPage>
  )
}
