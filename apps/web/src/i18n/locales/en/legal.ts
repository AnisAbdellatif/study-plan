import type { legal as de } from '../de/legal.ts'
import type { Messages } from '../types.ts'

/** Courtesy translation of the legal notice and privacy policy. Keep it in step with the German original. */
export const legal = {
  backToApp: 'Back to Study Planner',
  incomplete:
    'This page is not complete yet: details about the operator are missing. They must be added to the configuration before publishing.',
  courtesyTranslation: {
    note: 'This is a courtesy translation. Only the German version is legally binding.',
    switchToGerman: 'Show German version',
  },
  placeholders: {
    name: 'First and last name',
    street: 'Street and house number',
    postalCity: 'Postcode and city',
    email: 'Email address',
    phone: 'Phone number',
    hostingProvider: 'Hosting provider',
    mailProvider: 'Email delivery service',
    serverLogRetention: 'Retention period for server logs',
  },
  labels: {
    email: 'Email:',
    phone: 'Phone:',
  },
  impressum: {
    title: 'Legal notice',
    operatorHeading: 'Information pursuant to Section 5 DDG',
    contactHeading: 'Contact',
    programmeDataHeading: 'Note on programme data',
    programmeData:
      'The programme templates are compiled to the best of our knowledge from the publicly available examination regulations and module catalogues of the universities. Only the official documents of the respective university are authoritative. The calculated grade average is a non-binding preview.',
  },
  privacy: {
    title: 'Privacy policy',
    controller: {
      heading: '1. Controller',
    },
    summary: {
      heading: '2. Summary',
      guest: 'Without an account, your plan stays in your browser only and is not transmitted to us.',
      account:
        'With an account, we store your email address, an encrypted password hash, your plans including grades, and information about your sign-ins.',
      noTracking:
        'There is no advertising, no tracking, no analytics tools and no embedded third-party content such as fonts or scripts.',
      cookie: 'We only set one technically necessary cookie, and only once you sign in.',
      sharing:
        'If you share a plan via a link, the link only shows semesters and modules, never your grades.',
      selfService: 'You can download your data and delete your account yourself at any time.',
    },
    website: {
      heading: '3. Visiting the website',
      serverLogs:
        "When you visit the site, the web server processes technically necessary connection data: IP address, time, requested address, amount of data transferred and your browser's identifier. This is necessary to deliver the site and to keep the server secure (Art. 6(1)(f) GDPR). These logs are deleted after <retention/>.",
      appLogs:
        'The application itself logs requests only with method, path, status code and duration, without IP addresses and without content.',
      hosting:
        'The server is hosted by: <hosting/>. The provider processes the data on our behalf (Art. 28 GDPR).',
    },
    guest: {
      heading: '4. Using the app without an account',
      storage:
        "Your plan, your grades, exam dates and your target average are stored in your browser's local storage (localStorage). This data does not leave your browser unless you export it yourself as a file or back it up in an account. Storing it is strictly necessary for the function you requested (Section 25(2) no. 2 TDDDG). You delete the data via “Start over” or by removing the site data in your browser.",
    },
    account: {
      heading: '5. Using the app with an account',
      intro: 'When you create an account, we store:',
      identity:
        'your email address, a display name (automatically the part of your email address before the @), whether the address is confirmed, and when the account was created and last changed,',
      password: 'your password only as a salted scrypt hash, never in plain text,',
      plans:
        'your plans: programme, modules, semesters, results and grades with all exam attempts, exam dates and target average,',
      reminders: 'whether you have turned on email reminders,',
      language: 'which language you chose for the website, so that we send you emails in that language,',
      sessions:
        'for each sign-in, a random session key, its expiry date, and the IP address and browser identifier at the time of sign-in. This lets you see where you are signed in and makes misuse traceable.',
      legalBasis:
        'The legal basis is the performance of the contract of use (Art. 6(1)(b) GDPR). A sign-in remains valid for 30 days after it was last used. All account data, plans and sign-ins are deleted when you delete your account.',
      adminView:
        'To support the service, we can see in an admin view your email address, whether it is confirmed, when you created the account and last used it, how many plans and shared links you have and whether reminders are turned on, but no grades and no plan contents. On request or in case of misuse, we can use it to send confirmation emails, deactivate links, end sign-ins and delete accounts. We log every such action with the account ID, without the email address, and delete the log after one year. The legal basis is our legitimate interest in a secure and working service (Art. 6(1)(f) GDPR).',
      grades:
        'Grades are not among the special categories of personal data under Art. 9 GDPR. We still treat them confidentially: they can only be accessed through your account and are not passed on to others.',
    },
    sharing: {
      heading: '6. Shared plans',
      body: "When you share a plan, we create a random link. Of that link, we only store a check value (hash), when it was created and whether you have deactivated it. Anyone who knows the link can see the plan's name, programme, semesters and modules, but no grades, exam dates or target average, and can take over the plan as their own copy. You can deactivate the link at any time; it is deleted together with the plan or your account. The legal basis is Art. 6(1)(b) GDPR.",
    },
    emails: {
      heading: '7. Emails',
      account:
        'We send you emails that are necessary for your account: the confirmation of your email address and links to reset your password (Art. 6(1)(b) GDPR).',
      reminders:
        'If you turn on email reminders on the account page, we remind you of withdrawal deadlines and exam dates that you have entered in the plans saved in your account. The emails only contain module names and dates. So that no reminder is sent twice, for every reminder sent we store the plan, the module number, the type and date of the deadline or exam, and the time it was sent, and delete these entries 30 days after that date. You can turn reminders off at any time on the account page or via the link in every reminder. The legal basis is Art. 6(1)(b) GDPR.',
      provider: 'All emails are sent via <mail/>, which processes the data on our behalf (Art. 28 GDPR).',
    },
    abuse: {
      heading: '8. Protection against misuse',
      body: 'To limit repeated sign-in attempts and other automated attacks on accounts, we briefly store a counter per IP address and sign-in function used. We limit requests for shared plans in the same way; the counters for this are only kept in memory and are not stored permanently. The legal basis is our legitimate interest in keeping accounts secure (Art. 6(1)(f) GDPR).',
    },
    cookies: {
      heading: '9. Cookies',
      body: 'After you sign in, we set a cookie with your session key so that you stay signed in. It is strictly necessary for signing in (Section 25(2) no. 2 TDDDG) and is removed when you sign out. We do not use any other cookies.',
    },
    rights: {
      heading: '10. Your rights',
      list: 'You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18) and data portability (Art. 20). You can object to processing based on legitimate interests (Art. 21).',
      selfService:
        'You can exercise your rights of access and data portability yourself at any time via “Download data”, and you can delete your account yourself, both on the <account>account page</account>. For anything else, write to the email address given above.',
      complaint:
        'You can also lodge a complaint with a data protection supervisory authority (Art. 77 GDPR), for example the one responsible for where you live.',
    },
    misc: {
      heading: '11. Other information',
      body: 'Using the app is voluntary. You only need an account if you want your plan to be available on several devices. There is no automated decision-making and no profiling.',
    },
    updated: 'Last updated: September 2026',
  },
} satisfies Messages<typeof de>
