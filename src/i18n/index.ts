import { defineLocale } from './defineLocale.ts'

export { defineLocale }
export type {
  LocaleDefinition,
  LocaleEntry,
  LocaleMessageDefinition,
  LocalePlaceholderDefinition,
} from './defineLocale.ts'

declare global {
  interface WebextI18nMessageIdMap {}
}

type KnownLocaleMessageId = keyof WebextI18nMessageIdMap & string
export type LocaleMessageId = [KnownLocaleMessageId] extends [never] ? string : KnownLocaleMessageId

interface BrowserI18nNamespace {
  getMessage(messageName: string, substitutions?: string | string[]): string
}

interface BrowserLike {
  i18n?: BrowserI18nNamespace
}

export function t(id: LocaleMessageId, substitutions?: string | string[]): string {
  const extensionApi = globalThis as typeof globalThis & {
    browser?: BrowserLike
    chrome?: BrowserLike
  }
  const i18nNamespace = extensionApi.browser?.i18n ?? extensionApi.chrome?.i18n
  if (!i18nNamespace) {
    throw new Error('[vite-plugin-webext] Could not resolve browser.i18n namespace for `t(...)`.')
  }
  return i18nNamespace.getMessage(id, substitutions)
}
