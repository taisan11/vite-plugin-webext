import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js'
import type { Plugin } from 'vite'
import { bundleStandaloneScripts } from './standalone.ts'
import { startDevBuild, type DevBuildWatcher } from './dev.ts'
import {
  CHROME_ONLY_APIS,
  FIREFOX_ONLY_APIS,
  hasApiNamespaceAccess,
  hasUnavailableApiAccess,
  resolveApiNamespace,
  rewriteApiNamespaces,
} from './browser/api-transform.ts'
import {
  prepareI18nArtifacts,
  resolveI18nOptions,
  rewriteI18nTCalls,
  transformLocaleEntriesToMessagesJson,
  type I18nOptions,
  type LocaleEntryData,
} from './i18n/transform.ts'
import type { MagicStringLike } from './magic-string.ts'
import { rewriteMessagingCalls } from './messaging/transform.ts'
import type { WebExtensionManifest } from './types/manifest.ts'
import { mergeBuildInputs } from './utils/build-inputs.ts'
import {
  createOutputPathResolver,
  readBuildManifest,
  resolveExtensionManifestPaths,
} from './utils/build-manifest.ts'
import { collectManifestInputs } from './utils/manifest-inputs.ts'
import { normalizePath } from './utils/path.ts'
import {
  collectUnlistedScriptInputs,
  normalizeUnlistedScriptName,
  resolveUnlistedScriptManifest,
  type UnlistedScripts,
} from './utils/unlisted-scripts.ts'

export type BrowserTarget = 'chrome' | 'firefox'
export type ManifestFactory = (browser: BrowserTarget) => WebExtensionManifest

const UNLISTED_SCRIPT_PATHS_PLACEHOLDER = '__VITE_PLUGIN_WEBEXT_UNLISTED_SCRIPT_PATHS__'

export interface WebExtOptions {
  /** Fallback target when mode is not chrome / firefox (or their -zip modes). */
  defaultBrowser?: BrowserTarget
  /** Required extension manifest, or a factory receiving the browser target. */
  manifest: WebExtensionManifest | ManifestFactory
  /** How to handle unavailable browser APIs. Default: 'error'. Independent of staticTransform. */
  unavailableApi?: 'error' | 'warn' | 'ignore'
  /**
   * Rewrite browser.* / chrome.* namespaces to the target browser. Default: true.
   * This does not disable i18n or messaging helper transforms, or API validation.
   */
  staticTransform?: boolean
  /** Generate locale message types and transform i18n helpers. Default: disabled. */
  i18n?: boolean | I18nOptions
  /** Named scripts built as web-accessible resources for injectScript(name). */
  unlistedScripts?: UnlistedScripts
}

export { defineUnlistedScript, injectScript } from './inject-script.ts'
export type {
  InjectScriptOptions,
  InjectScriptResult,
  InjectedScriptElement,
  UnlistedScriptDefinition,
} from './inject-script.ts'
export type { UnlistedScripts } from './utils/unlisted-scripts.ts'

interface TransformContextLike {
  parse(source: string): unknown
  warn(message: string): void
  error(message: string): never
}

interface TransformPipelineContext {
  ctx: TransformContextLike
  code: string
  id: string
  parse: (source: string) => unknown
  magic?: MagicStringLike
  apiNamespace: 'browser' | 'chrome'
}

interface TransformPipelineResult {
  code: string | MagicStringLike
  map: { mappings: string } | null
}

