// Resend email adapter (default provider, research.md §2). A thin fetch()
// call, no SDK dependency — swappable via emailProviders/index.ts.

export interface SendEmailInput {
  to: string
  subject: string
  html: string
}

export interface SendEmailResult {
  ok: boolean
  providerMessageId: string | null
  error: string | null
}

const FROM_ADDRESS = Deno.env.get('RESEND_FROM_ADDRESS') ?? 'onboarding@resend.dev'

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    return { ok: false, providerMessageId: null, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return { ok: false, providerMessageId: null, error: data?.message ?? `Resend HTTP ${res.status}` }
    }

    return { ok: true, providerMessageId: data?.id ?? null, error: null }
  } catch (err) {
    return { ok: false, providerMessageId: null, error: err instanceof Error ? err.message : String(err) }
  }
}
