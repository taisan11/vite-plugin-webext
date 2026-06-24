import { describe, it, expect } from 'vitest'
import { resolveI18nOptions } from '../i18n/transform.ts'

describe('resolveI18nOptions', () => {
  it('should return disabled options when i18n is false', () => {
    const result = resolveI18nOptions(false)
    expect(result.enabled).toBe(false)
    expect(result.localeDir).toBe('src/locale')
  })

  it('should return disabled options when i18n is undefined', () => {
    const result = resolveI18nOptions(undefined)
    expect(result.enabled).toBe(false)
    expect(result.localeDir).toBe('src/locale')
  })

  it('should return enabled options with defaults when i18n is true', () => {
    const result = resolveI18nOptions(true)
    expect(result.enabled).toBe(true)
    expect(result.localeDir).toBe('src/locale')
  })

  it('should use custom locale directory', () => {
    const result = resolveI18nOptions({ localeDir: 'custom/locale' })
    expect(result.enabled).toBe(true)
    expect(result.localeDir).toBe('custom/locale')
  })

  it('should handle enabled: false in options', () => {
    const result = resolveI18nOptions({ enabled: false })
    expect(result.enabled).toBe(false)
  })
})
