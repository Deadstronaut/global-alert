// Pure content-localization helper (spec 031, MHEWS-FR-0287/SD-EMAIL-02).
// cap_drafts.translations is JSONB shaped { "tr": { "title": "...",
// "description": "..." } }; falls back to the draft's original title/
// description whenever the recipient's preferred language has no entry (or
// the entry has no title) — never throws, never sends a broken email.

export interface LocalizableDraft {
  title: string
  description: string | null
  translations: Record<string, { title?: string; description?: string }> | null
}

export function resolveLocalizedContent(
  draft: LocalizableDraft,
  preferredLanguage: string,
): { title: string; description: string | null } {
  const translation = draft.translations?.[preferredLanguage]
  if (!translation || !translation.title) {
    return { title: draft.title, description: draft.description }
  }
  return {
    title: translation.title,
    description: translation.description ?? draft.description,
  }
}
