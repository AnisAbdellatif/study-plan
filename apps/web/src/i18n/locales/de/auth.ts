export const auth = {
  errors: {
    passwordTooShort: 'Das Passwort muss mindestens {{min}} Zeichen lang sein.',
    userExists:
      'Mit dieser E-Mail-Adresse gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.',
    invalidToken: 'Der Link ist ungültig oder abgelaufen. Fordere einen neuen an.',
    invalidCredentials: 'E-Mail-Adresse oder Passwort stimmen nicht.',
    emailNotVerified:
      'Bitte bestätige zuerst deine E-Mail-Adresse über den Link, den wir dir geschickt haben.',
    tooManyAttempts: 'Zu viele Versuche. Bitte warte eine Minute und versuche es dann noch einmal.',
    generic: 'Das hat nicht geklappt. Bitte versuche es später noch einmal.',
    passwordsDiffer: 'Die beiden Passwörter stimmen nicht überein.',
    wrongPassword: 'Das Passwort stimmt nicht.',
  },
  fields: {
    email: 'E-Mail-Adresse',
    password: 'Passwort',
  },
  signIn: {
    title: 'Anmelden',
    intro:
      'Mit einem Konto ist dein Plan auf allen deinen Geräten verfügbar und nicht nur in diesem Browser.',
    verificationResent: 'Wir haben dir eine neue Bestätigungs-E-Mail geschickt.',
    resendVerification: 'Bestätigungs-E-Mail erneut senden',
    submit: 'Anmelden',
    pending: 'Wird angemeldet…',
    forgotPassword: 'Passwort vergessen?',
    noAccount: 'Noch kein Konto? Registrieren',
  },
  signUp: {
    title: 'Konto erstellen',
    intro:
      'Dein Plan aus diesem Browser lässt sich danach im Konto sichern. Wir brauchen nur deine E-Mail-Adresse und ein Passwort.',
    passwordHint:
      'Mindestens {{min}} Zeichen. Ein langer Satz ist leichter zu merken als ein kurzes, kompliziertes Passwort.',
    privacyConsent:
      'Ich habe die <privacyLink>Datenschutzerklärung</privacyLink> gelesen und akzeptiere sie.',
    submit: 'Konto erstellen',
    pending: 'Wird erstellt…',
    haveAccount: 'Schon ein Konto? Anmelden',
    checkTitle: 'Bestätige deine E-Mail-Adresse',
    checkText:
      'Wir haben dir eine E-Mail an <strong>{{email}}</strong> geschickt. Öffne den Link darin, dann ist dein Konto aktiv und du bist angemeldet. Der Link ist eine Stunde gültig.',
    resent: 'Wir haben dir die E-Mail noch einmal geschickt.',
    resend: 'E-Mail erneut senden',
  },
  forgotPassword: {
    title: 'Passwort vergessen',
    sent: 'Falls es ein Konto mit dieser Adresse gibt, haben wir dir einen Link zum Zurücksetzen geschickt. Er ist eine Stunde gültig.',
    submit: 'Link anfordern',
    back: 'Zurück zur Anmeldung',
    gradesWarning:
      'Deine Noten sind mit deinem Passwort verschlüsselt. Nach dem Zurücksetzen lassen sich die bisher gespeicherten Noten nur mit dem früheren Passwort wiederherstellen. Bist du auf einem Gerät noch angemeldet, exportiere dort vorher deinen Plan.',
  },
  resetPassword: {
    invalidTitle: 'Link ungültig',
    requestNew: 'Neuen Link anfordern',
    title: 'Neues Passwort festlegen',
    done: 'Dein Passwort ist geändert. Andere Anmeldungen wurden beendet.',
    signInNow: 'Jetzt anmelden',
    newPassword: 'Neues Passwort',
    repeatPassword: 'Passwort wiederholen',
    submit: 'Passwort speichern',
    gradesWarning:
      'Noten, die mit deinem bisherigen Passwort verschlüsselt sind, lassen sich danach nur mit dem bisherigen Passwort wiederherstellen.',
  },
  reminders: {
    title: 'E-Mail-Erinnerungen',
    intro:
      'Wir schreiben dir 3 Tage vor dem letzten Tag zur Abmeldung und 7 Tage vor einer Prüfung. Grundlage sind die Prüfungstermine in deinen im Konto gespeicherten Plänen. Die E-Mails enthalten nur Modulnamen und Daten.',
    error: 'Die Einstellung ließ sich nicht laden oder speichern. Bitte versuche es später noch einmal.',
    label: 'An Abmeldefristen und Prüfungen erinnern',
  },
  unsubscribe: {
    title: 'E-Mail-Erinnerungen ausschalten',
    incomplete:
      'Der Link ist unvollständig. Öffne ihn direkt aus der E-Mail oder schalte die Erinnerungen im Konto aus.',
    done: 'Erinnerungen sind ausgeschaltet. Auf der Kontoseite kannst du sie jederzeit wieder einschalten.',
    invalid: 'Der Link ist ungültig oder abgelaufen. Du kannst die Erinnerungen im Konto ausschalten.',
    explanation: 'Du bekommst dann keine Erinnerungen an Abmeldefristen und Prüfungen mehr.',
    submit: 'Erinnerungen ausschalten',
    toAccount: 'Zum Konto',
  },
  account: {
    loadingTitle: 'Konto',
    title: 'Dein Konto',
    verified: 'Deine E-Mail-Adresse ist bestätigt. Willkommen!',
    adminLink: 'Verwaltung',
    backToPlan: 'Zurück zu deinem Plan',
    backHome: 'Zur Startseite',
    password: {
      title: 'Passwort ändern',
      intro:
        'Aus Sicherheitsgründen änderst du dein Passwort über einen Link, den wir dir per E-Mail schicken. Er ist eine Stunde gültig und funktioniert nur einmal.',
      submit: 'Link zum Ändern senden',
      pending: 'Wird gesendet…',
      resend: 'Link erneut senden',
      sent: 'Wir haben dir einen Link an <strong>{{email}}</strong> geschickt. Nach dem Ändern wirst du auf allen Geräten abgemeldet und meldest dich mit dem neuen Passwort wieder an.',
    },
    plan: {
      title: 'Plan',
      signedInAs: 'Angemeldet als <strong>{{email}}</strong>.',
      upload: 'Plan im Konto sichern',
      retry: 'Erneut versuchen',
      open: 'Zum Plan',
      create: 'Plan anlegen',
    },
    plans: {
      title: 'Deine Pläne',
      usage: '{{used}} von {{limit}} Plänen belegt.',
      usageUnlimited_one: '{{count}} Plan angelegt. Als Admin hast du kein Limit.',
      usageUnlimited_other: '{{count}} Pläne angelegt. Als Admin hast du kein Limit.',
      loadError: 'Deine Pläne ließen sich nicht laden.',
      empty: 'Noch kein Plan im Konto.',
      open: 'in diesem Browser geöffnet',
      updated: 'Geändert {{time}}',
      delete: 'Löschen…',
      deleteLabel: '{{name}} löschen',
      deleteError: 'Der Plan konnte nicht gelöscht werden. Bitte versuche es noch einmal.',
      confirmTitle: 'Plan löschen?',
      confirmDescription:
        '„{{name}}“ wird mit allen Noten und geteilten Links aus deinem Konto gelöscht. Das lässt sich nicht rückgängig machen.',
      confirm: 'Plan löschen',
    },
    data: {
      title: 'Deine Daten',
      intro:
        'Lade alles herunter, was zu deinem Konto gespeichert ist: E-Mail-Adresse, Pläne mit Noten und aktive Anmeldungen.',
      exportError: 'Der Download hat nicht geklappt. Bitte versuche es noch einmal.',
      exportFilename: 'studienplaner-daten.json',
      download: 'Daten herunterladen (JSON)',
      signOut: 'Abmelden',
    },
    delete: {
      title: 'Konto löschen',
      intro:
        'Löscht dein Konto und alle Pläne darin endgültig vom Server. Der Plan in diesem Browser bleibt erhalten, bis du ihn selbst löschst.',
      passwordLabel: 'Passwort zur Bestätigung',
      submit: 'Konto löschen…',
      confirmTitle: 'Konto endgültig löschen?',
      confirmDescription:
        'Dein Konto und alle im Konto gespeicherten Pläne werden sofort gelöscht. Das lässt sich nicht rückgängig machen.',
      confirm: 'Endgültig löschen',
      superadmin:
        'Das ist das Superadmin-Konto. Es lässt sich nicht löschen, damit die Plattform immer einen Verantwortlichen hat.',
    },
  },
  button: {
    signIn: 'Anmelden',
    account: 'Konto',
    manageAccount: 'Konto verwalten',
    signOut: 'Abmelden',
  },
  sync: {
    browserOnly: 'Nur in diesem Browser gespeichert',
    connecting: 'Verbinde mit dem Konto…',
    notInAccount: 'Noch nicht im Konto gesichert',
    choose: 'Plan auswählen',
    saving: 'Wird gespeichert…',
    synced: 'Im Konto gespeichert, {{time}}',
    failed: 'Speichern im Konto fehlgeschlagen',
    locked: 'Noten gesperrt, Passwort nötig',
    gradesUnreadable: 'Gespeicherte Noten nicht lesbar',
    grades: {
      lockedTitle: 'Noten auf diesem Gerät entsperren',
      lockedText:
        'Deine Noten sind verschlüsselt gespeichert, nur du kannst sie lesen. Gib dein Passwort ein, um sie auf diesem Gerät zu entschlüsseln.',
      unlock: 'Entsperren',
      signOut: 'Abmelden',
      wrongPassword: 'Das Passwort stimmt nicht.',
      unreadableTitle: 'Gespeicherte Noten nicht lesbar',
      unreadableText:
        'Die Noten in deinem Konto wurden mit einem früheren Passwort verschlüsselt, zum Beispiel vor dem Zurücksetzen. Mit dem früheren Passwort lassen sie sich wiederherstellen, sonst nicht mehr.',
      previousPassword: 'Früheres Passwort',
      stillUnreadable: 'Mit diesem Passwort lassen sich die Noten nicht entschlüsseln.',
      discard: 'Ohne diese Noten weiter…',
      discardTitle: 'Ohne die gespeicherten Noten weitermachen?',
      discardText:
        'Dein Plan wird ohne Noten und Zielschnitt geladen und so im Konto gespeichert. Die verschlüsselten Noten sind danach endgültig verloren.',
      discardConfirm: 'Ohne Noten weiter',
    },
    choosePlan: {
      title: 'Welchen Plan möchtest du behalten?',
      description:
        'In deinem Konto liegt „{{remote}}“, zuletzt gespeichert am {{time}}. In diesem Browser gibt es „{{local}}“. Der andere Plan wird ersetzt.',
      fallbackName: 'einen Plan',
      keepBrowser: 'Plan aus diesem Browser behalten',
      loadAccount: 'Plan aus dem Konto laden',
    },
    banner: {
      upload: 'Im Konto sichern',
      errorText:
        'Dein Plan konnte gerade nicht im Konto gespeichert werden. Die Änderungen bleiben in diesem Browser.',
      retry: 'Erneut versuchen',
      remoteNewerText:
        'Dein Plan wurde inzwischen auf einem anderen Gerät geändert. Die neuere Version aus dem Konto ist geladen, deine letzte Änderung hier wurde nicht übernommen.',
      dismiss: 'Verstanden',
    },
  },
}