export function webext(options: WebExtOptions): Plugin {
  if (!options?.manifest) {
    throw new Error('[vite-plugin-webext] webext({ manifest }) is required.')
  }
  const {
    defaultBrowser,
    manifest,
    unavailableApi = 'error',
    staticTransform = true,
    i18n,
    unlistedScripts = {},
  } = options
  const resolvedI18nOptions = resolveI18nOptions(i18n)
  const configuredUnlistedScripts = { ...unlistedScripts }

  let activeBrowser: BrowserTarget | null = null
  let sourceManifest: WebExtensionManifest
  let automaticInputs: Record<string, string> = {}
  let effectiveInputs: Record<string, string> = {}
  let localeMessageIds = new Set<string>()
  let localeEntries: LocaleEntryData[] = []
  let rootDir = process.cwd()
  let browserOutDir = path.resolve(rootDir, 'dist')
  let distRootDir = browserOutDir
  let viteManifestFileName = '.vite/manifest.json'
  let watchedPublicDir = ''
  let isBuild = false
  let isZipMode = false
  let writeBuild = true
  let buildSourcemap: boolean | 'inline' | 'hidden' = false
  let minifyScripts = false
  let devWatcher: DevBuildWatcher | undefined

  function runTransformPipeline(pipeline: TransformPipelineContext): TransformPipelineResult | null {
    const { ctx, code, id, parse, magic, apiNamespace } = pipeline
    let transformedCodeForChecks = code
    let i18nRewriteCount = 0
    let messagingRewriteCount = 0
    let namespaceRewriteCount = 0

    if (resolvedI18nOptions.enabled) {
      const i18nRewritten = rewriteI18nTCalls(
        code,
        parse,
        localeMessageIds,
        magic
          ? { apiNamespace, magicString: magic, returnMagicString: true }
          : { apiNamespace },
      )
      if (i18nRewritten.unknownIds.length > 0) {
        ctx.error(
          `[vite-plugin-webext] Unknown i18n message id(s): ${i18nRewritten.unknownIds.join(', ')}\n` +
            `  → ${id}\n` +
            '  Define ids in src/locale/[localeName].ts using defineLocale({...}).',
        )
      }
      if (i18nRewritten.count > 0) {
        i18nRewriteCount = i18nRewritten.count
        transformedCodeForChecks = magic ? magic.toString() : i18nRewritten.code.toString()
      }
    }

    const messagingRewritten = rewriteMessagingCalls(
      magic ? code : transformedCodeForChecks,
      parse,
      magic ? { apiNamespace, magicString: magic, returnMagicString: true } : { apiNamespace },
    )
    if (messagingRewritten.count > 0) {
      messagingRewriteCount = messagingRewritten.count
      transformedCodeForChecks = magic ? magic.toString() : messagingRewritten.code.toString()
    }

    if (!hasApiNamespaceAccess(transformedCodeForChecks)) {
      if (i18nRewriteCount === 0 && messagingRewriteCount === 0) return null
      if (magic) return { code: magic as unknown as string, map: null }
      return {
        code: transformedCodeForChecks,
        map: i18nRewriteCount > 0 ? null : messagingRewritten.map,
      }
    }

    const currentBrowser = requireBrowser(activeBrowser)
    const unavailableApis = currentBrowser === 'chrome' ? FIREFOX_ONLY_APIS : CHROME_ONLY_APIS
    for (const api of unavailableApis) {
      if (!hasUnavailableApiAccess(transformedCodeForChecks, api)) continue
      const message = `[vite-plugin-webext] API "${api}" is not available in ${currentBrowser}.\n  → ${id}`
      if (unavailableApi === 'error') ctx.error(message)
      else if (unavailableApi === 'warn') ctx.warn(message)
    }

    if (staticTransform) {
      const rewritten = rewriteApiNamespaces(
        magic ? code : transformedCodeForChecks,
        parse,
        resolveApiNamespace(currentBrowser),
        magic ? { magicString: magic, returnMagicString: true } : {},
      )
      namespaceRewriteCount = rewritten.count
      if (magic) {
        if (i18nRewriteCount === 0 && messagingRewriteCount === 0 && namespaceRewriteCount === 0) return null
        return { code: magic as unknown as string, map: null }
      }
      if (rewritten.count === 0) {
        if (i18nRewriteCount === 0 && messagingRewriteCount === 0) return null
        return { code: transformedCodeForChecks, map: null }
      }
      return {
        code: rewritten.code.toString(),
        map: i18nRewriteCount > 0 || messagingRewriteCount > 0 ? null : rewritten.map,
      }
    }

    if (i18nRewriteCount === 0 && messagingRewriteCount === 0) return null
    if (magic) return { code: magic as unknown as string, map: null }
    return {
      code: transformedCodeForChecks,
      map: i18nRewriteCount > 0 ? null : messagingRewritten.map,
    }
  }

  const plugin: Plugin = {
    name: 'vite-plugin-webext',
    applyToEnvironment: (environment) => environment.name === 'client',

    config: {
      order: 'post',
      handler(config, env) {
        isBuild = env.command === 'build'
        isZipMode = isBuild && env.mode.endsWith('-zip') && parseBrowserMode(env.mode) !== null
        activeBrowser = resolveBrowserTarget(env.mode, defaultBrowser)
        rootDir = path.resolve(config.root ?? process.cwd())
        sourceManifest = resolveUnlistedScriptManifest(
          typeof manifest === 'function' ? manifest(activeBrowser) : manifest,
          Object.keys(configuredUnlistedScripts),
        )
        config.define = {
          ...config.define,
          'import.meta.env.BROWSER': JSON.stringify(activeBrowser),
          'import.meta.env.IS_FIREFOX': JSON.stringify(activeBrowser === 'firefox'),
          'import.meta.env.IS_CHROME': JSON.stringify(activeBrowser === 'chrome'),
          'import.meta.env.WEBEXT_UNLISTED_SCRIPT_PATHS': Object.keys(configuredUnlistedScripts).length
            ? UNLISTED_SCRIPT_PATHS_PLACEHOLDER
            : '{}',
        }
        config.build ??= {}
        config.build.outDir = withBrowserSubDir(config.build.outDir ?? 'dist', activeBrowser)
        config.build.manifest = buildManifestOption(config.build.manifest)
      },
    },

    configEnvironment: {
      order: 'post',
      handler(name, config) {
        if (name !== 'client') return
        config.build ??= {}
        config.build.manifest = buildManifestOption(config.build.manifest)
        config.build.rolldownOptions ??= {}
        if (Array.isArray(config.build.rolldownOptions.output)) {
          throw new Error('[vite-plugin-webext] A single output is required; build.rolldownOptions.output cannot be an array. Build each browser separately with --mode.')
        }
        const scripts = collectUnlistedScriptInputs(configuredUnlistedScripts, rootDir)
        automaticInputs = collectManifestInputs(sourceManifest, rootDir)
        for (const [name, source] of Object.entries(scripts)) {
          if (Object.hasOwn(automaticInputs, name) && automaticInputs[name] !== source) {
            throw new Error(`[vite-plugin-webext] Unlisted script name "${name}" conflicts with a manifest entry.`)
          }
          automaticInputs[name] = source
        }
        effectiveInputs = mergeBuildInputs(
          rootDir, automaticInputs, config.input, config.build.rolldownOptions.input,
        )
        // Use Vite's canonical input option. Do not deep-merge strings/arrays
        // into a named object or leave a second input option shadowing it.
        config.input = effectiveInputs
        delete config.build.rolldownOptions.input
      },
    },

    configResolved(config) {
      rootDir = config.root
      const build = config.environments.client!.build
      browserOutDir = path.resolve(rootDir, build.outDir)
      distRootDir = path.dirname(browserOutDir)
      watchedPublicDir = build.watch && build.copyPublicDir ? config.publicDir : ''
      viteManifestFileName = typeof build.manifest === 'string' ? normalizePath(build.manifest) : '.vite/manifest.json'
      writeBuild = build.write
      buildSourcemap = build.sourcemap
      minifyScripts = !!build.minify
    },

    async configureServer(server) {
      devWatcher = await startDevBuild(server, plugin, () => webext(options))
      server.config.logger.info(
        `[vite-plugin-webext] Load ${browserOutDir} as an unpacked extension. ` +
          'Changes are rebuilt automatically; reload the extension to apply them.',
      )
    },

    async buildStart() {
      if (watchedPublicDir && await directoryExists(watchedPublicDir)) this.addWatchFile(watchedPublicDir)
      // buildStart also runs for the dev server and for every watch rebuild.
      if (resolvedI18nOptions.enabled) {
        this.addWatchFile(path.resolve(rootDir, resolvedI18nOptions.localeDir))
        const prepared = await prepareI18nArtifacts(rootDir, resolvedI18nOptions)
        localeMessageIds = prepared.messageIds
        localeEntries = prepared.localeEntries
      }
    },

    generateBundle: {
      order: 'post',
      async handler(_, bundle) {
        const viteManifest = readBuildManifest(bundle, viteManifestFileName)
        const resolveOutput = createOutputPathResolver(viteManifest, rootDir, automaticInputs, effectiveInputs, bundle)
        const scriptPaths = new Map<string, string>()
        for (const [name, source] of Object.entries(configuredUnlistedScripts)) {
          const output = resolveOutput(source)
          if (bundle[output]?.type !== 'chunk') {
            throw new Error(`[vite-plugin-webext] Could not resolve unlisted script "${name}" in the Vite build manifest.`)
          }
          scriptPaths.set(normalizeUnlistedScriptName(name), output)
        }
        const extensionManifest = resolveExtensionManifestPaths(sourceManifest, (source) => {
          const name = source.endsWith('.js') ? source.slice(0, -3) : source
          return scriptPaths.get(name) ?? resolveOutput(source)
        })
        if (bundle['manifest.json']) {
          this.error('[vite-plugin-webext] manifest.json is reserved for the extension manifest. Remove the duplicate output.')
        }
        this.emitFile({
          type: 'asset', fileName: 'manifest.json', source: `${JSON.stringify(extensionManifest, null, 2)}\n`,
        })
        const replacement = JSON.stringify(Object.fromEntries(scriptPaths))
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk' && output.code.includes(UNLISTED_SCRIPT_PATHS_PLACEHOLDER)) {
            output.code = output.code.replaceAll(UNLISTED_SCRIPT_PATHS_PLACEHOLDER, replacement)
          }
        }
        const standalone = new Map<string, 'classic' | 'module'>([...scriptPaths.values()].map((file) => [file, 'module']))
        for (const content of extensionManifest.content_scripts ?? []) {
          for (const file of content.js ?? []) standalone.set(file, 'classic')
        }
        const background = extensionManifest.background
        if (background && background.type !== 'module') {
          if ('service_worker' in background) standalone.set(background.service_worker, 'classic')
          else for (const file of background.scripts ?? []) standalone.set(file, 'classic')
        }
        await bundleStandaloneScripts(bundle, standalone, requireBrowser(activeBrowser), buildSourcemap, minifyScripts)
        for (const entry of Object.values(viteManifest)) {
          if (standalone.has(entry.file)) {
            delete entry.imports
            delete entry.dynamicImports
          }
        }
        const manifestAsset = bundle[viteManifestFileName]!
        if (manifestAsset.type === 'asset') manifestAsset.source = JSON.stringify(viteManifest, null, 2)
        if (resolvedI18nOptions.enabled) {
          for (const [locale, messages] of Object.entries(transformLocaleEntriesToMessagesJson(localeEntries))) {
            this.emitFile({
              type: 'asset', fileName: `_locales/${locale}/messages.json`, source: `${JSON.stringify(messages, null, 2)}\n`,
            })
          }
        }
      },
    },

    transform(code, id, meta) {
      if (id.includes('node_modules')) return null
      const nativeMagicString = getNativeMagicString(meta)
      const result = runTransformPipeline({
        ctx: this, code, id,
        parse: (source) => this.parse(source),
        magic: nativeMagicString ?? undefined,
        // Helpers always target native APIs, even when namespace rewriting is off.
        apiNamespace: resolveApiNamespace(requireBrowser(activeBrowser)),
      })
      if (!result) return null
      return { code: (nativeMagicString ?? result.code) as string, map: result.map }
    },

    async closeServer() {
      await devWatcher?.close()
      devWatcher = undefined
    },

    async closeBundle() {
      if (!isBuild || !isZipMode || !writeBuild) return
      if (!await directoryExists(browserOutDir)) {
        this.warn(`[vite-plugin-webext] Skipping zip artifacts because "${browserOutDir}" does not exist.`)
        return
      }
      const currentBrowser = requireBrowser(activeBrowser)
      const version = sourceManifest.version.replace(/[^A-Za-z0-9._-]/g, '_')
      await fs.mkdir(distRootDir, { recursive: true })
      const sourceZipPath = path.join(distRootDir, `${currentBrowser}-${version}-source.zip`)
      const distZipPath = path.join(distRootDir, `${currentBrowser}-${version}-dist.zip`)
      await createSourceZip(rootDir, sourceZipPath)
      await createDirectoryZip(browserOutDir, distZipPath)
      await fs.copyFile(distZipPath, path.join(distRootDir, `${currentBrowser}-zip.zip`))
    },
  }
  return plugin
}

