import { z } from 'zod'
import { presetSchema } from '../schema/preset.ts'
import type { CustomProgrammeInput } from './response.ts'

const DEGREE = { bsc: 'Bachelor of Science (B.Sc.)', msc: 'Master of Science (M.Sc.)' } as const

/** The JSON Schema of a preset, generated from the Zod schema so the prompt never drifts from what we accept. */
export const presetJsonSchema = (): string =>
  JSON.stringify(z.toJSONSchema(presetSchema, { io: 'input', unrepresentable: 'any' }))

const EXAMPLE = {
  schemaVersion: 1,
  id: 'custom/placeholder',
  university: { slug: 'beispiel-universitaet', name: 'Beispiel-Universität' },
  programme: { slug: 'informatik-bsc', name: 'Informatik', degree: 'bsc' },
  poVersion: 'Prüfungsordnung Informatik B.Sc. vom 01.10.2024',
  handbookVersion: 'Modulhandbuch Informatik B.Sc., Stand 01.09.2025',
  standardSemesters: 6,
  totalCredits: 180,
  creditLabel: 'LP',
  codesAreOfficial: true,
  examRules: { withdrawalDaysBeforeExam: 7, maxAttempts: 3, retakePassedExams: false },
  notes:
    'Gesamtnote (§ 18 PO): LP-weighted mean of the Fachnoten Grundlagen and Vertiefung, each truncated after the first decimal; the Bachelorarbeit counts twice. Assumption: the Studienverlaufsplan in the Modulhandbuch (p. 4) is for winter starters.',
  gradeRules: {
    allowedValues: [1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0, 5.0],
    passThreshold: 4.0,
    attemptSelection: 'best',
    finalRounding: { mode: 'truncate', precision: 1 },
    aggregation: {
      id: 'gesamtnote',
      label: 'Gesamtnote',
      weightMode: 'credits',
      children: [
        {
          kind: 'group',
          node: {
            id: 'grundlagen',
            label: 'Grundlagen',
            weightMode: 'credits',
            roundResult: { mode: 'truncate', precision: 1 },
            children: [{ kind: 'module', code: 'INF-101' }],
          },
        },
        { kind: 'module', code: 'BA', factor: 2 },
      ],
    },
  },
  modules: [
    {
      code: 'INF-101',
      name: 'Programmieren I',
      credits: 8,
      grading: 'graded',
      countsTowardAverage: true,
      category: 'Grundlagen',
      offering: 'winter',
      typicalSemester: 1,
      details: {
        englishName: 'Programming I',
        responsible: ['Prof. Dr. Erika Muster'],
        lecturers: ['Prof. Dr. Erika Muster'],
        languages: ['deutsch'],
        frequency: 'jedes Wintersemester',
        durationSemesters: 1,
        sws: 6,
        courses: [
          { type: 'Vorlesung', sws: 4 },
          { type: 'Übung', sws: 2 },
        ],
        workload: { totalHours: 240, contactHours: 90, selfStudyHours: 150 },
        examForms: ['Klausur (120 Min.)'],
        courseworkRequirements: ['Übungsaufgaben'],
        participationRequirements: 'keine',
        recommendedPrerequisites: 'Schulkenntnisse in Mathematik',
        learningOutcomes: 'Die Studierenden können einfache Programme entwerfen und testen.',
        content: '- Datentypen und Kontrollstrukturen\n- Objektorientierung',
        literature: ['Ullenboom: Java ist auch eine Insel'],
        additionalFields: [{ label: 'Angebot im WS 2025/26', value: 'Lehrveranstaltung und Prüfung' }],
      },
    },
    {
      code: 'SQ-1',
      name: 'Wissenschaftliches Arbeiten',
      credits: 4,
      grading: 'pass_fail',
      countsTowardAverage: false,
      category: 'Schlüsselkompetenzen',
      offering: 'both',
      typicalSemester: 3,
    },
    {
      code: 'BA',
      name: 'Bachelorarbeit',
      credits: 12,
      grading: 'graded',
      countsTowardAverage: true,
      category: 'Abschluss',
      offering: 'both',
      typicalSemester: 6,
      requiresCredits: 120,
      maxAttempts: 2,
    },
  ],
  areas: [{ id: 'grundlagen', name: 'Grundlagen', minCredits: 8, moduleCodes: ['INF-101'] }],
}

