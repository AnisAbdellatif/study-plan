/**
 * The HTML frame of every e-mail: logo and name, a white card with the content, and a footer. Built from tables
 * with inline styles, because that is what Gmail, Outlook and Apple Mail render alike; clients that understand
 * <style> also get a dark variant. Every text and URL passed in is escaped here.
 */

export type EmailBlock =
  | { kind: 'paragraph'; text: string }
  /** The main action. Followed by the same URL as plain text for clients that break buttons. */
  | { kind: 'button'; label: string; url: string; fallback: string }
  | {
      kind: 'rows'
      rows: readonly { label: string; tone: 'warning' | 'info'; title: string; value: string }[]
    }
  | { kind: 'note'; text: string }

export interface EmailContent {
  locale: 'de' | 'en'
  /** e.g. https://study-plan.de; the logo is loaded from there. */
  origin: string
  subject: string
  /** Shown next to the subject in the inbox list. */
  preheader: string
  heading: string
  blocks: readonly EmailBlock[]
  footer: readonly string[]
  footerLinks?: readonly { label: string; url: string }[]
}

export const BRAND_NAME = 'Study Plan'

const COLORS = {
  page: '#f4f4f5',
  card: '#ffffff',
  border: '#e4e4e7',
  text: '#18181b',
  muted: '#52525b',
  accent: '#2d99cc',
  // White on this blue has 4.6:1 contrast; the lighter logo blue is too faint for button text.
  button: '#1d7bb0',
  warning: '#b45309',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const BRAND_FONT = `Outfit, ${FONT}`

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char)

function block(item: EmailBlock): string {
  switch (item.kind) {
    case 'paragraph':
      return `<p class="email-text" style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${COLORS.text}">${escapeHtml(item.text)}</p>`
    case 'note':
      return `<p class="email-muted" style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${COLORS.muted}">${escapeHtml(item.text)}</p>`
    case 'button': {
      const url = escapeHtml(item.url)
      return [
        `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px"><tr>`,
        `<td bgcolor="${COLORS.button}" style="border-radius:8px">`,
        `<a href="${url}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(item.label)}</a>`,
        `</td></tr></table>`,
        `<p class="email-muted" style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.muted}">${escapeHtml(item.fallback)}</p>`,
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:12px;line-height:1.5;word-break:break-all"><a href="${url}" target="_blank" style="color:${COLORS.button};text-decoration:underline">${url}</a></p>`,
      ].join('')
    }
    case 'rows': {
      const rows = item.rows
        .map(
          (row) =>
            `<tr><td class="email-border" style="padding:14px 0;border-top:1px solid ${COLORS.border}">` +
            `<div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${row.tone === 'warning' ? COLORS.warning : COLORS.button}">${escapeHtml(row.label)}</div>` +
            `<div class="email-text" style="margin-top:2px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.4;color:${COLORS.text}">${escapeHtml(row.title)}</div>` +
            `</td><td class="email-border email-text" align="right" valign="bottom" style="padding:14px 0 14px 16px;border-top:1px solid ${COLORS.border};font-family:${FONT};font-size:14px;line-height:1.4;color:${COLORS.text};white-space:nowrap">${escapeHtml(row.value)}</td></tr>`,
        )
        .join('')
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 20px;border-collapse:collapse">${rows}</table>`
    }
  }
}

export function renderEmail(content: EmailContent): string {
  const origin = escapeHtml(content.origin.replace(/\/+$/, ''))
  const footerLinks = (content.footerLinks ?? [])
    .map(
      (link) =>
        `<a href="${escapeHtml(link.url)}" target="_blank" style="color:${COLORS.muted};text-decoration:underline">${escapeHtml(link.label)}</a>`,
    )
    .join(' &nbsp;·&nbsp; ')
  const footerLines = content.footer
    .map(
      (line) =>
        `<p class="email-muted" style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.muted}">${escapeHtml(line)}</p>`,
    )
    .join('')

  return `<!doctype html>
<html lang="${content.locale}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(content.subject)}</title>
<style>
  body { margin: 0; padding: 0; }
  a { color: ${COLORS.button}; }
  @media (max-width: 600px) { .email-card { padding: 24px 20px !important; } }
  @media (prefers-color-scheme: dark) {
    .email-page { background-color: #18181b !important; }
    .email-card { background-color: #27272a !important; border-color: #3f3f46 !important; }
    .email-text { color: #f4f4f5 !important; }
    .email-muted { color: #a1a1aa !important; }
    .email-border { border-color: #3f3f46 !important; }
  }
</style>
</head>
<body class="email-page" style="margin:0;padding:0;background-color:${COLORS.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(content.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" class="email-page" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${COLORS.page}" style="background-color:${COLORS.page}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px">
<a href="${origin}" target="_blank" style="text-decoration:none">
<img src="${origin}/email-logo.png" width="40" height="40" alt="" style="display:inline-block;width:40px;height:40px;border:0;vertical-align:middle">
<span class="email-text" style="display:inline-block;margin-left:10px;vertical-align:middle;font-family:${BRAND_FONT};font-size:22px;font-weight:600;letter-spacing:-0.01em;color:${COLORS.text}">${BRAND_NAME}</span>
</a>
</td></tr>
<tr><td class="email-card" bgcolor="${COLORS.card}" style="background-color:${COLORS.card};border:1px solid ${COLORS.border};border-top:4px solid ${COLORS.accent};border-radius:12px;padding:32px">
<h1 class="email-text" style="margin:0 0 16px;font-family:${FONT};font-size:22px;font-weight:700;line-height:1.3;color:${COLORS.text}">${escapeHtml(content.heading)}</h1>
${content.blocks.map(block).join('\n')}
</td></tr>
<tr><td style="padding:20px 8px 0">
${footerLines}
${footerLinks ? `<p class="email-muted" style="margin:8px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.muted}">${footerLinks}</p>` : ''}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