function resolveBrowserTarget(mode: string, defaultBrowser?: BrowserTarget): BrowserTarget {
  const target = parseBrowserMode(mode) ?? defaultBrowser
  if (target) return target
  throw new Error(
    '[vite-plugin-webext] Could not resolve browser target. Use --mode chrome|firefox or webext({ defaultBrowser, manifest }).',
  )
}

function parseBrowserMode(mode: string): BrowserTarget | null {
  const browser = mode.endsWith('-zip') ? mode.slice(0, -4) : mode
  return browser === 'chrome' || browser === 'firefox' ? browser : null
}

function requireBrowser(browser: BrowserTarget | null): BrowserTarget {
  if (!browser) throw new Error('[vite-plugin-webext] Browser target is not resolved.')
  return browser
}

function buildManifestOption(option: boolean | string | undefined): true | string {
  if (typeof option !== 'string') return true
  if (path.posix.normalize(normalizePath(option)) === 'manifest.json') {
    throw new Error('[vite-plugin-webext] build.manifest cannot be "manifest.json"; that path is reserved for the extension manifest.')
  }
  return option
}

function getNativeMagicString(meta: unknown): MagicStringLike | null {
  if (!meta || typeof meta !== 'object') return null
  const candidate = (meta as { magicString?: Partial<MagicStringLike> }).magicString
  return candidate && typeof candidate.overwrite === 'function' && typeof candidate.toString === 'function'
    ? candidate as MagicStringLike
    : null
}

