export interface LocalePlaceholderDefinition {
  content: string
  example?: string
}

export interface LocaleMessageDefinition {
  message: string
  description?: string
  placeholders?: Record<string, LocalePlaceholderDefinition>
}

export type LocaleEntry = string | LocaleMessageDefinition
export type LocaleDefinition = Record<string, LocaleEntry>

export function defineLocale<const T extends LocaleDefinition>(locale: T): T {
  return locale
}
