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
    privacy: 'Welche Daten wir speichern, steht in der <privacyLink>Datenschutzerklärung</privacyLink>.',
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
    adminLink: 'Zur Verwaltung',
    plan: {
      title: 'Plan',
      signedInAs: 'Angemeldet als <strong>{{email}}</strong>.',
      upload: 'Plan im Konto sichern',
      retry: 'Erneut versuchen',
      open: 'Zum Plan',
      create: 'Plan anlegen',
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
    choosePlan: {
      title: 'Welchen Plan möchtest du behalten?',
      description:
        'In deinem Konto liegt „{{remote}}“, zuletzt gespeichert am {{time}}. In diesem Browser gibt es „{{local}}“. Der andere Plan wird ersetzt.',
      fallbackName: 'einen Plan',
      keepBrowser: 'Plan aus diesem Browser behalten',
      loadAccount: 'Plan aus dem Konto laden',
    },
    banner: {
      uploadText: 'Sichere deinen Plan im Konto, dann ist er auf allen deinen Geräten verfügbar.',
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
