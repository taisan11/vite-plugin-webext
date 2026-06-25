import { describe, it, expect } from 'vitest'
import { resolveI18nOptions, transformLocaleEntriesToMessagesJson, extractDefineLocaleMessageIds } from '../i18n/transform.ts'

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

describe('transformLocaleEntriesToMessagesJson', () => {
  it('should transform simple string messages', () => {
    const entries = [
      {
        locale: 'en',
        messages: {
          hello: 'Hello',
          goodbye: 'Goodbye',
        },
      },
    ]
    const result = transformLocaleEntriesToMessagesJson(entries)
    expect(result).toEqual({
      en: {
        hello: { message: 'Hello' },
        goodbye: { message: 'Goodbye' },
      },
    })
  })

  it('should transform complex message objects', () => {
    const entries = [
      {
        locale: 'en',
        messages: {
          notificationContent: {
            message: 'You clicked $URL$.',
            description: 'Tells the user which link they clicked.',
            placeholders: {
              url: {
                content: '$1',
                example: 'https://developer.mozilla.org',
              },
            },
          },
        },
      },
    ]
    const result = transformLocaleEntriesToMessagesJson(entries)
    expect(result).toEqual({
      en: {
        notificationContent: {
          message: 'You clicked $URL$.',
          description: 'Tells the user which link they clicked.',
          placeholders: {
            url: {
              content: '$1',
              example: 'https://developer.mozilla.org',
            },
          },
        },
      },
    })
  })

  it('should handle multiple locales', () => {
    const entries = [
      { locale: 'en', messages: { hello: 'Hello' } },
      { locale: 'ja', messages: { hello: 'こんにちは' } },
    ]
    const result = transformLocaleEntriesToMessagesJson(entries)
    expect(result).toEqual({
      en: { hello: { message: 'Hello' } },
      ja: { hello: { message: 'こんにちは' } },
    })
  })

  it('should handle mixed string and object messages', () => {
    const entries = [
      {
        locale: 'en',
        messages: {
          simple: 'Simple message',
          complex: {
            message: 'Complex message',
            description: 'A description',
          },
        },
      },
    ]
    const result = transformLocaleEntriesToMessagesJson(entries)
    expect(result).toEqual({
      en: {
        simple: { message: 'Simple message' },
        complex: {
          message: 'Complex message',
          description: 'A description',
        },
      },
    })
  })
})

describe('extractDefineLocaleMessageIds', () => {
  it('should extract message ids from defineLocale', () => {
    const source = `defineLocale({
  hello: 'Hello',
  world: 'World'
})`
    const ids = extractDefineLocaleMessageIds(source)
    expect(ids).toEqual(new Set(['hello', 'world']))
  })

  it('should handle line comments before keys', () => {
    const source = `defineLocale({
  // This is a comment
  hello: 'Hello',
  world: 'World'
})`
    const ids = extractDefineLocaleMessageIds(source)
    expect(ids).toEqual(new Set(['hello', 'world']))
  })

  it('should handle block comments before keys', () => {
    const source = `defineLocale({
  /* This is a block comment */
  hello: 'Hello',
  world: 'World'
})`
    const ids = extractDefineLocaleMessageIds(source)
    expect(ids).toEqual(new Set(['hello', 'world']))
  })

  it('should handle multiple line comments', () => {
    const source = `defineLocale({
  // Comment 1
  // Comment 2
  hello: 'Hello',
  // Comment 3
  world: 'World'
})`
    const ids = extractDefineLocaleMessageIds(source)
    expect(ids).toEqual(new Set(['hello', 'world']))
  })

  it('should handle comments between all keys', () => {
    const source = `defineLocale({
  // Greeting
  hello: 'Hello',
  // Farewell
  world: 'World'
})`
    const ids = extractDefineLocaleMessageIds(source)
    expect(ids).toEqual(new Set(['hello', 'world']))
  })

  it('should handle comments at the start of the object', () => {
    const source = `defineLocale({
  // First comment
  hello: 'Hello',
  world: 'World'
})`
    const ids = extractDefineLocaleMessageIds(source)
    expect(ids).toEqual(new Set(['hello', 'world']))
  })

  it('should handle block comments spanning multiple lines', () => {
    const source = `defineLocale({
  /*
   * This is a multi-line
   * block comment
   */
  hello: 'Hello',
  world: 'World'
})`
    const ids = extractDefineLocaleMessageIds(source)
    expect(ids).toEqual(new Set(['hello', 'world']))
  })
})