function existingSection(modules: ExtractionPromptOptions['existingModules']): string {
  if (!modules?.length) return ''
  const list = modules.map((module) => `- \`${module.code}\`: ${module.name}`).join('\n')
  return `# Existing plan

The student already has a plan for this programme and wants to update it, for example to a newer PO or an updated Modulkatalog. These are the modules of the current plan:

${list}

Keep exactly these codes for modules that continue in the documents, including modules that the new PO or its transition rules (Übergangsbestimmungen, Äquivalenzliste) declare equivalent under a new name or number. This rule takes precedence over official module numbers: if the official number changed, keep the old code and record the new number in \`details.additionalFields\` as {"label": "Modulnummer", "value": "..."}. Create new codes only for modules that did not exist before, and never reuse an old code for a different module. In \`notes\`, list which old modules continue under a new name and which no longer exist.

`
}

/**
 * The instructions a student gives an LLM of their choice together with the Prüfungsordnung and the
 * Modulkatalog. English works best across models; extracted texts stay in the documents' language.
 */
export interface ExtractionPromptOptions {
  /**
   * Modules of the student's current plan when they update it, e.g. to a newer PO or an updated Modulkatalog.
   * The LLM keeps these codes for modules that continue, so results and placements carry over.
   */
  existingModules?: readonly { code: string; name: string }[]
}

