//#region src/i18n/defineLocale.d.ts
type LocaleDefinition = Record<string, string>;
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
export { type LocaleDefinition, LocaleMessageId, defineLocale, t };
//# sourceMappingURL=index.d.mts.map