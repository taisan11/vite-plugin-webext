//#region src/i18n/defineLocale.ts
function defineLocale(locale) {
	return locale;
}
//#endregion
//#region src/i18n/index.ts
function t(id, substitutions) {
	const extensionApi = globalThis;
	const i18nNamespace = extensionApi.browser?.i18n ?? extensionApi.chrome?.i18n;
	if (!i18nNamespace) throw new Error("[vite-plugin-webext] Could not resolve browser.i18n namespace for `t(...)`.");
	return i18nNamespace.getMessage(id, substitutions);
}
//#endregion
export { defineLocale, t };

//# sourceMappingURL=index.mjs.map