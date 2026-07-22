import { n as injectScript, t as defineUnlistedScript } from "./inject-script-CvNLWJUM.mjs";
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
	"telemetry"
];
function hasApiNamespaceAccess(code) {
	return /\b(?:browser|chrome)\s*(?:\.|\?\.)/.test(code);
}
function hasUnavailableApiAccess(code, api) {
	return new RegExp(`(?:browser|chrome)\\??\\.${escapeRe(api)}\\b`).test(code);
}
function escapeRe(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
//#endregion
//#region src/magic-string.ts
function createMagicString(code, options = {}) {
	return options.magicString ?? new MagicString(code);
}
function finishMagicStringTransform(code, magic, count, options = {}) {
	if (count === 0) return {
		code,
		map: null
	};
	if (options.returnMagicString) return {
		code: magic,
		map: null
	};
	return {
		code: magic.toString(),
		map: generateMap(magic)
	};
}
function generateMap(magic) {
	const map = magic.generateMap?.({ hires: true });
	return map == null ? null : map;
}
//#endregion
//#region src/utils/ast.ts
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
//#region src/utils/path.ts
function normalizePath(filePath) {
	return filePath.split(path.sep).join("/");
}
//#endregion
//#region src/i18n/transform.ts
const DEFAULT_LOCALE_DIR = "src/locale";
const DEFAULT_DTS_NAME = "webext-i18n.d.ts";
const LOCALE_SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const I18N_IMPORT_SOURCES = /* @__PURE__ */ new Set(["@taisan11/vite-plugin-webext/i18n", "@taisan11/vite-plugin-webext/src/i18n"]);
function resolveI18nOptions(i18n) {
	if (i18n === false || i18n == null) return {
		enabled: false,
		localeDir: DEFAULT_LOCALE_DIR,
		generatedDtsPath: normalizePath(path.join(DEFAULT_LOCALE_DIR, DEFAULT_DTS_NAME))
	};
	if (i18n === true) return {
		enabled: true,
		localeDir: DEFAULT_LOCALE_DIR,
		generatedDtsPath: normalizePath(path.join(DEFAULT_LOCALE_DIR, DEFAULT_DTS_NAME))
	};
	const localeDir = normalizePath(i18n.localeDir?.trim() || DEFAULT_LOCALE_DIR);
	return {
		enabled: i18n.enabled ?? true,
		localeDir,
		generatedDtsPath: normalizePath(path.join(localeDir, DEFAULT_DTS_NAME))
	};
}
async function prepareI18nArtifacts(rootDir, options) {
	const localeFiles = await readLocaleFiles(path.resolve(rootDir, options.localeDir));
	if (localeFiles.length === 0) throw new Error(`[vite-plugin-webext] i18n is enabled, but no locale source files were found in "${options.localeDir}". Create src/locale/[localeName].ts and export defineLocale({...}).`);
	const messageIds = /* @__PURE__ */ new Set();
	const localeEntries = [];
	for (const filePath of localeFiles) {
		const source = await promises.readFile(filePath, "utf8");
		for (const id of extractDefineLocaleMessageIds(source)) messageIds.add(id);
		const entry = extractDefineLocaleEntries(source, extractLocaleCodeFromFilePath(filePath));
		if (entry) localeEntries.push(entry);
	}
	const generatedDtsPath = path.resolve(rootDir, options.generatedDtsPath);
	await promises.mkdir(path.dirname(generatedDtsPath), { recursive: true });
	await promises.writeFile(generatedDtsPath, renderLocaleMessageIdDts(messageIds));
	return {
		messageIds,
		localeEntries
	};
}
function rewriteI18nTCalls(code, parse, messageIds, options = {}) {
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
	const magic = createMagicString(code, options);
	let count = 0;
	const unknownIds = /* @__PURE__ */ new Set();
	const apiNamespace = options.apiNamespace ?? "browser";
	walkAst(ast, (node) => {
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
		magic.overwrite(callStart, callEnd, `${apiNamespace}.i18n.getMessage(${serializedArgs})`);
		count++;
	});
	return {
		count,
		unknownIds: [...unknownIds].sort(),
		...finishMagicStringTransform(code, magic, count, options)
	};
}
function hasI18nImport(code) {
	return code.includes("vite-plugin-webext/i18n");
}
function collectImportedTCallTargets(ast) {
	const direct = /* @__PURE__ */ new Set();
	const namespaces = /* @__PURE__ */ new Set();
	walkAst(ast, (node) => {
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
function extractLocaleCodeFromFilePath(filePath) {
	const basename = path.basename(filePath);
	const ext = path.extname(basename);
	return basename.slice(0, -ext.length).replace(/-/g, "_");
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
		const parsed = parseObjectPropertyKey(property);
		if (parsed) keys.push(parsed.key);
	}
	return keys;
}
function extractDefineLocaleEntries(source, localeCode) {
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
		const messages = {};
		const properties = splitTopLevelObjectProperties(objectText);
		for (const property of properties) {
			const parsed = parseObjectPropertyKey(property);
			if (parsed) messages[parsed.key] = parsePropertyValue(parsed.valueText);
		}
		return {
			locale: localeCode,
			messages
		};
	}
	return null;
}
function parsePropertyValue(valueText) {
	const trimmed = valueText.trim();
	if (!trimmed) return "";
	if (trimmed[0] === "{") {
		const end = findMatchingBrace(trimmed, 0);
		if (end === trimmed.length - 1) return parseNestedObject(trimmed.slice(1, end));
	}
	if (trimmed[0] === "[") {
		const end = findMatchingBracket(trimmed, 0);
		if (end === trimmed.length - 1) return parseNestedArray(trimmed.slice(1, end));
	}
	if ((trimmed[0] === "\"" || trimmed[0] === "'" || trimmed[0] === "`") && trimmed.length >= 2) {
		const quote = trimmed[0];
		if (trimmed[trimmed.length - 1] === quote) return unescapeQuotedKey(trimmed.slice(1, -1));
	}
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (trimmed === "null") return null;
	if (trimmed === "undefined") return void 0;
	return trimmed;
}
function parseNestedObject(source) {
	const result = {};
	const properties = splitTopLevelObjectProperties(source);
	for (const property of properties) {
		const parsed = parseObjectPropertyKey(property);
		if (parsed) result[parsed.key] = parsePropertyValue(parsed.valueText);
	}
	return result;
}
function parseNestedArray(source) {
	const items = [];
	const trimmed = source.trim();
	if (!trimmed) return items;
	let depth = 0;
	let inString = null;
	let escaped = false;
	let start = 0;
	for (let i = 0; i < trimmed.length; i++) {
		const char = trimmed[i];
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
		if (char === "\"" || char === "'" || char === "`") {
			inString = char;
			continue;
		}
		if (char === "{" || char === "[" || char === "(") {
			depth++;
			continue;
		}
		if (char === "}" || char === "]" || char === ")") {
			depth--;
			continue;
		}
		if (depth === 0 && char === ",") {
			const item = trimmed.slice(start, i).trim();
			if (item) items.push(parsePropertyValue(item));
			start = i + 1;
		}
	}
	const lastItem = trimmed.slice(start).trim();
	if (lastItem) items.push(parsePropertyValue(lastItem));
	return items;
}
function findMatchingBracket(source, openIndex) {
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
		if (char === "[") depth++;
		if (char === "]") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}
function transformLocaleEntriesToMessagesJson(entries) {
	const result = {};
	for (const entry of entries) {
		const messages = {};
		for (const [id, value] of Object.entries(entry.messages)) if (typeof value === "string") messages[id] = { message: value };
		else if (value && typeof value === "object") messages[id] = value;
		result[entry.locale] = messages;
	}
	return result;
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
			if (char === "\n") {
				inLineComment = false;
				segmentStart = i + 1;
			}
			continue;
		}
		if (inBlockComment) {
			if (char === "*" && next === "/") {
				inBlockComment = false;
				i++;
				segmentStart = i + 1;
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
	const colonIndex = findLastTopLevelColonIndex(property);
	if (colonIndex === -1) return null;
	const rawKey = property.slice(0, colonIndex).trim();
	if (!rawKey || rawKey.startsWith("[")) return null;
	let key = null;
	if (/^[A-Za-z_$][\w$]*$/.test(rawKey)) key = rawKey;
	else if (/^\d+$/.test(rawKey)) key = rawKey;
	else if (rawKey.length >= 2) {
		const quote = rawKey[0];
		const endQuote = rawKey[rawKey.length - 1];
		if ((quote === "\"" || quote === "'" || quote === "`") && endQuote === quote) key = unescapeQuotedKey(rawKey.slice(1, -1));
	}
	if (!key) return null;
	let valueText = property.slice(colonIndex + 1).trim();
	if (valueText.endsWith(",")) valueText = valueText.slice(0, -1).trim();
	return {
		key,
		valueText
	};
}
function findLastTopLevelColonIndex(source) {
	let lastIndex = -1;
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
		if (braceDepth === 0 && bracketDepth === 0 && parenDepth === 0 && char === ":") lastIndex = i;
	}
	return lastIndex;
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
//#endregion
//#region src/messaging/transform.ts
const MESSAGING_IMPORT_SOURCES = /* @__PURE__ */ new Set(["@taisan11/vite-plugin-webext/messaging", "@taisan11/vite-plugin-webext/src/messaging"]);
function rewriteMessagingCalls(code, parse, options = {}) {
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
	const magic = createMagicString(code, options);
	let count = 0;
	const apiNamespace = options.apiNamespace ?? "browser";
	walkAst(ast, (node) => {
		if (node.type !== "CallExpression") return;
		const operation = resolveMessagingOperation(node, callTargets);
		if (!operation) return;
		const replacement = renderMessagingReplacement(operation, Array.isArray(node.arguments) ? node.arguments : [], code, apiNamespace);
		if (!replacement) return;
		if (typeof node.start !== "number" || typeof node.end !== "number") return;
		magic.overwrite(node.start, node.end, replacement);
		count++;
	});
	return {
		count,
		...finishMagicStringTransform(code, magic, count, options)
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
function renderMessagingReplacement(operation, args, code, apiNamespace) {
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
		return optionsSource ? `${apiNamespace}.runtime.sendMessage(${messageObject}, ${optionsSource})` : `${apiNamespace}.runtime.sendMessage(${messageObject})`;
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
	return optionsSource ? `${apiNamespace}.tabs.sendMessage(${tabIdSource}, ${messageObject}, ${optionsSource})` : `${apiNamespace}.tabs.sendMessage(${tabIdSource}, ${messageObject})`;
}
function sliceNode(code, node) {
	if (typeof node.start !== "number" || typeof node.end !== "number") return "";
	return code.slice(node.start, node.end);
}
//#endregion
//#region src/utils/manifest-inputs.ts
/**
* Collect entry-ish file paths declared in a manifest that should be built
* as bundle inputs. HTML pages are referenced directly; script files that
* sit next to an HTML page are resolved by Vite when the page is processed,
* so only the HTML (or the top-level script) needs to be listed.
*/
function collectManifestInputs(manifest, rootDir) {
	const entries = /* @__PURE__ */ new Map();
	const addHtml = (name, relativePath) => {
		if (!relativePath) return;
		if (!isHtmlPath(relativePath)) return;
		if (entries.has(name)) return;
		entries.set(name, resolveInputPath(relativePath, rootDir));
	};
	const addScript = (name, relativePath) => {
		if (!relativePath) return;
		if (entries.has(name)) return;
		entries.set(name, resolveInputPath(relativePath, rootDir));
	};
	const background = manifest.background;
	if (background) if ("service_worker" in background && background.service_worker) addScript("background", background.service_worker);
	else {
		const mv2 = background;
		if (mv2.page) addHtml("background", mv2.page);
		if (mv2.scripts) for (const script of mv2.scripts) addScript(`background-${path.basename(script, path.extname(script))}`, script);
	}
	const actions = [
		manifest.action,
		manifest.browser_action,
		manifest.page_action
	].filter(Boolean);
	for (const action of actions) {
		const popup = action.default_popup;
		if (popup) addHtml("popup", popup);
	}
	if (manifest.options_ui?.page) addHtml("options", manifest.options_ui.page);
	if (manifest.options_page) addHtml("options", manifest.options_page);
	if (manifest.devtools_page) addHtml("devtools", manifest.devtools_page);
	if (manifest.side_panel?.default_path) addHtml("side_panel", manifest.side_panel.default_path);
	if (manifest.sidebar_action?.default_panel) addHtml("sidebar", manifest.sidebar_action.default_panel);
	const overrides = manifest.chrome_url_overrides;
	if (overrides) {
		if (overrides.newtab) addHtml("newtab", overrides.newtab);
		if (overrides.bookmarks) addHtml("bookmarks", overrides.bookmarks);
		if (overrides.history) addHtml("history", overrides.history);
	}
	if (manifest.sandbox?.pages) manifest.sandbox.pages.forEach((page, index) => addHtml(`sandbox-${index}`, page));
	manifest.content_scripts?.forEach((contentScript, contentScriptIndex) => {
		contentScript.js?.forEach((script, scriptIndex) => {
			addScript(`content-${contentScriptIndex}-${scriptIndex}`, script);
		});
	});
	return Object.fromEntries(entries);
}
function isHtmlPath(relativePath) {
	return /\.html?$/i.test(relativePath.trim());
}
function resolveInputPath(relativePath, rootDir) {
	const normalized = normalizePath(relativePath.replace(/^\.?\//, ""));
	return path.resolve(rootDir, normalized);
}
//#endregion
//#region src/utils/unlisted-scripts.ts
function collectUnlistedScriptInputs(scripts, rootDir) {
	return Object.fromEntries(Object.entries(scripts).map(([name, source]) => {
		return [normalizeUnlistedScriptName(name), path.resolve(rootDir, normalizePath(source).replace(/^\.\//, ""))];
	}));
}
function resolveUnlistedScriptManifest(manifest, names) {
	if (names.length === 0) return manifest;
	const resources = names.map((name) => `${normalizeUnlistedScriptName(name)}.js`);
	const resolved = structuredClone(manifest);
	const existing = resolved.web_accessible_resources;
	if (resolved.manifest_version === 2 || Array.isArray(existing) && existing.every((entry) => typeof entry === "string")) {
		resolved.web_accessible_resources = [...Array.isArray(existing) ? existing.filter((entry) => typeof entry === "string") : [], ...resources];
		return resolved;
	}
	const matches = [...new Set((resolved.content_scripts ?? []).flatMap((contentScript) => contentScript.matches))];
	const resourceEntry = {
		resources,
		matches: matches.length > 0 ? matches : ["<all_urls>"]
	};
	resolved.web_accessible_resources = [...Array.isArray(existing) ? existing.filter((entry) => typeof entry !== "string") : [], resourceEntry];
	return resolved;
}
function normalizeUnlistedScriptName(name) {
	const normalized = normalizePath(name.trim()).replace(/^\/+|\/+$/g, "");
	if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("src/") || normalized.includes("../")) throw new Error(`[vite-plugin-webext] Invalid unlisted script name: "${name}".`);
	return normalized.endsWith(".js") ? normalized.slice(0, -3) : normalized;
}
//#endregion
//#region src/index.ts
function webext(options) {
	const { defaultBrowser, browser, unavailableApi = "error", manifest, zipArtifacts = true, i18n, unlistedScripts, unlistedScript } = options;
	const configuredDefaultBrowser = resolveConfiguredDefaultBrowser(browser, defaultBrowser);
	const resolvedI18nOptions = resolveI18nOptions(i18n);
	const configuredUnlistedScripts = resolveUnlistedScripts(unlistedScripts, unlistedScript);
	let activeBrowser = null;
	let resolvedManifest = null;
	let localeMessageIds = /* @__PURE__ */ new Set();
	let localeEntries = [];
	let rootDir = process.cwd();
	let browserOutDir = path.resolve(rootDir, "dist");
	let distRootDir = browserOutDir;
	let isBuild = false;
	let isZipMode = false;
	function runTransformPipeline(pipeline) {
		const { ctx, code, id, parse, magic, apiNamespace } = pipeline;
		let transformedCodeForChecks = code;
		let i18nRewriteCount = 0;
		let messagingRewriteCount = 0;
		if (resolvedI18nOptions.enabled) {
			const i18nRewritten = rewriteI18nTCalls(code, parse, localeMessageIds, magic ? {
				apiNamespace,
				magicString: magic,
				returnMagicString: true
			} : { apiNamespace });
			if (i18nRewritten.unknownIds.length > 0) ctx.error(`[vite-plugin-webext] Unknown i18n message id(s): ${i18nRewritten.unknownIds.join(", ")}\n  → ${id}\n  Define ids in src/locale/[localeName].ts using defineLocale({...}).`);
			if (i18nRewritten.count > 0) {
				i18nRewriteCount = i18nRewritten.count;
				transformedCodeForChecks = magic ? magic.toString() : i18nRewritten.code.toString();
				ctx.warn(`[vite-plugin-webext] Rewrote ${i18nRewriteCount} i18n call(s) to "${apiNamespace}.i18n.getMessage(...)" in ${id}.`);
			}
		}
		const messagingRewritten = rewriteMessagingCalls(magic ? code : transformedCodeForChecks, parse, magic ? {
			apiNamespace,
			magicString: magic,
			returnMagicString: true
		} : { apiNamespace });
		if (messagingRewritten.count > 0) {
			messagingRewriteCount = messagingRewritten.count;
			transformedCodeForChecks = magic ? magic.toString() : messagingRewritten.code.toString();
			ctx.warn(`[vite-plugin-webext] Rewrote ${messagingRewriteCount} messaging helper call(s) to native extension APIs in ${id}.`);
		}
		if (!hasApiNamespaceAccess(transformedCodeForChecks)) {
			if (i18nRewriteCount === 0 && messagingRewriteCount === 0) return null;
			if (magic) return {
				code: magic,
				map: null
			};
			return {
				code: transformedCodeForChecks,
				map: i18nRewriteCount > 0 ? null : messagingRewritten.map
			};
		}
		const currentBrowser = requireBrowser(activeBrowser);
		const unavailableApis = currentBrowser === "chrome" ? FIREFOX_ONLY_APIS : CHROME_ONLY_APIS;
		for (const api of unavailableApis) {
			if (!hasUnavailableApiAccess(transformedCodeForChecks, api)) continue;
			const message = `[vite-plugin-webext] API "${api}" is not available in ${currentBrowser}.\n  → ${id}`;
			if (unavailableApi === "error") ctx.error(message);
			else if (unavailableApi === "warn") ctx.warn(message);
		}
		if (i18nRewriteCount === 0 && messagingRewriteCount === 0) return null;
		if (magic) return {
			code: magic,
			map: null
		};
		return {
			code: transformedCodeForChecks,
			map: i18nRewriteCount > 0 ? null : messagingRewritten.map
		};
	}
	return {
		name: "vite-plugin-webext",
		config(userConfig, configEnv) {
			isBuild = configEnv.command === "build";
			isZipMode = isBuild && isZipBuildMode(configEnv.mode);
			activeBrowser = resolveBrowserTarget(configEnv.mode, configuredDefaultBrowser);
			resolvedManifest = manifest ? resolveUnlistedScriptManifest(resolveManifest(manifest, activeBrowser), Object.keys(configuredUnlistedScripts)) : null;
			const outDir = withBrowserSubDir(userConfig.build?.outDir ?? "dist", activeBrowser);
			const currentRootDir = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
			const autoInputs = resolvedManifest ? collectManifestInputs(resolvedManifest, currentRootDir) : {};
			const unlistedInputs = collectUnlistedScriptInputs(configuredUnlistedScripts, currentRootDir);
			return {
				define: {
					"import.meta.env.BROWSER": JSON.stringify(activeBrowser),
					"import.meta.env.IS_FIREFOX": JSON.stringify(activeBrowser === "firefox"),
					"import.meta.env.IS_CHROME": JSON.stringify(activeBrowser === "chrome")
				},
				build: {
					outDir,
					rolldownOptions: { input: {
						...autoInputs,
						...unlistedInputs
					} }
				}
			};
		},
		async configResolved(config) {
			rootDir = config.root;
			activeBrowser = activeBrowser ?? resolveBrowserTarget(config.mode, configuredDefaultBrowser);
			resolvedManifest = manifest ? resolveUnlistedScriptManifest(resolveManifest(manifest, activeBrowser), Object.keys(configuredUnlistedScripts)) : null;
			browserOutDir = path.resolve(rootDir, config.build.outDir);
			distRootDir = path.resolve(browserOutDir, "..");
			if (resolvedManifest) {
				const autoInputs = collectManifestInputs(resolvedManifest, rootDir);
				const unlistedInputs = collectUnlistedScriptInputs(configuredUnlistedScripts, rootDir);
				const userInputs = config.build.rolldownOptions?.input ?? {};
				const mergedInputs = {
					...autoInputs,
					...userInputs
				};
				config.build.rolldownOptions = {
					...config.build.rolldownOptions,
					input: {
						...unlistedInputs,
						...mergedInputs
					}
				};
			}
			if (resolvedI18nOptions.enabled) {
				const prepared = await prepareI18nArtifacts(rootDir, resolvedI18nOptions);
				localeMessageIds = prepared.messageIds;
				localeEntries = prepared.localeEntries;
			}
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
				if (resolvedI18nOptions.enabled && localeEntries.length > 0) {
					const messagesByLocale = transformLocaleEntriesToMessagesJson(localeEntries);
					for (const [locale, messages] of Object.entries(messagesByLocale)) this.emitFile({
						type: "asset",
						fileName: `_locales/${locale}/messages.json`,
						source: `${JSON.stringify(messages, null, 2)}\n`
					});
				}
			}
		},
		transform(code, id, meta) {
			if (id.includes("node_modules")) return null;
			const apiNamespace = "browser";
			const nativeMagicString = getNativeMagicString(meta);
			const result = runTransformPipeline({
				ctx: this,
				code,
				id,
				parse: (source) => this.parse(source),
				magic: nativeMagicString ?? void 0,
				apiNamespace
			});
			if (!result) return null;
			if (nativeMagicString) return {
				code: nativeMagicString,
				map: result.map
			};
			return {
				code: result.code,
				map: result.map
			};
		},
		async closeBundle() {
			if (!isBuild || !zipArtifacts || !isZipMode) return;
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
function resolveUnlistedScripts(scripts, script) {
	const resolved = { ...scripts ?? {} };
	if (typeof script === "string") resolved.main = script;
	else if (script) Object.assign(resolved, script);
	return resolved;
}
function isZipBuildMode(mode) {
	return mode.endsWith("-zip") && parseBrowserMode(mode) !== null;
}
function resolveBrowserTarget(mode, configuredBrowser) {
	const browserFromMode = parseBrowserMode(mode);
	if (browserFromMode) return browserFromMode;
	if (configuredBrowser) return configuredBrowser;
	throw new Error("[vite-plugin-webext] Could not resolve browser target. Use `vite build --mode chrome|firefox` or pass `webext({ defaultBrowser })` (or legacy `webext({ browser })`).");
}
function parseBrowserMode(mode) {
	const browserMode = mode.endsWith("-zip") ? mode.slice(0, -4) : mode;
	if (browserMode === "chrome" || browserMode === "firefox") return browserMode;
	return null;
}
function requireBrowser(browser) {
	if (!browser) throw new Error("[vite-plugin-webext] Browser target is not resolved.");
	return browser;
}
function getNativeMagicString(meta) {
	if (!meta || typeof meta !== "object") return null;
	const magicString = meta.magicString;
	if (!magicString || typeof magicString !== "object") return null;
	const candidate = magicString;
	if (typeof candidate.overwrite !== "function" || typeof candidate.toString !== "function") return null;
	return candidate;
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
	for (const entry of entries) await zipWriter.add(entry.name, new Uint8ArrayReader(entry.data));
	const zipData = await zipWriter.close();
	await promises.writeFile(outputPath, Buffer.from(zipData));
}
function shouldIncludeSourceEntry(relativePath) {
	return !relativePath.split(path.sep).some((segment) => segment === "node_modules" || segment === "dist" || segment === ".git" || segment === ".copilot");
}
function toPosixPath(filePath) {
	return normalizePath(filePath);
}
//#endregion
export { defineUnlistedScript, injectScript, webext };

//# sourceMappingURL=index.mjs.map