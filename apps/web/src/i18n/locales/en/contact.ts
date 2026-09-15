import type { contact as de } from '../de/contact.ts'
import type { Messages } from '../types.ts'

export const contact = {
  back: 'Back to home',
  title: 'Contact',
  intro:
    'A question, a mistake in a programme template or an idea? Write to us. We reply to the email address you enter.',
  name: 'Name (optional)',
  email: 'Your email address',
  subject: 'Subject',
  message: 'Message',
  messageHint: 'At least {{min}} and at most {{max}} characters.',
  trap: 'Please leave empty',
  privacy:
    'Your message is emailed to our mailbox and is not stored in the app. More in the <privacy>privacy policy</privacy>.',
  submit: 'Send message',
  sentTitle: 'Thanks for your message!',
  sentBody: 'We’ll get back to you at {{email}} as soon as we can.',
  failed: "Your message couldn't be sent right now. Please try again later.",
  rateLimited: "You've just sent several messages. Please wait a few minutes.",
} satisfies Messages<typeof de>
