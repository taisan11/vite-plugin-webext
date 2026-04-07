//#region src/i18n/defineLocale.d.ts
interface LocalePlaceholderDefinition {
  content: string;
  example?: string;
}
interface LocaleMessageDefinition {
  message: string;
  description?: string;
  placeholders?: Record<string, LocalePlaceholderDefinition>;
}
type LocaleEntry = string | LocaleMessageDefinition;
type LocaleDefinition = Record<string, LocaleEntry>;
declare function defineLocale<const T extends LocaleDefinition>(locale: T): T;
//#endregion
//#region src/i18n/index.d.ts
declare global {
  interface WebextI18nMessageIdMap {}
}
type KnownLocaleMessageId = keyof WebextI18nMessageIdMap & string;
type LocaleMessageId = [KnownLocaleMessageId] extends [never] ? string : KnownLocaleMessageId;
declare function t(id: LocaleMessageId, substitutions?: string | string[]): string;
//#endregion
export { type LocaleDefinition, type LocaleEntry, type LocaleMessageDefinition, LocaleMessageId, type LocalePlaceholderDefinition, defineLocale, t };
//# sourceMappingURL=index.d.mts.map