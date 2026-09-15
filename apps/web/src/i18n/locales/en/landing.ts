import type { landing as de } from '../de/landing.ts'
import type { Messages } from '../types.ts'

export const landing = {
  nav: {
    label: 'Main navigation',
    start: 'Get started',
  },
  hero: {
    eyebrow: 'For students at German universities',
    titleStart: 'Your degree,',
    titleHighlight: 'clearly planned.',
    lead: 'Study Plan sorts the modules of your programme into semesters, calculates your grade average by your examination regulations and keeps track of deadlines for you. No spreadsheets, no guesswork.',
    trust: {
      noAccount: 'Works without an account',
      noTracking: 'No tracking',
      encrypted: 'Grades encrypted',
    },
  },
  cta: {
    start: 'Create your study plan',
    example: 'See an example',
    toPlan: 'Go to your plan',
  },
  preview: {
    university: 'Example University',
    average: 'Average',
    credits: '{{earned}} of {{total}} credits',
    moduleCredits: '{{count}} credits',
    semester: 'Semester {{number}}',
    winter: 'Winter {{year}}',
    summer: 'Summer {{year}}',
    passed: 'passed',
    offered: 'Winter semester only',
    choose: 'Choose an elective',
    reminderTitle: 'Reminder',
    reminder: 'Withdraw by 12 February',
    question: 'What do I need for my bachelor’s thesis?',
  },
  features: {
    eyebrow: 'Features',
    title: 'Everything for your studies in one place',
    lead: 'From your first semester to your thesis: Study Plan knows the rules of your programme and helps you keep track.',
    account: 'With an account',
    items: {
      board: {
        title: 'Drag-and-drop semester plan',
        text: 'Move modules between semesters. Plan leave, part-time and study-abroad semesters right along with them.',
      },
      grades: {
        title: 'Live grade average',
        text: 'Enter grades and instantly see your average by the rules of your examination regulations, including “what if” for your target average.',
      },
      hints: {
        title: 'Hints before things get tight',
        text: 'Study Plan warns you when a module sits in a semester it isn’t offered in, when prerequisites are missing or when an area is short of credits.',
      },
      deadlines: {
        title: 'Deadlines at a glance',
        text: 'Add exam dates and withdrawal deadlines to your calendar or get email reminders.',
      },
      assistant: {
        title: 'Study assistant',
        text: 'Ask which modules are prerequisites or how your final grade is calculated. The answers are based on your programme’s data.',
      },
      devices: {
        title: 'On all your devices, shareable',
        text: 'With an account your plans are on every device. Share your plan with a link, without your grades.',
      },
    },
  },
  steps: {
    eyebrow: 'How it works',
    title: 'Your plan in three steps',
    items: {
      choose: {
        title: 'Choose your programme',
        text: 'Pick a ready-made template, load a programme file or create your programme from the examination regulations with a language model.',
      },
      start: {
        title: 'Set your start of studies',
        text: 'Modules land in the right semesters following the recommended study plan.',
      },
      plan: {
        title: 'Plan and enter grades',
        text: 'Move modules, enter results and keep an eye on your average, credits and deadlines.',
      },
    },
  },
  privacy: {
    title: 'Your grades belong to you.',
    lead: 'Study Plan works without ads or tracking and only stores what your plan needs.',
    link: 'Read the privacy policy',
    items: {
      local: 'Without an account, your plan stays in your browser only.',
      encrypted:
        'With an account, your browser encrypts your grades before they are saved. We can’t read them.',
      noTracking: 'No ads, no tracking, no third-party scripts or fonts.',
      neverShared: 'Shared links and the study assistant never get your grades.',
    },
  },
  faq: {
    title: 'Frequently asked questions',
    items: {
      account: {
        question: 'Do I need an account?',
        answer:
          'No. Without an account your plan is only saved in this browser. You need an account to use your plan on several devices, share it, get email reminders or ask the study assistant.',
      },
      programme: {
        question: 'Is my programme included?',
        answer:
          'Some programmes have ready-made templates. If yours is missing, you create it with a language model of your choice from your examination regulations and module catalogue.',
      },
      accuracy: {
        question: 'How reliable is the calculated grade average?',
        answer:
          'Study Plan calculates by the rules in your programme’s template. The result is a non-binding preview; your university’s documents and examination office are authoritative.',
      },
      grades: {
        question: 'Who can see my grades?',
        answer:
          'Without an account only you, in your browser. With an account we only store your grades encrypted, and only your browser has the key.',
      },
      changes: {
        question: 'Can I change my plan later?',
        answer:
          'Any time: move modules, add semesters, change your start of studies or update your programme to new examination regulations.',
      },
    },
  },
  final: {
    title: 'Ready for your study plan?',
    lead: 'Choose your programme and see what your studies can look like in a few minutes.',
  },
} satisfies Messages<typeof de>
