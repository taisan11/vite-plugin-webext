import { promises } from "node:fs";
import path from "node:path";
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import MagicString from "magic-string";
//#region src/browser/api-transform.ts
const CHROME_ONLY_APIS = [
	"offscreen",
	"enterprise",
	"documentScan",
	"gcm",
	"instanceID",
	"loginState",
	"platformKeys",
	"printingMetrics",
	"readingList",
	"search",
	"smartCardProviderPrivate",
	"systemLog",
	"topSites",
	"ttsEngine",
	"userScripts",
	"vpnProvider",
	"wallpaper",
	"webAuthenticationProxy"
];
const FIREFOX_ONLY_APIS = [
	"theme",
	"browserSettings",
	"captivePortal",
	"dns",
	"find",
	"geckoProfiler",
	"menus",
	"normandyAddonStudy",
	"pkcs11",
	"proxy",
	"telemetry",
	"userScripts"
];
function hasApiNamespaceAccess(code) {
	return /\b(?:browser|chrome)\s*(?:\.|\?\.)/.test(code);
}
function hasUnavailableApiAccess(code, api) {
	return new RegExp(`(?:browser|chrome)\\??\\.${escapeRe(api)}\\b`).test(code);
}
function resolveApiNamespace(browser) {
	return browser === "chrome" ? "chrome" : "browser";
}
function rewriteApiNamespaces(code, parse, targetNamespace) {
	const ast = parse(code);
	const magic = new MagicString(code);
	let count = 0;
	walkAst$2(ast, (node) => {
		if (node.type !== "MemberExpression" && node.type !== "OptionalMemberExpression" || node.computed) return;
		const object = node.object;
		if (object?.type === "Identifier" && (object.name === "chrome" || object.name === "browser") && object.name !== targetNamespace && typeof object.start === "number" && typeof object.end === "number") {
			magic.overwrite(object.start, object.end, targetNamespace);
			count++;
		}
	});
	return {
		count,
		code: count > 0 ? magic.toString() : code,
		map: count > 0 ? magic.generateMap({ hires: true }) : null
	};
}
function walkAst$2(node, visit) {
	if (!node || typeof node !== "object") return;
	const astNode = node;
	if (!astNode.type) return;
	visit(astNode);
	for (const value of Object.values(astNode)) {
		if (!value) continue;
		if (Array.isArray(value)) {
			for (const item of value) walkAst$2(item, visit);
			continue;
		}
		walkAst$2(value, visit);
	}
}
function escapeRe(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
//#endregion
//#region src/i18n/transform.ts
const DEFAULT_LOCALE_DIR = "src/locale";
const DEFAULT_DTS_NAME = "webext-i18n.d.ts";
const LOCALE_SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const I18N_IMPORT_SOURCES = new Set(["@taisan11/vite-plugin-webext/i18n", "@taisan11/vite-plugin-webext/src/i18n"]);
function resolveI18nOptions(i18n) {
	if (i18n === false || i18n == null) return {
		enabled: false,
		localeDir: DEFAULT_LOCALE_DIR,
		generatedDtsPath: normalizePath$1(path.join(DEFAULT_LOCALE_DIR, DEFAULT_DTS_NAME))
	};
	if (i18n === true) return {
		enabled: true,
		localeDir: DEFAULT_LOCALE_DIR,
		generatedDtsPath: normalizePath$1(path.join(DEFAULT_LOCALE_DIR, DEFAULT_DTS_NAME))
	};
	const localeDir = normalizePath$1(i18n.localeDir?.trim() || DEFAULT_LOCALE_DIR);
	return {
		enabled: i18n.enabled ?? true,
		localeDir,
		generatedDtsPath: normalizePath$1(path.join(localeDir, DEFAULT_DTS_NAME))
	};
}
async function prepareI18nArtifacts(rootDir, options) {
	const localeFiles = await readLocaleFiles(path.resolve(rootDir, options.localeDir));
	if (localeFiles.length === 0) throw new Error(`[vite-plugin-webext] i18n is enabled, but no locale source files were found in "${options.localeDir}". Create src/locale/[localeName].ts and export defineLocale({...}).`);
	const messageIds = /* @__PURE__ */ new Set();
	for (const filePath of localeFiles) {
		const source = await promises.readFile(filePath, "utf8");
		for (const id of extractDefineLocaleMessageIds(source)) messageIds.add(id);
	}
	const generatedDtsPath = path.resolve(rootDir, options.generatedDtsPath);
	await promises.mkdir(path.dirname(generatedDtsPath), { recursive: true });
	await promises.writeFile(generatedDtsPath, renderLocaleMessageIdDts(messageIds));
	return { messageIds };
}
function rewriteI18nTCalls(code, parse, messageIds) {
	if (!hasI18nImport(code)) return {
		count: 0,
		unknownIds: [],
		code,
		map: null
	};
	const ast = parse(code);
	const callTargets = collectImportedTCallTargets(ast);
	if (callTargets.direct.size === 0 && callTargets.namespaces.size === 0) return {
		count: 0,
		unknownIds: [],
		code,
		map: null
	};
	const magic = new MagicString(code);
	let count = 0;
	const unknownIds = /* @__PURE__ */ new Set();
	walkAst$1(ast, (node) => {
		if (node.type !== "CallExpression") return;
		if (!isTCallExpression(node, callTargets)) return;
		const args = Array.isArray(node.arguments) ? node.arguments : [];
		if (args.length === 0) return;
		const firstArg = args[0];
		if (!firstArg) return;
		const messageId = getStaticMessageId(firstArg);
		if (!messageId) return;
		if (messageIds.size > 0 && !messageIds.has(messageId)) unknownIds.add(messageId);
		const callStart = node.start;
		const callEnd = node.end;
		if (typeof callStart !== "number" || typeof callEnd !== "number") return;
		const serializedArgs = args.map((arg) => {
			if (typeof arg.start !== "number" || typeof arg.end !== "number") return "";
			return code.slice(arg.start, arg.end);
		}).filter((arg) => arg.length > 0).join(", ");
		magic.overwrite(callStart, callEnd, `browser.i18n.getMessage(${serializedArgs})`);
		count++;
	});
	return {
		count,
		unknownIds: [...unknownIds].sort(),
		code: count > 0 ? magic.toString() : code,
		map: count > 0 ? magic.generateMap({ hires: true }) : null
	};
}
function hasI18nImport(code) {
	return code.includes("vite-plugin-webext/i18n");
}
function collectImportedTCallTargets(ast) {
	const direct = /* @__PURE__ */ new Set();
	const namespaces = /* @__PURE__ */ new Set();
	walkAst$1(ast, (node) => {
		if (node.type !== "ImportDeclaration") return;
		const source = node.source;
		if (typeof source?.value !== "string" || !I18N_IMPORT_SOURCES.has(source.value)) return;
		const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
		for (const specifier of specifiers) {
			if (specifier.type === "ImportSpecifier") {
				const imported = specifier.imported;
				const local = specifier.local;
				if (imported?.name === "t" && typeof local?.name === "string") direct.add(local.name);
			}
			if (specifier.type === "ImportNamespaceSpecifier") {
				const local = specifier.local;
				if (typeof local?.name === "string") namespaces.add(local.name);
			}
		}
	});
	return {
		direct,
		namespaces
	};
}
function isTCallExpression(node, callTargets) {
	const callee = node.callee;
	if (!callee) return false;
	if (callee.type === "Identifier" && typeof callee.name === "string") return callTargets.direct.has(callee.name);
	if ((callee.type === "MemberExpression" || callee.type === "OptionalMemberExpression") && !callee.computed) {
		const object = callee.object;
		const property = callee.property;
		return object?.type === "Identifier" && typeof object.name === "string" && callTargets.namespaces.has(object.name) && property?.type === "Identifier" && property.name === "t";
	}
	return false;
}
function getStaticMessageId(node) {
	if (node.type === "Literal" && typeof node.value === "string") return node.value;
	if (node.type !== "TemplateLiteral") return null;
	if ((Array.isArray(node.expressions) ? node.expressions : []).length !== 0) return null;
	const first = (Array.isArray(node.quasis) ? node.quasis : [])[0];
	return typeof first?.value?.cooked === "string" ? first.value.cooked : null;
}
function walkAst$1(node, visit) {
	if (!node || typeof node !== "object") return;
	const astNode = node;
	if (!astNode.type) return;
	visit(astNode);
	for (const value of Object.values(astNode)) {
		if (!value) continue;
		if (Array.isArray(value)) {
			for (const item of value) walkAst$1(item, visit);
			continue;
		}
		walkAst$1(value, visit);
	}
}
async function readLocaleFiles(localeDir) {
	let entries;
	try {
		entries = await promises.readdir(localeDir, {
			withFileTypes: true,
			encoding: "utf8"
		});
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
	const results = [];
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const extension = path.extname(entry.name);
		if (!LOCALE_SOURCE_EXTENSIONS.has(extension)) continue;
		if (entry.name.endsWith(".d.ts")) continue;
		const filePath = path.join(localeDir, entry.name);
		results.push(filePath);
	}
	return results.sort((a, b) => a.localeCompare(b));
}
function extractDefineLocaleMessageIds(source) {
	const ids = /* @__PURE__ */ new Set();
	let searchIndex = 0;
	while (searchIndex < source.length) {
		const defineLocaleIndex = source.indexOf("defineLocale", searchIndex);
		if (defineLocaleIndex === -1) break;
		const parenIndex = source.indexOf("(", defineLocaleIndex);
		if (parenIndex === -1) break;
		const objectStart = findNextNonSpaceIndex(source, parenIndex + 1);
		if (objectStart === -1 || source[objectStart] !== "{") {
			searchIndex = parenIndex + 1;
			continue;
		}
		const objectEnd = findMatchingBrace(source, objectStart);
		if (objectEnd === -1) {
			searchIndex = objectStart + 1;
			continue;
		}
		const objectText = source.slice(objectStart + 1, objectEnd);
		for (const key of extractTopLevelObjectLiteralKeys(objectText)) ids.add(key);
		searchIndex = objectEnd + 1;
	}
	return ids;
}
function extractTopLevelObjectLiteralKeys(source) {
	const keys = [];
	const properties = splitTopLevelObjectProperties(source);
	for (const property of properties) {
		const key = parseObjectPropertyKey(property);
		if (key) keys.push(key);
	}
	return keys;
}
function splitTopLevelObjectProperties(source) {
	const properties = [];
	let inString = null;
	let escaped = false;
	let inLineComment = false;
	let inBlockComment = false;
	let braceDepth = 0;
	let bracketDepth = 0;
	let parenDepth = 0;
	let segmentStart = 0;
	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		const next = source[i + 1];
		if (inLineComment) {
			if (char === "\n") inLineComment = false;
			continue;
		}
		if (inBlockComment) {
			if (char === "*" && next === "/") {
				inBlockComment = false;
				i++;
			}
			continue;
		}
		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === inString) inString = null;
			continue;
		}
		if (char === "/" && next === "/") {
			inLineComment = true;
			i++;
			continue;
		}
		if (char === "/" && next === "*") {
			inBlockComment = true;
			i++;
			continue;
		}
		if (char === "\"" || char === "'" || char === "`") {
			inString = char;
			continue;
		}
		if (char === "{") {
			braceDepth++;
			continue;
		}
		if (char === "}") {
			braceDepth--;
			continue;
		}
		if (char === "[") {
			bracketDepth++;
			continue;
		}
		if (char === "]") {
			bracketDepth--;
			continue;
		}
		if (char === "(") {
			parenDepth++;
			continue;
		}
		if (char === ")") {
			parenDepth--;
			continue;
		}
		if (braceDepth === 0 && bracketDepth === 0 && parenDepth === 0 && char === ",") {
			const property = source.slice(segmentStart, i).trim();
			if (property) properties.push(property);
			segmentStart = i + 1;
		}
	}
	const lastProperty = source.slice(segmentStart).trim();
	if (lastProperty) properties.push(lastProperty);
	return properties;
}
function parseObjectPropertyKey(property) {
	if (property.startsWith("...")) return null;
	const colonIndex = findTopLevelColonIndex(property);
	if (colonIndex === -1) return null;
	const rawKey = property.slice(0, colonIndex).trim();
	if (!rawKey || rawKey.startsWith("[")) return null;
	if (/^[A-Za-z_$][\w$]*$/.test(rawKey)) return rawKey;
	if (/^\d+$/.test(rawKey)) return rawKey;
	if (rawKey.length >= 2) {
		const quote = rawKey[0];
		const endQuote = rawKey[rawKey.length - 1];
		if ((quote === "\"" || quote === "'" || quote === "`") && endQuote === quote) return unescapeQuotedKey(rawKey.slice(1, -1));
	}
	return null;
}
function findTopLevelColonIndex(source) {
	let inString = null;
	let escaped = false;
	let inLineComment = false;
	let inBlockComment = false;
	let braceDepth = 0;
	let bracketDepth = 0;
	let parenDepth = 0;
	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		const next = source[i + 1];
		if (inLineComment) {
			if (char === "\n") inLineComment = false;
			continue;
		}
		if (inBlockComment) {
			if (char === "*" && next === "/") {
				inBlockComment = false;
				i++;
			}
			continue;
		}
		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === inString) inString = null;
			continue;
		}
		if (char === "/" && next === "/") {
			inLineComment = true;
			i++;
			continue;
		}
		if (char === "/" && next === "*") {
			inBlockComment = true;
			i++;
			continue;
		}
		if (char === "\"" || char === "'" || char === "`") {
			inString = char;
			continue;
		}
		if (char === "{") {
			braceDepth++;
			continue;
		}
		if (char === "}") {
			braceDepth--;
			continue;
		}
		if (char === "[") {
			bracketDepth++;
			continue;
		}
		if (char === "]") {
			bracketDepth--;
			continue;
		}
		if (char === "(") {
			parenDepth++;
			continue;
		}
		if (char === ")") {
			parenDepth--;
			continue;
		}
		if (braceDepth === 0 && bracketDepth === 0 && parenDepth === 0 && char === ":") return i;
	}
	return -1;
}
function unescapeQuotedKey(value) {
	return value.replace(/\\(['"`\\])/g, "$1").replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "	");
}
function findNextNonSpaceIndex(source, fromIndex) {
	for (let i = fromIndex; i < source.length; i++) {
		const char = source[i];
		if (!char) break;
		if (!/\s/.test(char)) return i;
	}
	return -1;
}
function findMatchingBrace(source, openIndex) {
	let depth = 0;
	let inString = null;
	let escaped = false;
	let inLineComment = false;
	let inBlockComment = false;
	for (let i = openIndex; i < source.length; i++) {
		const char = source[i];
		const next = source[i + 1];
		if (inLineComment) {
			if (char === "\n") inLineComment = false;
			continue;
		}
		if (inBlockComment) {
			if (char === "*" && next === "/") {
				inBlockComment = false;
				i++;
			}
			continue;
		}
		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === inString) inString = null;
			continue;
		}
		if (char === "/" && next === "/") {
			inLineComment = true;
			i++;
			continue;
		}
		if (char === "/" && next === "*") {
			inBlockComment = true;
			i++;
			continue;
		}
		if (char === "\"" || char === "'" || char === "`") {
			inString = char;
			continue;
		}
		if (char === "{") depth++;
		if (char === "}") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}
function renderLocaleMessageIdDts(messageIds) {
	const lines = [...messageIds].sort((a, b) => a.localeCompare(b)).map((id) => `    ${JSON.stringify(id)}: true`);
	return `// Auto-generated by vite-plugin-webext. Do not edit.
declare global {
  interface WebextI18nMessageIdMap {
${lines.join("\n")}${lines.length > 0 ? "\n" : ""}  }
}
export {}
`;
}
function normalizePath$1(filePath) {
	return filePath.split(path.sep).join("/");
}
//#endregion
//#region src/messaging/transform.ts
const MESSAGING_IMPORT_SOURCES = new Set(["@taisan11/vite-plugin-webext/messaging", "@taisan11/vite-plugin-webext/src/messaging"]);
function rewriteMessagingCalls(code, parse) {
	if (!hasMessagingImport(code)) return {
		count: 0,
		code,
		map: null
	};
	const ast = parse(code);
	const callTargets = collectImportedMessagingCallTargets(ast);
	if (callTargets.direct.size === 0 && callTargets.namespaces.size === 0) return {
		count: 0,
		code,
		map: null
	};
	const magic = new MagicString(code);
	let count = 0;
	walkAst(ast, (node) => {
		if (node.type !== "CallExpression") return;
		const operation = resolveMessagingOperation(node, callTargets);
		if (!operation) return;
		const replacement = renderMessagingReplacement(operation, Array.isArray(node.arguments) ? node.arguments : [], code);
		if (!replacement) return;
		if (typeof node.start !== "number" || typeof node.end !== "number") return;
		magic.overwrite(node.start, node.end, replacement);
		count++;
	});
	return {
		count,
		code: count > 0 ? magic.toString() : code,
		map: count > 0 ? magic.generateMap({ hires: true }) : null
	};
}
function hasMessagingImport(code) {
	return code.includes("vite-plugin-webext/messaging");
}
function collectImportedMessagingCallTargets(ast) {
	const direct = /* @__PURE__ */ new Map();
	const namespaces = /* @__PURE__ */ new Set();
	walkAst(ast, (node) => {
		if (node.type !== "ImportDeclaration") return;
		const source = node.source;
		if (typeof source?.value !== "string" || !MESSAGING_IMPORT_SOURCES.has(source.value)) return;
		const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
		for (const specifier of specifiers) {
			if (specifier.type === "ImportSpecifier") {
				const imported = specifier.imported;
				const local = specifier.local;
				if (typeof local?.name !== "string") continue;
				if (imported?.name === "sendMessage") {
					direct.set(local.name, "runtime");
					continue;
				}
				if (imported?.name === "sendMessageToTab") direct.set(local.name, "tabs");
			}
			if (specifier.type === "ImportNamespaceSpecifier") {
				const local = specifier.local;
				if (typeof local?.name === "string") namespaces.add(local.name);
			}
		}
	});
	return {
		direct,
		namespaces
	};
}
function resolveMessagingOperation(node, callTargets) {
	const callee = node.callee;
	if (!callee) return null;
	if (callee.type === "Identifier" && typeof callee.name === "string") return callTargets.direct.get(callee.name) ?? null;
	if ((callee.type === "MemberExpression" || callee.type === "OptionalMemberExpression") && !callee.computed) {
		const object = callee.object;
		const property = callee.property;
		if (object?.type !== "Identifier" || typeof object.name !== "string" || !callTargets.namespaces.has(object.name) || property?.type !== "Identifier") return null;
		if (property.name === "sendMessage") return "runtime";
		if (property.name === "sendMessageToTab") return "tabs";
	}
	return null;
}
function renderMessagingReplacement(operation, args, code) {
	if (operation === "runtime") {
		const typeArg = args[0];
		const payloadArg = args[1];
		if (!typeArg || !payloadArg) return null;
		if (typeArg.type === "SpreadElement" || payloadArg.type === "SpreadElement") return null;
		const typeSource = sliceNode(code, typeArg);
		const payloadSource = sliceNode(code, payloadArg);
		if (!typeSource || !payloadSource) return null;
		const optionsSource = args[2] ? sliceNode(code, args[2]) : "";
		if (args[2] && !optionsSource) return null;
		const messageObject = `{ type: ${typeSource}, payload: ${payloadSource} }`;
		return optionsSource ? `browser.runtime.sendMessage(${messageObject}, ${optionsSource})` : `browser.runtime.sendMessage(${messageObject})`;
	}
	const tabIdArg = args[0];
	const typeArg = args[1];
	const payloadArg = args[2];
	if (!tabIdArg || !typeArg || !payloadArg) return null;
	if (tabIdArg.type === "SpreadElement" || typeArg.type === "SpreadElement" || payloadArg.type === "SpreadElement") return null;
	const tabIdSource = sliceNode(code, tabIdArg);
	const typeSource = sliceNode(code, typeArg);
	const payloadSource = sliceNode(code, payloadArg);
	if (!tabIdSource || !typeSource || !payloadSource) return null;
	const optionsSource = args[3] ? sliceNode(code, args[3]) : "";
	if (args[3] && !optionsSource) return null;
	const messageObject = `{ type: ${typeSource}, payload: ${payloadSource} }`;
	return optionsSource ? `browser.tabs.sendMessage(${tabIdSource}, ${messageObject}, ${optionsSource})` : `browser.tabs.sendMessage(${tabIdSource}, ${messageObject})`;
}
function sliceNode(code, node) {
	if (typeof node.start !== "number" || typeof node.end !== "number") return "";
	return code.slice(node.start, node.end);
}
function walkAst(node, visit) {
	if (!node || typeof node !== "object") return;
	const astNode = node;
	if (!astNode.type) return;
	visit(astNode);
	for (const value of Object.values(astNode)) {
		if (!value) continue;
		if (Array.isArray(value)) {
			for (const item of value) walkAst(item, visit);
			continue;
		}
		walkAst(value, visit);
	}
}
//#endregion
//#region src/index.ts
function webext(options) {
	const { defaultBrowser, browser, unavailableApi = "error", staticTransform = true, injectGlobals, manifest, zipArtifacts = true, i18n } = options;
	const configuredDefaultBrowser = resolveConfiguredDefaultBrowser(browser, defaultBrowser);
	const shouldTransformNamespaces = injectGlobals ?? staticTransform;
	const resolvedI18nOptions = resolveI18nOptions(i18n);
	let activeBrowser = null;
	let resolvedManifest = null;
	let localeMessageIds = /* @__PURE__ */ new Set();
	let rootDir = process.cwd();
	let browserOutDir = path.resolve(rootDir, "dist");
	let distRootDir = browserOutDir;
	let isBuild = false;
	return {
		name: "vite-plugin-webext",
		enforce: "pre",
		config(userConfig, configEnv) {
			isBuild = configEnv.command === "build";
			activeBrowser = resolveBrowserTarget(configEnv.mode, configuredDefaultBrowser);
			resolvedManifest = manifest ? resolveManifest(manifest, activeBrowser) : null;
			const outDir = withBrowserSubDir(userConfig.build?.outDir ?? "dist", activeBrowser);
			return {
				define: {
					"import.meta.env.BROWSER": JSON.stringify(activeBrowser),
					"import.meta.env.IS_FIREFOX": JSON.stringify(activeBrowser === "firefox"),
					"import.meta.env.IS_CHROME": JSON.stringify(activeBrowser === "chrome")
				},
				build: { outDir }
			};
		},
		async configResolved(config) {
			rootDir = config.root;
			activeBrowser = activeBrowser ?? resolveBrowserTarget(config.mode, configuredDefaultBrowser);
			resolvedManifest = manifest ? resolveManifest(manifest, activeBrowser) : null;
			browserOutDir = path.resolve(rootDir, config.build.outDir);
			distRootDir = path.resolve(browserOutDir, "..");
			if (resolvedI18nOptions.enabled) localeMessageIds = (await prepareI18nArtifacts(rootDir, resolvedI18nOptions)).messageIds;
		},
		generateBundle: {
			order: "post",
			handler(_, bundle) {
				if (!manifest || !resolvedManifest) return;
				const outputBundle = bundle;
				rewriteSourcePrefixedBundlePaths(outputBundle);
				if (outputBundle["manifest.json"]) this.error("[vite-plugin-webext] `manifest.json` already exists in build output. Remove the duplicate or omit `webext({ manifest })`.");
				const manifestWithResolvedPaths = resolveManifestPathsFromBundle(resolvedManifest, outputBundle, rootDir);
				resolvedManifest = manifestWithResolvedPaths;
				this.emitFile({
					type: "asset",
					fileName: "manifest.json",
					source: `${JSON.stringify(manifestWithResolvedPaths, null, 2)}\n`
				});
			}
		},
		transform(code, id) {
			if (id.includes("node_modules")) return null;
			let transformedCode = code;
			let transformedMap = null;
			let i18nRewriteCount = 0;
			let messagingRewriteCount = 0;
			if (resolvedI18nOptions.enabled) {
				const i18nRewritten = rewriteI18nTCalls(transformedCode, (source) => this.parse(source), localeMessageIds);
				if (i18nRewritten.unknownIds.length > 0) this.error(`[vite-plugin-webext] Unknown i18n message id(s): ${i18nRewritten.unknownIds.join(", ")}\n  → ${id}\n  Define ids in src/locale/[localeName].ts using defineLocale({...}).`);
				if (i18nRewritten.count > 0) {
					transformedCode = i18nRewritten.code;
					transformedMap = i18nRewritten.map;
					i18nRewriteCount = i18nRewritten.count;
					this.warn(`[vite-plugin-webext] Rewrote ${i18nRewriteCount} i18n call(s) to "browser.i18n.getMessage(...)" in ${id}.`);
				}
			}
			const messagingRewritten = rewriteMessagingCalls(transformedCode, (source) => this.parse(source));
			if (messagingRewritten.count > 0) {
				transformedCode = messagingRewritten.code;
				transformedMap = i18nRewriteCount > 0 ? null : messagingRewritten.map;
				messagingRewriteCount = messagingRewritten.count;
				this.warn(`[vite-plugin-webext] Rewrote ${messagingRewriteCount} messaging helper call(s) to native extension APIs in ${id}.`);
			}
			if (!hasApiNamespaceAccess(transformedCode)) {
				if (i18nRewriteCount === 0 && messagingRewriteCount === 0) return null;
				return {
					code: transformedCode,
					map: transformedMap
				};
			}
			const currentBrowser = requireBrowser(activeBrowser);
			const unavailableApis = currentBrowser === "chrome" ? FIREFOX_ONLY_APIS : CHROME_ONLY_APIS;
			for (const api of unavailableApis) {
				if (!hasUnavailableApiAccess(transformedCode, api)) continue;
				const message = `[vite-plugin-webext] API "${api}" is not available in ${currentBrowser}.\n  → ${id}`;
				if (unavailableApi === "error") this.error(message);
				else if (unavailableApi === "warn") this.warn(message);
			}
			if (!shouldTransformNamespaces) {
				if (i18nRewriteCount === 0 && messagingRewriteCount === 0) return null;
				return {
					code: transformedCode,
					map: transformedMap
				};
			}
			const targetNamespace = resolveApiNamespace(currentBrowser);
			const rewritten = rewriteApiNamespaces(transformedCode, (source) => this.parse(source), targetNamespace);
			if (rewritten.count === 0) {
				if (i18nRewriteCount === 0 && messagingRewriteCount === 0) return null;
				return {
					code: transformedCode,
					map: transformedMap
				};
			}
			this.warn(`[vite-plugin-webext] Rewrote ${rewritten.count} API namespace reference(s) to "${targetNamespace}.*" in ${id}.`);
			return {
				code: rewritten.code,
				map: i18nRewriteCount > 0 || messagingRewriteCount > 0 ? null : rewritten.map
			};
		},
		async closeBundle() {
			if (!isBuild || !zipArtifacts) return;
			const currentBrowser = requireBrowser(activeBrowser);
			const versionResult = await resolveArtifactVersion(browserOutDir, resolvedManifest);
			if (versionResult.source === "fallback") this.warn(`[vite-plugin-webext] Could not resolve manifest version for zip artifacts. Using fallback version "${versionResult.version}".`);
			const version = sanitizeVersionForFileName(versionResult.version);
			const sourceZipPath = path.join(distRootDir, `${currentBrowser}-${version}-source.zip`);
			const distZipPath = path.join(distRootDir, `${currentBrowser}-${version}-dist.zip`);
			const modeZipPath = path.join(distRootDir, `${currentBrowser}-zip.zip`);
			await promises.mkdir(distRootDir, { recursive: true });
			await createSourceZip(rootDir, sourceZipPath);
			if (!await directoryExists(browserOutDir)) {
				this.warn(`[vite-plugin-webext] Skipping dist zip artifacts because output directory "${browserOutDir}" does not exist. This can happen when \`build.write\` is disabled.`);
				return;
			}
			await createDirectoryZip(browserOutDir, distZipPath);
			await promises.copyFile(distZipPath, modeZipPath);
		}
	};
}
function resolveConfiguredDefaultBrowser(browser, defaultBrowser) {
	if (!defaultBrowser) return browser;
	if (!browser || browser === defaultBrowser) return defaultBrowser;
	throw new Error("[vite-plugin-webext] `browser` and `defaultBrowser` are both set with different values. Use only one option, or set the same value for both.");
}
function resolveBrowserTarget(mode, configuredBrowser) {
	const browserFromMode = parseBrowserMode(mode);
	if (browserFromMode) return browserFromMode;
	if (configuredBrowser) return configuredBrowser;
	throw new Error("[vite-plugin-webext] Could not resolve browser target. Use `vite build --mode chrome|firefox` or pass `webext({ defaultBrowser })` (or legacy `webext({ browser })`).");
}
function parseBrowserMode(mode) {
	if (mode === "chrome" || mode === "firefox") return mode;
	return null;
}
function requireBrowser(browser) {
	if (!browser) throw new Error("[vite-plugin-webext] Browser target is not resolved.");
	return browser;
}
function withBrowserSubDir(outDir, browser) {
	if (path.basename(outDir) === browser) return outDir;
	return path.join(outDir, browser);
}
function resolveManifest(manifest, browser) {
	return typeof manifest === "function" ? manifest(browser) : manifest;
}
function rewriteSourcePrefixedBundlePaths(bundle) {
	for (const output of Object.values(bundle)) output.fileName = stripLeadingSrcSegment(output.fileName);
	const renameMap = /* @__PURE__ */ new Map();
	for (const output of Object.values(bundle)) renameMap.set(normalizePath(output.fileName), output.fileName);
	for (const output of Object.values(bundle)) {
		if (output.type !== "chunk") continue;
		output.imports = rewriteReferencedFiles(output.imports, renameMap);
		output.dynamicImports = rewriteReferencedFiles(output.dynamicImports, renameMap);
		output.implicitlyLoadedBefore = rewriteReferencedFiles(output.implicitlyLoadedBefore, renameMap);
		output.referencedFiles = rewriteReferencedFiles(output.referencedFiles, renameMap);
	}
}
function rewriteReferencedFiles(files, renameMap) {
	if (!files) return [];
	return files.map((fileName) => renameMap.get(normalizePath(fileName)) ?? fileName);
}
function stripLeadingSrcSegment(fileName) {
	const normalized = normalizePath(fileName);
	if (!normalized.startsWith("src/")) return normalized;
	return normalized.slice(4);
}
function resolveManifestPathsFromBundle(manifest, bundle, rootDir) {
	return rewriteManifestPathLikeStrings(manifest, buildSourceToOutputPathMap(bundle, rootDir));
}
function buildSourceToOutputPathMap(bundle, rootDir) {
	const pathMap = /* @__PURE__ */ new Map();
	for (const output of Object.values(bundle)) {
		if (output.type === "chunk") {
			registerChunkPath(pathMap, output, rootDir);
			continue;
		}
		registerAssetPaths(pathMap, output, rootDir);
	}
	return pathMap;
}
function registerChunkPath(pathMap, chunk, rootDir) {
	if (!chunk.isEntry || !chunk.facadeModuleId) return;
	const relativeSourcePath = normalizeSourcePath(path.relative(rootDir, chunk.facadeModuleId));
	if (!relativeSourcePath || relativeSourcePath.startsWith("../")) return;
	if (relativeSourcePath.endsWith(".html")) return;
	setPathMapping(pathMap, relativeSourcePath, chunk.fileName);
}
function registerAssetPaths(pathMap, asset, rootDir) {
	for (const originalFileName of getAssetOriginalFileNames(asset)) {
		const relativeSourcePath = normalizeSourcePath(path.isAbsolute(originalFileName) ? path.relative(rootDir, originalFileName) : originalFileName);
		if (!relativeSourcePath || relativeSourcePath.startsWith("../")) continue;
		setPathMapping(pathMap, relativeSourcePath, asset.fileName);
	}
}
function getAssetOriginalFileNames(asset) {
	const names = [];
	if (Array.isArray(asset.originalFileNames)) names.push(...asset.originalFileNames);
	if (typeof asset.originalFileName === "string") names.push(asset.originalFileName);
	return names;
}
function setPathMapping(pathMap, sourcePath, outputPath) {
	const normalizedSource = normalizeSourcePath(sourcePath);
	const normalizedOutput = normalizePath(outputPath);
	if (!normalizedSource) return;
	pathMap.set(normalizedSource, normalizedOutput);
	if (normalizedSource.startsWith("src/")) pathMap.set(normalizedSource.slice(4), normalizedOutput);
}
function rewriteManifestPathLikeStrings(manifest, sourceToOutput) {
	return rewriteManifestValue(JSON.parse(JSON.stringify(manifest)), sourceToOutput);
}
function rewriteManifestValue(value, sourceToOutput) {
	if (Array.isArray(value)) return value.map((entry) => rewriteManifestValue(entry, sourceToOutput));
	if (value && typeof value === "object") {
		const result = {};
		for (const [key, childValue] of Object.entries(value)) result[key] = rewriteManifestValue(childValue, sourceToOutput);
		return result;
	}
	if (typeof value === "string") return rewriteManifestPath(value, sourceToOutput);
	return value;
}
function rewriteManifestPath(value, sourceToOutput) {
	if (isExternalSpecifier(value)) return value;
	const normalized = normalizeSourcePath(value);
	if (!normalized) return value;
	const mapped = sourceToOutput.get(normalized);
	if (mapped) return mapped;
	if (normalized.startsWith("src/")) return normalized.slice(4);
	return value;
}
function isExternalSpecifier(value) {
	return /^[A-Za-z][A-Za-z\d+\-.]*:/.test(value) || value.startsWith("//");
}
function normalizeSourcePath(filePath) {
	return normalizePath(filePath).replace(/^\.\/+/, "").replace(/^\/+/, "");
}
function normalizePath(filePath) {
	return filePath.split(path.sep).join("/");
}
function sanitizeVersionForFileName(version) {
	return version.replace(/[^A-Za-z0-9._-]/g, "_");
}
async function resolveArtifactVersion(outDir, manifest) {
	if (manifest?.version) return {
		version: manifest.version,
		source: "manifest-option"
	};
	const manifestPath = path.join(outDir, "manifest.json");
	try {
		await promises.access(manifestPath);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		return {
			version: "0.0.0",
			source: "fallback"
		};
	}
	const manifestRaw = await promises.readFile(manifestPath, "utf8");
	const parsed = JSON.parse(manifestRaw);
	if (typeof parsed.version === "string" && parsed.version.trim()) return {
		version: parsed.version,
		source: "manifest-file"
	};
	return {
		version: "0.0.0",
		source: "fallback"
	};
}
async function createSourceZip(rootDirectory, outputPath) {
	await writeZip(outputPath, await collectZipEntries(rootDirectory, rootDirectory, shouldIncludeSourceEntry));
}
async function createDirectoryZip(directory, outputPath) {
	await writeZip(outputPath, await collectZipEntries(directory, directory, () => true));
}
async function directoryExists(directory) {
	try {
		return (await promises.stat(directory)).isDirectory();
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}
async function collectZipEntries(rootDirectory, currentDirectory, shouldInclude) {
	const results = [];
	const entries = await promises.readdir(currentDirectory, { withFileTypes: true });
	for (const entry of entries) {
		const absolutePath = path.join(currentDirectory, entry.name);
		const relativePath = path.relative(rootDirectory, absolutePath);
		if (!shouldInclude(relativePath, entry.isDirectory())) continue;
		if (entry.isDirectory()) {
			const nested = await collectZipEntries(rootDirectory, absolutePath, shouldInclude);
			results.push(...nested);
			continue;
		}
		if (!entry.isFile()) continue;
		const content = await promises.readFile(absolutePath);
		const data = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
		results.push({
			name: toPosixPath(relativePath),
			data
		});
	}
	return results;
}
async function writeZip(outputPath, entries) {
	const zipWriter = new ZipWriter(new Uint8ArrayWriter());
	let closed = false;
	try {
		for (const entry of entries) await zipWriter.add(entry.name, new Uint8ArrayReader(entry.data));
		const zipData = await zipWriter.close();
		closed = true;
		await promises.writeFile(outputPath, Buffer.from(zipData));
	} finally {
		if (!closed) await zipWriter.close().catch(() => void 0);
	}
}
function shouldIncludeSourceEntry(relativePath) {
	return !relativePath.split(path.sep).some((segment) => segment === "node_modules" || segment === "dist" || segment === ".git" || segment === ".copilot");
}
function toPosixPath(filePath) {
	return normalizePath(filePath);
}
//#endregion
export { webext };

//# sourceMappingURL=index.mjs.map