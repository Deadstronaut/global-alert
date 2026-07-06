// SendGrid email adapter — the documented swap target for Resend
// (research.md §2). Same sendEmail() signature; not wired in by default
// (EMAIL_PROVIDER=resend is the default in emailProviders/index.ts).

import type { SendEmailInput, SendEmailResult } from './resend.ts'

const FROM_ADDRESS = Deno.env.get('SENDGRID_FROM_ADDRESS') ?? 'alerts@example.org'

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY')
  if (!apiKey) {
    return { ok: false, providerMessageId: null, error: 'SENDGRID_API_KEY not configured' }
  }

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_ADDRESS },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, providerMessageId: null, error: data?.errors?.[0]?.message ?? `SendGrid HTTP ${res.status}` }
    }

    // SendGrid returns the message id in the X-Message-Id response header, not the body.
    const providerMessageId = res.headers.get('x-message-id')
    return { ok: true, providerMessageId, error: null }
  } catch (err) {
    return { ok: false, providerMessageId: null, error: err instanceof Error ? err.message : String(err) }
  }
}
