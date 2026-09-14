/**
 * Impressum and Datenschutzerklärung. The German text is legally binding; English is a courtesy translation.
 * One key per paragraph or list item. Tags such as <hosting/> are filled by the page with operator details.
 */
export const legal = {
  backToApp: 'Zur Startseite',
  eyebrow: 'Rechtliches',
  contents: 'Inhalt',
  incomplete:
    'Diese Seite ist noch nicht vollständig: Angaben zum Betreiber fehlen. Vor der Veröffentlichung müssen sie in der Konfiguration eingetragen werden.',
  courtesyTranslation: {
    note: 'Dies ist eine unverbindliche Übersetzung. Rechtlich verbindlich ist allein die deutsche Fassung.',
    switchToGerman: 'Deutsche Fassung anzeigen',
  },
  placeholders: {
    name: 'Vor- und Nachname',
    street: 'Straße und Hausnummer',
    postalCity: 'PLZ und Ort',
    email: 'E-Mail-Adresse',
    phone: 'Telefonnummer',
    hostingProvider: 'Hosting-Anbieter',
    mailProvider: 'E-Mail-Versanddienst',
  },
  labels: {
    email: 'E-Mail:',
    phone: 'Telefon:',
  },
  impressum: {
    title: 'Impressum',
    operatorHeading: 'Angaben gemäß § 5 DDG',
    contactHeading: 'Kontakt',
    programmeDataHeading: 'Hinweis zu den Studiengangsdaten',
    programmeData:
      'Die Studiengangsvorlagen werden nach bestem Wissen aus den öffentlich zugänglichen Prüfungsordnungen und Modulkatalogen der Hochschulen erstellt. Maßgeblich sind allein die amtlichen Dokumente der jeweiligen Hochschule. Der berechnete Notenschnitt ist eine unverbindliche Vorschau.',
  },
  privacy: {
    title: 'Datenschutzerklärung',
    controller: {
      heading: '1. Verantwortlich',
    },
    summary: {
      heading: '2. Das Wichtigste in Kürze',
      guest: 'Ohne Konto bleibt dein Plan nur in deinem Browser und wird nicht an uns übertragen.',
      account:
        'Mit Konto speichern wir deine E-Mail-Adresse, einen verschlüsselten Passwort-Hash, deine Pläne mit Noten und Informationen zu deinen Anmeldungen.',
      noTracking:
        'Es gibt keine Werbung, kein Tracking, keine Analyse-Werkzeuge und keine eingebundenen Inhalte von Drittanbietern wie Schriften oder Skripte.',
      cookie: 'Wir setzen nur ein technisch notwendiges Cookie, und zwar erst, wenn du dich anmeldest.',
      sharing:
        'Teilst du einen Plan per Link, sieht man darüber Semester und Module. Deine Noten nur, wenn du beim Erstellen des Links ausdrücklich „Mit Noten“ wählst.',
      assistant:
        'Den Studienassistenten nutzt du freiwillig. Das Sprachmodell bekommt nur die Studiengangsdaten deines Plans und deine Fragen, nie deine Noten.',
      selfService: 'Du kannst deine Daten jederzeit selbst herunterladen und dein Konto selbst löschen.',
    },
    website: {
      heading: '3. Aufruf der Website',
      serverLogs:
        'Beim Aufruf der Seite verarbeitet der Server technisch notwendige Verbindungsdaten wie deine IP-Adresse, den Zeitpunkt und die aufgerufene Adresse, damit die Seite ausgeliefert werden kann (Art. 6 Abs. 1 lit. f DSGVO). Diese Daten werden nur für die Dauer der Verbindung verarbeitet. Wir führen keine Zugriffsprotokolle mit IP-Adressen: Weder der Webserver noch die Anwendung speichern IP-Adressen in Protokollen. Ausnahmen sind nur die unter 5. und 9. beschriebenen Anmeldungen und Zähler zum Schutz vor Missbrauch.',
      appLogs:
        'Die Anwendung protokolliert Anfragen nur mit Methode, Pfad, Statuscode und Dauer, ohne IP-Adressen und ohne Inhalte. Diese technischen Protokolle haben eine feste Maximalgröße; ältere Einträge werden automatisch überschrieben.',
      hosting:
        'Der Server wird betrieben bei: <hosting/>. Der Anbieter verarbeitet die Daten in unserem Auftrag (Art. 28 DSGVO).',
    },
    guest: {
      heading: '4. Nutzung ohne Konto',
      storage:
        'Dein Plan, deine Noten, Prüfungstermine und dein Zielschnitt werden im lokalen Speicher deines Browsers (localStorage) abgelegt. Diese Daten verlassen deinen Browser nicht, außer du exportierst sie selbst als Datei oder sicherst sie in einem Konto. Die Speicherung ist für die von dir gewünschte Funktion unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Du löschst die Daten über „Neu beginnen“ oder indem du die Websitedaten in deinem Browser entfernst.',
    },
    account: {
      heading: '5. Nutzung mit Konto',
      intro: 'Wenn du ein Konto erstellst, speichern wir:',
      identity:
        'deine E-Mail-Adresse, einen Anzeigenamen (automatisch der Teil deiner E-Mail-Adresse vor dem @), ob die Adresse bestätigt ist, und wann das Konto angelegt und geändert wurde,',
      password: 'dein Passwort nur als gesalzenen scrypt-Hash, niemals im Klartext,',
      plans:
        'deine Pläne: Studiengang, Module, Semester, Ergebnisse und Noten mit allen Prüfungsversuchen, Prüfungstermine und Zielschnitt,',
      reminders: 'ob du E-Mail-Erinnerungen eingeschaltet hast,',
      language:
        'welche Sprache du für die Website gewählt hast, damit wir dir E-Mails in dieser Sprache schicken,',
      sessions:
        'für jede Anmeldung einen zufälligen Sitzungsschlüssel, ihr Ablaufdatum sowie die IP-Adresse und die Browserkennung zum Zeitpunkt der Anmeldung. So kannst du erkennen, wo du angemeldet bist, und Missbrauch lässt sich nachvollziehen.',
      legalBasis:
        'Rechtsgrundlage ist die Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO). Eine Anmeldung bleibt 30 Tage nach der letzten Nutzung gültig. Alle Kontodaten, Pläne und Anmeldungen werden gelöscht, wenn du dein Konto löschst.',
      adminView:
        'Zur Betreuung des Dienstes sehen wir in einer Verwaltungsansicht deine E-Mail-Adresse, ob sie bestätigt ist, wann du das Konto angelegt und zuletzt genutzt hast, wie viele Pläne und geteilte Links du hast und ob Erinnerungen eingeschaltet sind, aber keine Noten und keine Planinhalte. Auf Anfrage oder bei Missbrauch können wir dort Bestätigungs-E-Mails senden, Links deaktivieren, Anmeldungen beenden und Konten löschen. Jede solche Aktion protokollieren wir mit der Kontokennung, ohne E-Mail-Adresse, und löschen das Protokoll nach einem Jahr. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und funktionierenden Dienst (Art. 6 Abs. 1 lit. f DSGVO).',
      grades:
        'Noten gehören nicht zu den besonderen Kategorien personenbezogener Daten nach Art. 9 DSGVO. Wir behandeln sie trotzdem vertraulich: Sie sind nur über dein Konto abrufbar und werden nur sichtbar, wenn du selbst einen Plan mit Noten teilst.',
    },
    sharing: {
      heading: '6. Geteilte Pläne',
      body: 'Wenn du einen Plan teilst, erzeugen wir einen zufälligen Link. Wir speichern davon nur einen Prüfwert (Hash), den Zeitpunkt der Erstellung, ob der Link Noten zeigen soll und ob du ihn deaktiviert hast. Wer den Link kennt, sieht den Namen des Plans, Studiengang, Semester und Module und kann den Plan als eigene Kopie ohne Noten übernehmen. Ergebnisse, Noten und den daraus berechneten Schnitt sieht man nur, wenn du beim Erstellen des Links „Mit Noten“ gewählt hast; Prüfungstermine und Zielschnitt sind nie sichtbar. Du kannst den Link jederzeit deaktivieren; er wird zusammen mit dem Plan oder deinem Konto gelöscht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.',
    },
    emails: {
      heading: '7. E-Mails',
      account:
        'Wir schicken dir E-Mails, die für dein Konto nötig sind: die Bestätigung deiner E-Mail-Adresse und Links zum Zurücksetzen deines Passworts (Art. 6 Abs. 1 lit. b DSGVO).',
      reminders:
        'Wenn du auf der Kontoseite E-Mail-Erinnerungen einschaltest, erinnern wir dich an Abmeldefristen und Prüfungstermine, die du in deinen im Konto gespeicherten Plänen eingetragen hast. Die E-Mails enthalten nur Modulnamen und Daten. Damit keine Erinnerung doppelt kommt, speichern wir zu jeder verschickten Erinnerung den Plan, die Modulnummer, die Art und das Datum des Termins sowie den Versandzeitpunkt und löschen diese Einträge 30 Tage nach dem Termin. Du schaltest die Erinnerungen jederzeit auf der Kontoseite oder über den Link in jeder Erinnerung aus. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.',
      provider:
        'Der Versand aller E-Mails erfolgt über <mail/>, der die Daten in unserem Auftrag verarbeitet (Art. 28 DSGVO).',
    },
    assistant: {
      heading: '8. Studienassistent',
      what: 'Angemeldete Nutzerinnen und Nutzer können einem Studienassistenten Fragen zu ihrem Studiengang stellen. Dafür schicken wir deine Frage, den bisherigen Verlauf des Gesprächs und die Studiengangsdaten deines Plans (Modulnamen, Leistungspunkte, Angaben aus dem Modulkatalog, Bereiche und Regeln der Prüfungsordnung) an OpenRouter, Inc. (USA), das die Anfrage an den Anbieter eines Sprachmodells weiterleitet. Wir lassen Anfragen nur an Anbieter weiterleiten, die sie weder speichern noch zum Training verwenden.',
      never:
        'Deine Noten, Ergebnisse und Prüfungsversuche, Prüfungstermine, dein Zielschnitt, von dir angelegte Module, deine Semesterplanung, deine E-Mail-Adresse und dein Name werden nie übermittelt.',
      storage:
        'Wir speichern keine Gespräche: Der Verlauf liegt nur in deinem Browser, bis du ein neues Gespräch beginnst oder die Seite neu lädst. Auf dem Server zählen wir nur, wie viele Nachrichten dein Konto an einem Tag schickt, um ein Tageslimit durchzusetzen, und löschen diese Zähler nach sieben Tagen. Im Browser merken wir uns, dass du den Hinweis vor der ersten Nutzung bestätigt hast.',
      basis:
        'Die Nutzung ist freiwillig; schreib keine persönlichen Daten in deine Fragen. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du mit der Bestätigung des Hinweises erteilst. Da OpenRouter seinen Sitz in den USA hat, werden die Daten in ein Drittland übermittelt. Die Antworten sind unverbindlich.',
    },
    abuse: {
      heading: '9. Schutz vor Missbrauch',
      body: 'Um wiederholte Anmeldeversuche und andere automatisierte Angriffe auf Konten zu begrenzen, speichern wir kurzzeitig einen Zähler je IP-Adresse und aufgerufener Anmeldefunktion. Abrufe geteilter Pläne begrenzen wir ebenso, dafür werden Zähler nur im Arbeitsspeicher gehalten und nicht dauerhaft gespeichert. Rechtsgrundlage ist unser berechtigtes Interesse an der Sicherheit der Konten (Art. 6 Abs. 1 lit. f DSGVO).',
    },
    cookies: {
      heading: '10. Cookies',
      body: 'Nach der Anmeldung setzen wir ein Cookie mit deinem Sitzungsschlüssel, damit du angemeldet bleibst. Es ist für die Anmeldung unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG) und wird beim Abmelden entfernt. Weitere Cookies verwenden wir nicht.',
    },
    rights: {
      heading: '11. Deine Rechte',
      list: 'Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20). Gegen Verarbeitungen auf Grundlage berechtigter Interessen kannst du Widerspruch einlegen (Art. 21).',
      selfService:
        'Auskunft und Datenübertragbarkeit bekommst du jederzeit selbst über „Daten herunterladen“, und dein Konto löschst du selbst, beides auf der <account>Kontoseite</account>. Für alles andere schreib an die oben genannte E-Mail-Adresse.',
      complaint:
        'Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum Beispiel bei der für deinen Wohnort zuständigen.',
    },
    misc: {
      heading: '12. Sonstiges',
      body: 'Die Nutzung ist freiwillig. Ein Konto brauchst du nur, wenn dein Plan auf mehreren Geräten verfügbar sein soll. Es findet keine automatisierte Entscheidungsfindung und kein Profiling statt.',
    },
    updated: 'Stand: September 2026',
  },
}
