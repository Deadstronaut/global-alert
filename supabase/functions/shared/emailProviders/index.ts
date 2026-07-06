// Selects the active email provider adapter via the EMAIL_PROVIDER env var
// (research.md §2). Both adapters share the sendEmail({to,subject,html})
// signature, so swapping providers is a one-line change here — no caller
// needs to know which provider is active.

import { sendEmail as sendEmailResend } from './resend.ts'
import { sendEmail as sendEmailSendgrid } from './sendgrid.ts'
import type { SendEmailInput, SendEmailResult } from './resend.ts'

export type { SendEmailInput, SendEmailResult }

export function getEmailAdapter(): (input: SendEmailInput) => Promise<SendEmailResult> {
  const provider = (Deno.env.get('EMAIL_PROVIDER') ?? 'resend').toLowerCase()
  if (provider === 'sendgrid') return sendEmailSendgrid
  return sendEmailResend
}
