/**
 * Details about whoever runs this instance. They are required by § 5 DDG (Impressum) and Art. 13 DSGVO
 * (Datenschutzerklärung) and must be real, so they come from build-time environment variables instead of code.
 * Set them in apps/web/.env.production.local (not committed), for example:
 *
 *   VITE_OPERATOR_NAME="Erika Mustermann"
 *   VITE_OPERATOR_STREET="Musterstraße 1"
 *   VITE_OPERATOR_POSTAL_CITY="30159 Hannover"
 *   VITE_OPERATOR_EMAIL="kontakt@example.org"
 *   VITE_HOSTING_PROVIDER="Name und Anschrift des VPS-Anbieters"
 *   VITE_MAIL_PROVIDER="Name und Anschrift des E-Mail-Versanddienstes"
 *   VITE_SERVER_LOG_RETENTION="7 Tage"
 */
export interface OperatorDetails {
  name: string
  street: string
  postalCity: string
  email: string
  phone: string
  hostingProvider: string
  mailProvider: string
  serverLogRetention: string
}

const env = (value: string | undefined): string => value?.trim() ?? ''

export const operator: OperatorDetails = {
  name: env(import.meta.env.VITE_OPERATOR_NAME),
  street: env(import.meta.env.VITE_OPERATOR_STREET),
  postalCity: env(import.meta.env.VITE_OPERATOR_POSTAL_CITY),
  email: env(import.meta.env.VITE_OPERATOR_EMAIL),
  phone: env(import.meta.env.VITE_OPERATOR_PHONE),
  hostingProvider: env(import.meta.env.VITE_HOSTING_PROVIDER),
  mailProvider: env(import.meta.env.VITE_MAIL_PROVIDER),
  serverLogRetention: env(import.meta.env.VITE_SERVER_LOG_RETENTION),
}

const REQUIRED: (keyof OperatorDetails)[] = [
  'name',
  'street',
  'postalCity',
  'email',
  'hostingProvider',
  'mailProvider',
  'serverLogRetention',
]

export const missingOperatorDetails = (details: OperatorDetails = operator): (keyof OperatorDetails)[] =>
  REQUIRED.filter((key) => details[key] === '')