function withBrowserSubDir(outDir: string, browser: BrowserTarget): string {
  return path.basename(outDir) === browser ? outDir : path.join(outDir, browser)
}

async function createSourceZip(rootDirectory: string, outputPath: string) {
  const entries = await collectZipEntries(rootDirectory, rootDirectory, shouldIncludeSourceEntry)
  await writeZip(outputPath, entries)
}

async function createDirectoryZip(directory: string, outputPath: string) {
  const entries = await collectZipEntries(directory, directory, () => true)
  await writeZip(outputPath, entries)
}

async function directoryExists(directory: string): Promise<boolean> {
  try {
    return (await fs.stat(directory)).isDirectory()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function collectZipEntries(
  rootDirectory: string,
  currentDirectory: string,
  shouldInclude: (relativePath: string, isDirectory: boolean) => boolean,
): Promise<Array<{ name: string; data: Uint8Array<ArrayBuffer> }>> {
  const results: Array<{ name: string; data: Uint8Array<ArrayBuffer> }> = []
  for (const entry of await fs.readdir(currentDirectory, { withFileTypes: true })) {
    const absolutePath = path.join(currentDirectory, entry.name)
    const relativePath = path.relative(rootDirectory, absolutePath)
    if (!shouldInclude(relativePath, entry.isDirectory())) continue
    if (entry.isDirectory()) {
      results.push(...await collectZipEntries(rootDirectory, absolutePath, shouldInclude))
    } else if (entry.isFile()) {
      const content = await fs.readFile(absolutePath)
      results.push({ name: normalizePath(relativePath), data: new Uint8Array(content.buffer, content.byteOffset, content.byteLength) })
    }
  }
  return results
}

async function writeZip(outputPath: string, entries: Array<{ name: string; data: Uint8Array<ArrayBuffer> }>) {
  const writer = new Uint8ArrayWriter()
  const zipWriter = new ZipWriter(writer)
  for (const entry of entries) await zipWriter.add(entry.name, new Uint8ArrayReader(entry.data))
  await fs.writeFile(outputPath, Buffer.from(await zipWriter.close()))
}

function shouldIncludeSourceEntry(relativePath: string): boolean {
  return !relativePath.split(path.sep).some((segment) =>
    ['node_modules', 'dist', '.git', '.copilot'].includes(segment),
  )
}
