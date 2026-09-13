export const start = {
  title: 'Studienplan anlegen',
  intro:
    'Wähle deinen Studiengang aus den Vorlagen oder füge ihn selbst hinzu: Ein Sprachmodell deiner Wahl liest deine Prüfungsordnung und den Modulkatalog aus, und aus seiner Antwort entsteht dein Plan. Die Module werden nach dem Studienverlaufsplan vorsortiert, du kannst sie danach frei verschieben. Du brauchst kein Konto: dein Plan wird nur in diesem Browser gespeichert.',
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
  presets: {
    heading: 'Studiengang auswählen',
    intro:
      'Für einige Studiengänge gibt es fertige Vorlagen. Such nach Hochschule, Studiengang, Abschluss oder Version der Prüfungsordnung.',
    label: 'Studiengang suchen',
    placeholder: 'z. B. Informatik Hannover',
    hint: 'Mit den Pfeiltasten wählst du einen Treffer aus, mit Enter übernimmst du ihn.',
    results_one: '{{count}} Studiengang gefunden',
    results_other: '{{count}} Studiengänge gefunden',
    noMatches: 'Kein Studiengang passt zu deiner Suche.',
    loading: 'Studiengänge werden geladen…',
    empty: 'Noch sind keine Studiengänge hinterlegt.',
    loadError:
      'Die Studiengänge konnten gerade nicht geladen werden. Du kannst deinen Studiengang trotzdem unten aus einer Datei laden oder mit einem Sprachmodell erstellen.',
    loadingPreset: 'Studiengang wird geladen…',
    presetError:
      'Dieser Studiengang konnte nicht geladen werden. Wähle ihn noch einmal aus, um es erneut zu versuchen.',
    alternatives:
      'Dein Studiengang ist nicht dabei? Lade eine Studiengangsdatei oder erstelle sie mit einem Sprachmodell.',
  },
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