export function buildExtractionPrompt(
  input: CustomProgrammeInput,
  options: ExtractionPromptOptions = {},
): string {
  const programme = [
    `- University: ${input.universityName.trim()}`,
    `- Degree programme: ${input.programmeName.trim()}`,
    `- Degree: ${DEGREE[input.degree]}`,
    ...(input.poVersion?.trim() ? [`- Examination regulations version: ${input.poVersion.trim()}`] : []),
  ].join('\n')

  return `# Task

You extract structured data about one degree programme at a German university for a study planner. The planner places modules into semesters, checks prerequisites and credit requirements, reminds students of exam deadlines, and computes the final grade (Gesamtnote/Durchschnittsnote) exactly as the regulations prescribe.

The student attached two official documents:
1. the Prüfungsordnung (PO, examination regulations), possibly with amendments and annexes (Anlagen),
2. the Modulkatalog or Modulhandbuch (module handbook), possibly with a Studienverlaufsplan (recommended study plan).

The programme:
${programme}

${existingSection(options.existingModules)}Read both documents completely before answering. If a document is missing or unreadable, say so in one sentence instead of guessing.

# Output format

The result is long, and long chat answers are often cut off or hard to copy. So if you can create files (for example with a code interpreter, canvas or file tool), save the JSON object as a downloadable file named \`programme.json\` and reply only with one sentence saying the file is ready. If you cannot create files, reply with exactly one JSON object in a single \`\`\`json code block and nothing else: no explanation before or after it. Either way, the object must validate against the JSON Schema at the end of this prompt. Standard JSON only: double quotes, no comments, no trailing commas, numbers as numbers (write 2.5, not "2,5").

# General rules

- Only use information from the documents. Never invent modules, credits, people or rules.
- Copy names, titles and descriptive texts verbatim in the language of the documents. Do not translate or summarize them.
- The PO wins over the Modulkatalog when they disagree. Record every conflict in \`notes\`.
- Only include this programme. Ignore other programmes, degrees and PO versions that appear in the same document.
- Omit optional fields that the documents do not fill, or that only say "-", "n. a." or "keine Angabe". Keep an explicit "keine" (none) where it carries information, e.g. for participation requirements.
- If a required value cannot be determined, choose the most defensible value and explain it in \`notes\`.
- In long texts keep paragraphs with "\\n" and write list items as lines starting with "- ".

# Top-level fields

- \`schemaVersion\`: always 1. \`id\`: always "custom/placeholder" (the planner replaces it).
- \`university\` and \`programme\`: the names above; \`slug\` is the name in lowercase with dashes (the planner replaces them too). \`programme.degree\`: "bsc" or "msc".
- \`poVersion\`: title and date of the PO including the latest amendment used, e.g. "PO 2017 in der Fassung vom 01.09.2026".
- \`handbookVersion\`: title and edition or "Stand" date of the Modulkatalog.
- \`standardSemesters\`: Regelstudienzeit in semesters. \`totalCredits\`: credits required for the degree.
- \`creditLabel\`: "LP" if the documents say Leistungspunkte, "ECTS" if they say ECTS or ECTS-Punkte, "CP" if they say Credit Points.
- \`codesAreOfficial\`: true if the documents give module numbers (Modulnummer, Kennnummer, Modul-Nr.), otherwise false.
- \`notes\`: plain text for the student. Start with one paragraph that explains in words how the Gesamtnote is calculated, citing the paragraph (§) of the PO. Then list assumptions, conflicts between the documents, rules that the schema cannot express, and anything you could not find. Cite § and page numbers.

# Exam rules (\`examRules\`, from the PO)

- \`withdrawalDaysBeforeExam\`: the number of days before a written exam (Klausur) until which students can withdraw (Rücktritt, Abmeldung). Only if the PO gives a fixed number of days; describe other rules in \`notes\`.
- \`maxAttempts\`: attempts per exam including the first one. "Eine nicht bestandene Prüfung kann zweimal wiederholt werden" means 3.
- \`retakePassedExams\`: true if passed exams may be retaken to improve the grade (Notenverbesserung, Freiversuch); false if the PO says passed exams cannot be repeated.
- \`supplementaryExamOnLastAttempt\`: true if a failed last attempt of a written exam is followed by an oral supplementary exam (mündliche Ergänzungsprüfung) before the exam counts as finally failed.

# Modules (\`modules\`)

One entry for every module a student can take in this programme: compulsory (Pflicht), compulsory elective (Wahlpflicht), elective (Wahl), key competences (Schlüsselkompetenzen, Studium Generale), internships, seminars, projects and the thesis. List a thesis colloquium separately only if the PO treats it as its own module.

- \`code\`: the official module number. If the documents have none, create short unique codes (for example "PROG1") and set \`codesAreOfficial\` to false. Codes must be unique.
- \`name\`: the German module title, verbatim.
- \`credits\`: credits of the module (whole or half numbers).
- \`grading\`: "graded" if the module ends with a numeric grade, "pass_fail" if it is ungraded (unbenotet, bestanden/nicht bestanden, Studienleistung only).
- \`countsTowardAverage\`: false for modules the PO excludes from the Gesamtnote (ungraded modules, excluded key competences, additional modules); otherwise true.
- \`category\`: the name of the area the module belongs to (Kompetenzbereich, Studienbereich, Modulgruppe), as the PO names it.
- \`offering\`: "winter" if the module is only offered in the winter semester, "summer" if only in the summer semester, "both" if every semester, "irregular" if irregular or by announcement.
- \`typicalSemester\`: the recommended semester from the Studienverlaufsplan for students who start in the winter semester (1 = first semester). Omit it for electives without a recommendation. When the plan recommends a slot such as "Proseminar" or "Wahlpflichtmodul" in a semester, give that semester to every module that can fill the slot.
- \`elective\`: true for modules the student picks among alternatives, e.g. one Proseminar out of many, courses from a Wahlpflicht or Studium Generale catalogue. The planner leaves them unplanned so the student chooses. Omit it for compulsory modules.
- \`prerequisites\`: only binding admission requirements for the module, as module codes. Use \`{"anyOf": ["A", "B"]}\` when one of several modules is enough. Recommendations are not prerequisites; they belong in \`details.recommendedPrerequisites\`.
- \`requiresCredits\`: minimum credits a student must have earned before taking the module, e.g. 120 for a thesis that requires "mindestens 120 LP".
- \`maxAttempts\`: only if this module has a different attempt limit than \`examRules.maxAttempts\` (often the thesis).
- \`details\`: the descriptive fields of the module's Modulkatalog entry, see below. Fill them for every module that has a catalog entry.

# Module details (\`modules[].details\`, from the Modulkatalog)

Map every field of the catalog entry. Labels differ between universities; use the closest match:

| Label in the Modulkatalog | JSON field |
|---|---|
| Englischer Titel, English title | \`englishName\` |
| Modulverantwortliche(r), Modulverantwortung, Modulkoordination | \`responsible\` (list of names) |
| Dozent/in, Lehrende, Lehrperson | \`lecturers\` (list) |
| Prüfer/in | \`examiners\` (list) |
| Organisationseinheit, Institut, Fakultät, Lehreinheit, Zuständigkeit | \`organisationalUnit\` |
| Sprache, Unterrichtssprache, Lehrsprache | \`languages\` (list, verbatim, e.g. ["deutsch", "englisch"]) |
| Turnus, Angebotshäufigkeit, Häufigkeit des Angebots, regelhaftes Lehrangebot | \`frequency\` (verbatim) and also the top-level \`offering\` |
| Dauer des Moduls | \`durationSemesters\` |
| SWS, Semesterwochenstunden, Kontaktzeit in SWS | \`sws\` (total) and \`courses\`: e.g. "2V + 2Ü" becomes [{"type": "Vorlesung", "sws": 2}, {"type": "Übung", "sws": 2}]. Expand abbreviations using the document's legend (V = Vorlesung, Ü = Übung, S = Seminar, P = Praktikum, L = Labor); add \`title\` if a course has its own title |
| Arbeitsaufwand, Workload, Studentische Arbeitsleistung, Präsenzzeit, Selbststudium | \`workload\`: \`totalHours\`, \`contactHours\`, \`selfStudyHours\` |
| Prüfungsleistung, Prüfungsform, Art der Prüfung | \`examForms\` (list, verbatim including duration, e.g. "Klausur (90 Min.)"; resolve abbreviations such as K = Klausur, M = mündliche Prüfung via the legend) |
| Prüfungsanmeldung | \`examRegistration\` |
| Studienleistung, Prüfungsvorleistung, Leistungsnachweis | \`courseworkRequirements\` (list) |
| Prüfungsbewertung, Benotung, Zusammensetzung der Modulnote | \`gradingNote\` |
| Teilnahmevoraussetzungen (binding) | \`participationRequirements\` |
| Empfohlene Vorkenntnisse, Empfehlungen | \`recommendedPrerequisites\`. If one field holds both ("Teilnahmevoraussetzungen und -empfehlungen"), split it when the text distinguishes binding requirements from recommendations; otherwise put the whole text in \`participationRequirements\` |
| Qualifikationsziele, Lernziele, Lernergebnisse, Kompetenzen | \`learningOutcomes\` |
| Inhalt, Inhalte, Lehrinhalte | \`content\` |
| Literatur, Literaturempfehlungen | \`literature\` (one list entry per reference) |
| Lehr- und Lernformen, Lehrmethoden, Medienformen | \`teachingMethods\` |
| Verwendbarkeit, Einordnung in Studiengänge | \`usability\` |
| Schwerpunkt, Micro-Degree, Studienrichtung | \`specialisations\` (list) |
| Webseite, Homepage, Link | \`website\` |
| Weitere Angaben, Bemerkungen, Sonstiges | \`remarks\` |
| Any other field (e.g. "Angebot im WS 2026/27", "zuletzt angeboten", Prüfungsnummer, Gewichtung) | \`additionalFields\`: [{"label": verbatim label, "value": verbatim value}] |

Prefer a downloadable file for long results. If you can only reply in the chat and your answer would become too long for one reply, keep every module with all fields except \`details\`, add \`details\` for as many modules as fit in catalog order, and write in \`notes\` which modules still lack details.

# Areas (\`areas\`)

The areas of the programme with their credit requirements (Kompetenzbereiche, Studienbereiche, Pflicht- and Wahlpflichtbereiche, Schlüsselkompetenzen, Abschlussarbeit). \`id\`: lowercase letters, digits and dashes. \`minCredits\` and \`maxCredits\`: the credits required from the area; omit \`maxCredits\` if there is no upper limit. \`moduleCodes\`: the codes of all modules in the area. For choice lists, \`minCredits\` and \`maxCredits\` are the credits the student must choose, not the total of all listed modules (e.g. one 5 LP Proseminar out of 14 gives an area with maxCredits 5, or 10 together with a compulsory 5 LP module).

# Grade calculation (\`gradeRules\`)

This is the most important part. Read the PO paragraph on the Gesamtnote (often "Bildung der Noten", "Bewertung", "Gesamtnote") and any annex with weights.

- \`allowedValues\`: every grade a module can end up with. Usually [1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0, 5.0]. If module grades are averages of several graded parts and are not rounded back to these steps, include every tenth from 1.0 to 4.0 plus 5.0, and list the exam steps in \`standardGrades\`.
- \`passThreshold\`: the worst passing grade, usually 4.0.
- \`attemptSelection\`: "best" if the better of several passing attempts counts, "latest" if the most recent one counts. Use "best" if passed exams cannot be retaken.
- \`finalRounding\`: how the Gesamtnote is rounded. "Es wird nur die erste Dezimalstelle hinter dem Komma berücksichtigt; alle weiteren Stellen werden ohne Rundung gestrichen" means {"mode": "truncate", "precision": 1}. Commercial rounding means "round_half_up". Rounding to the nearest allowed grade means "round_to_nearest_allowed_ties_better".
- \`aggregation\`: a tree that computes the Gesamtnote. Every node is a weighted mean of its children.
  - \`weightMode\` "credits": each module weighs its credits (override with \`weight\`, e.g. 12 when a 15-credit thesis counts with 12); a group weighs the credits counted inside it unless it has a \`weight\`.
  - \`weightMode\` "fixed": every child needs an integer \`weight\`, e.g. 15 and 146 for "Bachelorarbeit 15/161, übrige Module 146/161".
  - \`factor\` on a module: multiplies its weight, e.g. 2 for a thesis that counts double.
  - \`roundResult\` on a node: round or truncate this node's value before the parent uses it, e.g. Fachnoten truncated after the first decimal.
  - \`dropWorst\`: {"maxCredits": N} drops the worst-graded modules directly in this node up to N credits (Streichregel).
  - \`keepBest\`: {"maxCredits": N, "quotas": [...]} keeps only the best-graded modules directly in this node up to N credits, e.g. "only the best electives needed to reach the required credits count". A quota reserves \`minCredits\` (and caps \`maxCredits\`) for the modules listed in \`codes\`, which must be direct module children of that node. Never combine \`dropWorst\` and \`keepBest\` in one node.
  - A plain credit-weighted mean of all graded modules is a single root node with every counted module as a child.
  - Every module with \`grading\` "graded" and \`countsTowardAverage\` true appears exactly once in the tree. Ungraded or excluded modules never appear.

# Final check before you answer

- The JSON parses and matches the schema; all required fields are present.
- Module codes are unique, and every code used in \`prerequisites\`, \`areas\`, \`aggregation\` and quotas exists in \`modules\`.
- The aggregation contains every graded, counted module exactly once and nothing else.
- \`passThreshold\` and all \`standardGrades\` are in \`allowedValues\`.
- \`maxCredits\` is never below \`minCredits\`; quota minimums do not exceed \`keepBest.maxCredits\`.
- Credits of compulsory modules plus required elective credits match \`totalCredits\`, or \`notes\` explains the difference.
- \`notes\` explains the grade calculation and lists every assumption.

# Example

A shortened example of the expected structure (fictional data; your answer must contain all modules):

\`\`\`json
${JSON.stringify(EXAMPLE, null, 2)}
\`\`\`

# JSON Schema

The answer must validate against this JSON Schema:

\`\`\`json
${presetJsonSchema()}
\`\`\`
`
}
