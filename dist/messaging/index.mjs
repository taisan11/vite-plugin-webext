//#region src/messaging/index.ts
function createMessage(type, payload) {
	return {
		type,
		payload
	};
}
function sendMessage(type, payload, options) {
	return resolveRuntimeNamespace().sendMessage({
		type,
		payload
	}, options);
}
function sendMessageToTab(tabId, type, payload, options) {
	return resolveTabsNamespace().sendMessage(tabId, {
		type,
		payload
	}, options);
}
function resolveRuntimeNamespace() {
	const runtime = resolveExtensionApi().runtime;
	if (!runtime) throw new Error("[vite-plugin-webext] Could not resolve browser.runtime namespace for messaging helpers.");
	return runtime;
}
function resolveTabsNamespace() {
	const tabs = resolveExtensionApi().tabs;
	if (!tabs) throw new Error("[vite-plugin-webext] Could not resolve browser.tabs namespace for messaging helpers.");
	return tabs;
}
function resolveExtensionApi() {
	const extensionApi = globalThis;
	return extensionApi.browser ?? extensionApi.chrome ?? {};
}
//#endregion
export { createMessage, sendMessage, sendMessageToTab };

//# sourceMappingURL=index.mjs.map