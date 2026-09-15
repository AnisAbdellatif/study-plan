import type { legal as de } from '../de/legal.ts'
import type { Messages } from '../types.ts'

/** Courtesy translation of the legal notice and privacy policy. Keep it in step with the German original. */
export const legal = {
  backToApp: 'Back to home',
  eyebrow: 'Legal',
  contents: 'Contents',
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
  },
  labels: {
    email: 'Email:',
    phone: 'Phone:',
  },
  impressum: {
    title: 'Legal notice',
    operatorHeading: 'Information pursuant to Section 5 DDG',
    contactHeading: 'Contact',
    contactForm: 'You can also write to us using the <form>contact form</form>.',
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
        'With an account, we store your email address, an encrypted password hash, your plans and information about your sign-ins. Your browser encrypts your grades before saving them; we can’t read them.',
      noTracking:
        'There is no advertising, no tracking, no analytics tools and no embedded third-party content such as fonts or scripts.',
      cookie: 'We only set one technically necessary cookie, and only once you sign in.',
      sharing:
        'If you share a plan via a link, the link shows semesters and modules, but never your results or grades.',
      assistant:
        'Using the study assistant is voluntary. Through OpenRouter, the language model only gets your plan’s programme data and your questions, never your grades. We don’t store conversations.',
      contact:
        'If you write to us using the contact form, your message is emailed to our mailbox; we don’t store it in the app.',
      selfService: 'You can download your data and delete your account yourself at any time.',
    },
    website: {
      heading: '3. Visiting the website',
      serverLogs:
        'When you visit the site, the server processes technically necessary connection data such as your IP address, the time and the requested address, so that the site can be delivered (Art. 6(1)(f) GDPR). This data is only processed for the duration of the connection. We do not keep access logs with IP addresses: neither the web server nor the application stores IP addresses in logs. The only exceptions are the sign-ins and misuse counters described in sections 5 and 10.',
      appLogs:
        'The application logs requests only with method, path, status code and duration, without IP addresses and without content. These technical logs have a fixed maximum size; older entries are overwritten automatically.',
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
        'your plans: programme, modules, semesters, results with all exam attempts, exam dates and recognitions; grades and target average only encrypted,',
      reminders: 'whether you have turned on email reminders,',
      language: 'which language you chose for the website, so that we send you emails in that language,',
      sessions:
        'for each sign-in, a random session key, its expiry date, and the IP address and browser identifier at the time of sign-in. This lets you see where you are signed in and makes misuse traceable.',
      legalBasis:
        'The legal basis is the performance of the contract of use (Art. 6(1)(b) GDPR). A sign-in remains valid for 30 days after it was last used. All account data, plans and sign-ins are deleted when you delete your account.',
      adminView:
        'To support the service, we can see in an admin view your email address, whether it is confirmed, when you created the account and last used it, how many plans and shared links you have, whether reminders are turned on, whether your account has its own plan limit and whether you can use the study assistant without the daily limit, but no grades and no plan contents. On request or in case of misuse, we can use it to send confirmation emails, deactivate links, end sign-ins and delete accounts; we can also change an account’s plan limit and lift the study assistant’s daily limit for an account. We log every such action with the account ID, without the email address, and delete the log after one year. The legal basis is our legitimate interest in a secure and working service (Art. 6(1)(f) GDPR).',
      grades:
        'Grades are not among the special categories of personal data under Art. 9 GDPR. We still protect them specially: your browser encrypts grades and target average (AES-256-GCM) before it sends your plan to us. It derives the key from your password when you sign in (PBKDF2 with 600,000 iterations) and keeps it only on your devices; the key is never transmitted to us. Your password only reaches our server to be checked when you sign in, and is stored there only as a hash. We therefore store grades and target average only encrypted and can neither read nor pass them on. Plans saved in an account before encryption was introduced are encrypted by your browser as soon as you open them while signed in. If you reset your password, grades saved until then can only be restored with the earlier password or on a device where you are still signed in. Whether a module is passed, which exam attempts there were, exam dates and recognitions stay unencrypted, so that reminders work and no reminders go out for passed exams.',
    },
    sharing: {
      heading: '6. Shared plans',
      body: "When you share a plan, we create a random link. Of that link, we only store a check value (hash), when it was created and whether you have deactivated it. Anyone who knows the link can see the plan's name, programme, semesters and modules, and can take over the plan as their own copy. Results, grades, exam dates, recognitions and the target average are never visible. You can deactivate the link at any time; it is deleted together with the plan or your account. The legal basis is Art. 6(1)(b) GDPR.",
    },
    emails: {
      heading: '7. Emails',
      account:
        'We send you emails that are necessary for your account: the confirmation of your email address and links to reset your password (Art. 6(1)(b) GDPR).',
      reminders:
        'If you turn on email reminders on the account page, we remind you of withdrawal deadlines and exam dates that you have entered in the plans saved in your account. The emails only contain module names and dates. So that no reminder is sent twice, for every reminder sent we store the plan, the module number, the type and date of the deadline or exam, and the time it was sent, and delete these entries 30 days after that date. You can turn reminders off at any time on the account page or via the link in every reminder. The legal basis is Art. 6(1)(b) GDPR.',
      provider: 'All emails are sent via <mail/>, which processes the data on our behalf (Art. 28 GDPR).',
    },
    contact: {
      heading: '8. Contact form',
      what: 'You can send us a message using the <form>contact form</form>. We email your email address, your name if you enter it, the subject, your message and the language of the website to our mailbox so that we can reply. It is sent via the email service named in section 7.',
      storage:
        'We don’t store the message in the app. We delete the email in our mailbox and our reply once your request has been dealt with, unless statutory retention obligations prevent this.',
      basis:
        'The legal basis is our legitimate interest in answering requests (Art. 6(1)(f) GDPR); if your request concerns your account, it is the performance of the contract of use (Art. 6(1)(b) GDPR).',
    },
    assistant: {
      heading: '9. Study assistant',
      what: 'Signed-in users can ask a study assistant questions about their programme. For this we send your question, the conversation so far and the programme data of your plan (module names, credits, module catalogue information, areas and examination rules) to OpenRouter, Inc. (USA). OpenRouter passes the request on to the provider of the language model that writes the answer. To look things up, the model may ask several times; it only gets this programme data then as well.',
      models:
        'We choose which language model answers in the admin dashboard. Depending on the model, a different provider processes the request, which may also be based outside the EU. We only let requests be routed to providers that, according to OpenRouter, neither store them nor use them for training.',
      never:
        'Your grades, results and exam attempts, exam dates, recognitions, target average, modules you added yourself, your semester planning, your email address and your name are never sent.',
      storage:
        'We don’t store conversations: the history only lives in your browser until you start a new conversation or reload the page. On the server we count how many messages your account sends per day to enforce a daily limit, and delete these counters after seven days. If an admin lifts the daily limit for your account, we store that in your account; admins always use the assistant without a daily limit. Your browser remembers that you confirmed the notice before first use.',
      statistics:
        'For the admin dashboard we also count, per day and language model, how many questions were asked and how many of them could not be answered, how many requests to the model were needed, how many tokens were used and what that cost. These figures are not linked to any account and are deleted after 400 days. If a request fails, we log the kind of error and OpenRouter’s error message, never your question or an answer.',
      basis:
        'Using it is voluntary; please don’t put personal information in your questions. The legal basis is your consent (Art. 6(1)(a) GDPR), which you give by confirming the notice. You can withdraw it at any time with effect for the future by no longer using the assistant. The answers are not binding.',
      transfer:
        'OpenRouter is based in the USA, and the providers of the language models may also be based outside the EU. Your questions and the programme data are therefore transferred to third countries that may not offer a level of data protection like the EU’s; authorities there may be able to access the data without you having effective legal remedies. By confirming the notice, you also explicitly consent to this transfer (Art. 49(1)(a) GDPR).',
    },
    abuse: {
      heading: '10. Protection against misuse',
      body: 'To limit repeated sign-in attempts and other automated attacks on accounts, we briefly store a counter per IP address and sign-in function used. We limit requests for shared plans and messages sent through the contact form in the same way; the counters per IP address for this are only kept in memory, discarded after a few minutes and not stored permanently. The legal basis is our legitimate interest in a secure service (Art. 6(1)(f) GDPR).',
    },
    cookies: {
      heading: '11. Cookies',
      body: 'After you sign in, we set a cookie with your session key so that you stay signed in. It is strictly necessary for signing in (Section 25(2) no. 2 TDDDG) and is removed when you sign out. We do not use any other cookies.',
    },
    rights: {
      heading: '12. Your rights',
      list: 'You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18) and data portability (Art. 20). You can object to processing based on legitimate interests (Art. 21).',
      selfService:
        'You can exercise your rights of access and data portability yourself at any time via “Download data”, and you can delete your account yourself, both on the <account>account page</account>. For anything else, write to the email address given above or use the <contact>contact form</contact>.',
      complaint:
        'You can also lodge a complaint with a data protection supervisory authority (Art. 77 GDPR), for example the one responsible for where you live.',
    },
    misc: {
      heading: '13. Other information',
      body: 'Using the app is voluntary. You only need an account if you want your plan to be available on several devices. There is no automated decision-making and no profiling.',
    },
    updated: 'Last updated: September 2026',
  },
} satisfies Messages<typeof de>
