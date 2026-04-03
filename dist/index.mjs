import { promises } from "node:fs";
import path from "node:path";
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import MagicString from "magic-string";
//#region src/shim-gen.ts
/** APIs that exist ONLY in Chrome (MV3+) */
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
/** APIs that exist ONLY in Firefox */
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
/**
* Generate the virtual module source.
*
* The shim:
*  1. Picks the right global (`browser` for Firefox, `chrome` for Chrome)
*  2. Wraps Chrome's callback-based APIs in Promises so callers can always await
*  3. Assigns the result to both `globalThis.browser` and `globalThis.chrome`
*     so existing code using either name works without changes
*/
function generateShim(browser) {
	if (browser === "firefox") return `
// vite-plugin-webext — Firefox shim
// Firefox already exposes a promise-based \`browser\` global in extensions.
// We just re-export it and also alias \`chrome\` for cross-browser code.

const _browser = globalThis.browser ?? globalThis.chrome

if (!globalThis.browser) globalThis.browser = _browser
if (!globalThis.chrome)  globalThis.chrome  = _browser

export default _browser
export { _browser as browser }
`.trimStart();
	return `
// vite-plugin-webext — Chrome shim
// Wraps chrome.* callback APIs so you can always \`await browser.*\`.

function promisify(fn, ctx) {
  return function (...args) {
    // If the last arg is already a function, the caller passed a callback —
    // leave it alone so legacy code keeps working.
    if (typeof args[args.length - 1] === 'function') {
      return fn.apply(ctx, args)
    }
    return new Promise((resolve, reject) => {
      fn.apply(ctx, [
        ...args,
        (...result) => {
          const err = globalThis.chrome?.runtime?.lastError
          if (err) reject(new Error(err.message))
          else resolve(result.length <= 1 ? result[0] : result)
        },
      ])
    })
  }
}

function wrapNamespace(ns) {
  if (!ns || typeof ns !== 'object') return ns
  return new Proxy(ns, {
    get(target, prop) {
      const val = target[prop]
      if (typeof val === 'function') return promisify(val, target)
      if (val && typeof val === 'object' && !Array.isArray(val)) return wrapNamespace(val)
      return val
    },
  })
}

const _raw = globalThis.chrome
const _browser = new Proxy(_raw, {
  get(target, prop) {
    const ns = target[prop]
    if (ns && typeof ns === 'object' && !Array.isArray(ns)) return wrapNamespace(ns)
    return ns
  },
})

globalThis.browser = _browser
// Keep globalThis.chrome pointing to the raw API for code that expects callbacks
// globalThis.chrome is already set by the extension runtime

export default _browser
export { _browser as browser }
`.trimStart();
}
//#endregion
//#region src/index.ts
const VIRTUAL_ID = "virtual:webext/browser";
const RESOLVED_ID = "\0virtual:webext/browser";
function webext(options) {
	const { defaultBrowser, browser, unavailableApi = "error", injectGlobals = true, manifest, zipArtifacts = true } = options;
	const configuredDefaultBrowser = resolveConfiguredDefaultBrowser(browser, defaultBrowser);
	let activeBrowser = null;
	let resolvedManifest = null;
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
		configResolved(config) {
			rootDir = config.root;
			activeBrowser = activeBrowser ?? resolveBrowserTarget(config.mode, configuredDefaultBrowser);
			resolvedManifest = manifest ? resolveManifest(manifest, activeBrowser) : null;
			browserOutDir = path.resolve(rootDir, config.build.outDir);
			distRootDir = path.resolve(browserOutDir, "..");
		},
		resolveId(id) {
			if (id === VIRTUAL_ID) return RESOLVED_ID;
		},
		load(id) {
			if (id !== RESOLVED_ID) return;
			return generateShim(requireBrowser(activeBrowser));
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
			if (!hasApiNamespaceAccess(code)) return null;
			const currentBrowser = requireBrowser(activeBrowser);
			const unavailableApis = currentBrowser === "chrome" ? FIREFOX_ONLY_APIS : CHROME_ONLY_APIS;
			for (const api of unavailableApis) {
				if (!new RegExp(`(?:browser|chrome)\\??\\.${escapeRe(api)}\\b`).test(code)) continue;
				const message = `[vite-plugin-webext] API "${api}" is not available in ${currentBrowser}.\n  → ${id}`;
				if (unavailableApi === "error") this.error(message);
				else if (unavailableApi === "warn") this.warn(message);
			}
			if (!injectGlobals) return null;
			const rewritten = rewriteApiNamespacesToBrowser(code, (source) => this.parse(source));
			if (rewritten.count === 0) return null;
			this.warn(`[vite-plugin-webext] Rewrote ${rewritten.count} "chrome.*" reference(s) to "browser.*" in ${id}.`);
			return {
				code: rewritten.code,
				map: rewritten.map
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
function hasApiNamespaceAccess(code) {
	return /\b(?:browser|chrome)\s*(?:\.|\?\.)/.test(code);
}
function escapeRe(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
function rewriteApiNamespacesToBrowser(code, parse) {
	const ast = parse(code);
	const magic = new MagicString(code);
	let count = 0;
	walkAst(ast, (node) => {
		if (node.type !== "MemberExpression" && node.type !== "OptionalMemberExpression" || node.computed) return;
		const object = node.object;
		if (object?.type === "Identifier" && object.name === "chrome" && typeof object.start === "number" && typeof object.end === "number") {
			magic.overwrite(object.start, object.end, "browser");
			count++;
		}
	});
	return {
		count,
		code: count > 0 ? magic.toString() : code,
		map: count > 0 ? magic.generateMap({ hires: true }) : null
	};
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