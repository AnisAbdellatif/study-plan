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
  areaBelowMinimum: '{{area}}: {{planned}} von mindestens {{min}} eingeplant.',
  areaAboveMaximum: '{{area}}: {{planned}} eingeplant, vorgesehen sind höchstens {{max}}.',
}
