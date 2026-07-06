import { describe, it, expect } from 'vitest'
import { formatIntegrationStatus, mergeTemplateAndCustomFields } from '@/stores/integrationSettings.js'

describe('formatIntegrationStatus', () => {
  it('returns not-configured for undefined/null setting', () => {
    expect(formatIntegrationStatus(undefined)).toEqual({ configured: false, updatedAt: null, configuredFieldKeys: [] })
    expect(formatIntegrationStatus(null)).toEqual({ configured: false, updatedAt: null, configuredFieldKeys: [] })
  })

  it('returns not-configured when is_configured is false', () => {
    expect(formatIntegrationStatus({ is_configured: false, updated_at: '2026-01-01' })).toEqual({
      configured: false,
      updatedAt: null,
      configuredFieldKeys: [],
    })
  })

  it('returns configured with updatedAt and configuredFieldKeys', () => {
    const setting = {
      is_configured: true,
      updated_at: '2026-07-08T00:00:00Z',
      configured_field_keys: ['access_token', 'phone_number_id'],
    }
    expect(formatIntegrationStatus(setting)).toEqual({
      configured: true,
      updatedAt: '2026-07-08T00:00:00Z',
      configuredFieldKeys: ['access_token', 'phone_number_id'],
    })
  })

  it('defaults configuredFieldKeys to an empty array when missing', () => {
    expect(formatIntegrationStatus({ is_configured: true, updated_at: '2026-07-08' })).toEqual({
      configured: true,
      updatedAt: '2026-07-08',
      configuredFieldKeys: [],
    })
  })
})

describe('mergeTemplateAndCustomFields', () => {
  it('passes through template values when there are no custom fields', () => {
    const result = mergeTemplateAndCustomFields({ access_token: 'abc' }, [])
    expect(result).toEqual({ fields: { access_token: 'abc' }, errors: [] })
  })

  it('merges one valid custom field into the result', () => {
    const result = mergeTemplateAndCustomFields({ access_token: 'abc' }, [{ name: 'region', value: 'eu-west' }])
    expect(result).toEqual({ fields: { access_token: 'abc', region: 'eu-west' }, errors: [] })
  })

  it('silently drops a fully-empty trailing custom row', () => {
    const result = mergeTemplateAndCustomFields({ access_token: 'abc' }, [{ name: '', value: '' }])
    expect(result).toEqual({ fields: { access_token: 'abc' }, errors: [] })
  })

  it('flags a custom row with only a name as invalid', () => {
    const result = mergeTemplateAndCustomFields({}, [{ name: 'region', value: '' }])
    expect(result.errors).toEqual(['incomplete_custom_field'])
    expect(result.fields).toEqual({})
  })

  it('flags a custom row with only a value as invalid', () => {
    const result = mergeTemplateAndCustomFields({}, [{ name: '', value: 'eu-west' }])
    expect(result.errors).toEqual(['incomplete_custom_field'])
    expect(result.fields).toEqual({})
  })
})
