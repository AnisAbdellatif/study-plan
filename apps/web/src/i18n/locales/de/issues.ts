export const issues = {
  season: {
    winter: 'Wintersemester',
    summer: 'Sommersemester',
  },
  or: ' oder ',
  and: ' und ',
  wrongTerm: '{{name}} wird nur im {{season}} angeboten, ist aber im {{term}} geplant.',
  wrongTermCard: 'Nur im {{season}} angeboten',
  irregularOffering: '{{name}} wird unregelmäßig angeboten. Prüfe das aktuelle Lehrangebot.',
  irregularOfferingCard: 'Wird unregelmäßig angeboten',
  prerequisiteNotPassed:
    '{{name}} setzt Module voraus, die nicht rechtzeitig bestanden sind. {{reasons}} Verschiebe {{name}} in ein späteres Semester oder trag das Ergebnis nach, falls du bestanden hast.',
  prerequisiteNotPassedCard: 'Voraussetzung nicht bestanden: {{prerequisites}}',
  prerequisiteSemesterOver: '{{prerequisite}} war für {{term}} geplant und ist nicht bestanden.',
  prerequisiteExhausted: '{{prerequisite}} kann nicht mehr bestanden werden, alle Versuche sind verbraucht.',
  missingPrerequisite: '{{name}} setzt {{missing}} voraus. Plane das vorher ein.',
  missingPrerequisiteCard: 'Voraussetzung fehlt: {{missing}}',
  notEnoughCredits: '{{name}} setzt {{required}} voraus, bis dahin sind {{available}} eingeplant.',
  notEnoughCreditsCard: 'Erst ab {{required}}',
  attemptsExhausted:
    '{{name}}: alle {{max}} Versuche sind ohne Bestehen verbraucht. Bei Pflicht- und Wahlpflichtmodulen bedeutet das meist das endgültige Nichtbestehen. Sprich mit dem Prüfungsamt oder der Studienberatung.',
  attemptsExhaustedCard: 'Keine Versuche mehr',
  lastAttempt: '{{name}}: nur noch ein Versuch von {{max}} übrig.',
  lastAttemptSupplementaryGraded:
    'Fällst du im letzten Versuch durch eine Klausur, folgt erst eine Ergänzungsprüfung, danach ist höchstens {{grade}} möglich.',
  lastAttemptSupplementaryPassFail:
    'Fällst du im letzten Versuch durch eine Klausur, folgt erst eine Ergänzungsprüfung, danach ist nur „bestanden“ möglich.',
  lastAttemptCard: 'Letzter Versuch',
  retakenAfterPass:
    '{{name}} ist nach dem Bestehen noch einmal eingetragen. Laut Prüfungsordnung lassen sich bestandene Prüfungen nicht wiederholen.',
  retakenAfterPassCard: 'Nach dem Bestehen wiederholt',
  alternativesConflict:
    '{{names}} schließen sich gegenseitig aus. Laut Prüfungsordnung zählt nur eine davon, plane nur eine ein.',
  alternativesConflictCard: 'Nur eine der Alternativen möglich',
  areaBelowMinimum: '{{area}}: {{planned}} von mindestens {{min}} eingeplant.',
  areaAboveMaximum: '{{area}}: {{planned}} eingeplant, vorgesehen sind höchstens {{max}}.',
  areaChoiceMissing:
    '{{choice}}: noch keine Wahl getroffen. Wähle unter „Nicht eingeplant“ einen der Bereiche, dann zählen seine Pflichtmodule und Leistungspunkte.',
  areaChoiceConflict:
    '{{choice}}: Gewählt ist {{chosen}}, eingeplant sind aber auch Module aus {{areas}}. Diese zählen dafür nicht.',
  areaChoiceConflictUnchosen:
    '{{choice}}: Module aus {{areas}} sind eingeplant. Laut Prüfungsordnung wählst du nur einen dieser Bereiche.',
  recognitionPlanned: '{{name}} soll anerkannt werden. Stell den Antrag rechtzeitig beim Prüfungsamt.',
  recognitionRequested:
    'Die Anerkennung von {{name}} ist beantragt. Bis zur Entscheidung zählen die Leistungspunkte noch nicht.',
  recognitionRejected:
    'Die Anerkennung von {{name}} wurde abgelehnt. Plane das Modul ein, um es selbst abzulegen.',
  recognitionWithoutResult:
    '{{name}} ist anerkannt, aber noch ohne Ergebnis. Trag die anerkannte Note oder „bestanden“ ein, damit die Leistungspunkte zählen.',
  recognitionWithoutResultCard: 'Anerkannt, Ergebnis fehlt',
  leaveSemesterModules:
    '{{term}} ist ein Urlaubssemester, trotzdem ist dort {{names}} eingeplant. Ob Prüfungen im Urlaubssemester erlaubt sind, regelt deine Prüfungsordnung.',
}
