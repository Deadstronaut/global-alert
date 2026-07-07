import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { resolveLocalizedContent, LocalizableDraft } from './emailLocalization.ts'

const baseDraft: LocalizableDraft = {
  title: 'Earthquake Warning',
  description: 'A strong earthquake has occurred.',
  translations: { tr: { title: 'Deprem Uyarısı', description: 'Şiddetli bir deprem meydana geldi.' } },
}

Deno.test('uses the translation when available for the preferred language', () => {
  assertEquals(resolveLocalizedContent(baseDraft, 'tr'), {
    title: 'Deprem Uyarısı',
    description: 'Şiddetli bir deprem meydana geldi.',
  })
})

Deno.test('falls back to the original content when no translation exists for the language', () => {
  assertEquals(resolveLocalizedContent(baseDraft, 'fr'), {
    title: 'Earthquake Warning',
    description: 'A strong earthquake has occurred.',
  })
})

Deno.test('falls back to the original content when translations is entirely empty', () => {
  const draft = { ...baseDraft, translations: {} }
  assertEquals(resolveLocalizedContent(draft, 'tr'), {
    title: 'Earthquake Warning',
    description: 'A strong earthquake has occurred.',
  })
})

Deno.test('falls back to the original content when translations is null', () => {
  const draft = { ...baseDraft, translations: null }
  assertEquals(resolveLocalizedContent(draft, 'tr'), {
    title: 'Earthquake Warning',
    description: 'A strong earthquake has occurred.',
  })
})

Deno.test('uses translated title but falls back to original description when translation has no description', () => {
  const draft = { ...baseDraft, translations: { tr: { title: 'Deprem Uyarısı' } } }
  assertEquals(resolveLocalizedContent(draft, 'tr'), {
    title: 'Deprem Uyarısı',
    description: 'A strong earthquake has occurred.',
  })
})

Deno.test('falls back entirely when the translation entry has no title', () => {
  const draft = { ...baseDraft, translations: { tr: { description: 'Şiddetli bir deprem meydana geldi.' } } }
  assertEquals(resolveLocalizedContent(draft, 'tr'), {
    title: 'Earthquake Warning',
    description: 'A strong earthquake has occurred.',
  })
})
