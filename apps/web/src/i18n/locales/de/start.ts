export const start = {
  title: 'Studienplan anlegen',
  intro:
    'Du fügst deinen Studiengang selbst hinzu: Ein Sprachmodell deiner Wahl liest deine Prüfungsordnung und den Modulkatalog aus, und aus seiner Antwort entsteht dein Plan. Die Module werden nach dem Studienverlaufsplan vorsortiert, du kannst sie danach frei verschieben. Du brauchst kein Konto: dein Plan wird nur in diesem Browser gespeichert.',
  loadError:
    'Dein gespeicherter Plan konnte nicht gelesen werden. Eine Kopie der Daten bleibt im Browser erhalten. Du kannst einen exportierten Plan importieren oder neu beginnen.',
  dismiss: 'Ausblenden',
  tryExample: 'Mit Beispiel ausprobieren',
  exampleNote:
    'Das Beispiel ist ein frei erfundener Informatik-Studiengang, der auf keiner echten Prüfungsordnung basiert. Dein Plan beginnt damit im aktuellen Semester.',
  startTerm: 'Studienbeginn',
  winter: 'Wintersemester',
  summer: 'Sommersemester',
  year: 'Jahr',
  semesterTerm: '{{number}}. Semester: {{term}}',
  import: 'Gesicherten Plan wiederherstellen',
  importNote:
    'Für eine Plan-Datei, die du vorher über „Exportieren“ gespeichert hast. Sie enthält deinen ganzen Plan mit Noten und Platzierungen. Eine Studiengangsdatei vom Sprachmodell lädst du dagegen unten unter „Studiengang aus Datei laden“.',
  programmeFile: {
    heading: 'Studiengang aus Datei laden',
    intro:
      'Du hast schon eine Studiengangsdatei, zum Beispiel die programme.json, die ein Sprachmodell mit unserem Prompt erstellt hat, oder eine Datei von jemandem aus deinem Studiengang? Dann lade sie direkt hier. Hochschule, Studiengang und Abschluss stehen in der Datei, du musst sie nicht eingeben.',
    choose: 'Studiengangsdatei auswählen',
    fileInput: 'Studiengangsdatei (JSON) auswählen',
    loaded: 'Geladen: {{name}}',
    notABackup:
      'Die Datei enthält nur Module und Regeln des Studiengangs, keine Noten. Daraus entsteht ein neuer, leerer Plan.',
    readError: 'Die Datei konnte nicht gelesen werden.',
  },
  orSteps: 'Noch keine Studiengangsdatei? Dann erstellst du sie in vier Schritten mit einem Sprachmodell:',
  haveAccount: 'Schon ein Konto? Anmelden',
  backToPlan: 'Zurück zu deinem Plan',
  replace: {
    title: 'Bestehenden Plan ersetzen?',
    description:
      'In diesem Browser gibt es schon einen Plan. Der neue Plan ersetzt ihn mitsamt allen eingetragenen Noten. Exportiere den alten Plan vorher, wenn du ihn behalten willst.',
    confirm: 'Ersetzen',
  },
}
