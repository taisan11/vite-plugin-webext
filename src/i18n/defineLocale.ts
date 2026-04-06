export type LocaleDefinition = Record<string, string>

export function defineLocale<const T extends LocaleDefinition>(locale: T): T {
  return locale
}
