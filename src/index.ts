import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js'
import MagicString from 'magic-string'
import type { Plugin, UserConfig } from 'vite'
import { CHROME_ONLY_APIS, FIREFOX_ONLY_APIS, generateShim } from './shim-gen.ts'
import type { WebExtensionManifest } from './types/manifest.ts'

export type BrowserTarget = 'chrome' | 'firefox'
export type ManifestFactory = (browser: BrowserTarget) => WebExtensionManifest

export interface WebExtOptions {
  /**
   * Default browser target used when Vite mode is not `chrome` or `firefox`.
   */
  defaultBrowser?: BrowserTarget
  /**
   * Target browser for this build.
   * Backward-compatible alias for `defaultBrowser`.
   */
  browser?: BrowserTarget
  /**
   * How to handle unavailable APIs at build time.
   * - 'error'  : throw a build error (default)
   * - 'warn'   : emit a warning and continue
   * - 'ignore' : silently skip
   */
  unavailableApi?: 'error' | 'warn' | 'ignore'
  /**
   * Replace bare API namespace access to `browser.*` with static transforms.
   * Default: true
   */
  injectGlobals?: boolean
  /**
   * Manifest definition written to `manifest.json` during build.
   * You can pass a plain object or a factory function per browser target.
   */
  manifest?: WebExtensionManifest | ManifestFactory
  /**
   * Generate source/dist zip artifacts under dist.
   * Default: true
   */
  zipArtifacts?: boolean
}

const VIRTUAL_ID = 'virtual:webext/browser'
const RESOLVED_ID = '\0virtual:webext/browser'

export function webext(options: WebExtOptions): Plugin {
  const {
    defaultBrowser,
    browser,
    unavailableApi = 'error',
    injectGlobals = true,
    manifest,
    zipArtifacts = true,
  } = options
  const configuredDefaultBrowser = resolveConfiguredDefaultBrowser(browser, defaultBrowser)

  let activeBrowser: BrowserTarget | null = null
  let resolvedManifest: WebExtensionManifest | null = null
  let rootDir = process.cwd()
  let browserOutDir = path.resolve(rootDir, 'dist')
  let distRootDir = browserOutDir
  let isBuild = false

  return {
    name: 'vite-plugin-webext',
    enforce: 'pre',

    config(userConfig, configEnv): UserConfig {
      isBuild = configEnv.command === 'build'
      activeBrowser = resolveBrowserTarget(configEnv.mode, configuredDefaultBrowser)
      resolvedManifest = manifest ? resolveManifest(manifest, activeBrowser) : null
      const outDir = withBrowserSubDir(userConfig.build?.outDir ?? 'dist', activeBrowser)

      return {
        define: {
          'import.meta.env.BROWSER': JSON.stringify(activeBrowser),
          'import.meta.env.IS_FIREFOX': JSON.stringify(activeBrowser === 'firefox'),
          'import.meta.env.IS_CHROME': JSON.stringify(activeBrowser === 'chrome'),
        },
        build: {
          outDir,
        },
      }
    },

    configResolved(config) {
      rootDir = config.root
      activeBrowser = activeBrowser ?? resolveBrowserTarget(config.mode, configuredDefaultBrowser)
      resolvedManifest = manifest ? resolveManifest(manifest, activeBrowser) : null
      browserOutDir = path.resolve(rootDir, config.build.outDir)
      distRootDir = path.resolve(browserOutDir, '..')
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },

    load(id) {
      if (id !== RESOLVED_ID) return
      return generateShim(requireBrowser(activeBrowser))
    },

    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        if (!manifest || !resolvedManifest) return

        const outputBundle = bundle as OutputBundleLike
        rewriteSourcePrefixedBundlePaths(outputBundle)

        if (outputBundle['manifest.json']) {
          this.error(
            '[vite-plugin-webext] `manifest.json` already exists in build output. Remove the duplicate or omit `webext({ manifest })`.',
          )
        }

        const manifestWithResolvedPaths = resolveManifestPathsFromBundle(
          resolvedManifest,
          outputBundle,
          rootDir,
        )
        resolvedManifest = manifestWithResolvedPaths

        this.emitFile({
          type: 'asset',
          fileName: 'manifest.json',
          source: `${JSON.stringify(manifestWithResolvedPaths, null, 2)}\n`,
        })
      },
    },

    transform(code, id) {
      if (id.includes('node_modules')) return null
      if (!hasApiNamespaceAccess(code)) return null

      const currentBrowser = requireBrowser(activeBrowser)
      const unavailableApis =
        currentBrowser === 'chrome' ? FIREFOX_ONLY_APIS : CHROME_ONLY_APIS

      for (const api of unavailableApis) {
        const pattern = new RegExp(`(?:browser|chrome)\\??\\.${escapeRe(api)}\\b`)
        if (!pattern.test(code)) continue

        const message =
          `[vite-plugin-webext] API "${api}" is not available in ${currentBrowser}.\n` +
          `  → ${id}`
        if (unavailableApi === 'error') {
          this.error(message)
        } else if (unavailableApi === 'warn') {
          this.warn(message)
        }
      }

      if (!injectGlobals) return null

      const rewritten = rewriteApiNamespacesToBrowser(code, (source) => this.parse(source))
      if (rewritten.count === 0) return null

      this.warn(
        `[vite-plugin-webext] Rewrote ${rewritten.count} "chrome.*" reference(s) to "browser.*" in ${id}.`,
      )

      return {
        code: rewritten.code,
        map: rewritten.map,
      }
    },

    async closeBundle() {
      if (!isBuild || !zipArtifacts) return

      const currentBrowser = requireBrowser(activeBrowser)
      const versionResult = await resolveArtifactVersion(browserOutDir, resolvedManifest)
      if (versionResult.source === 'fallback') {
        this.warn(
          `[vite-plugin-webext] Could not resolve manifest version for zip artifacts. Using fallback version "${versionResult.version}".`,
        )
      }

      const version = sanitizeVersionForFileName(versionResult.version)
      const sourceZipPath = path.join(distRootDir, `${currentBrowser}-${version}-source.zip`)
      const distZipPath = path.join(distRootDir, `${currentBrowser}-${version}-dist.zip`)
      const modeZipPath = path.join(distRootDir, `${currentBrowser}-zip.zip`)

      await fs.mkdir(distRootDir, { recursive: true })
      await createSourceZip(rootDir, sourceZipPath)
      const hasBrowserOutput = await directoryExists(browserOutDir)
      if (!hasBrowserOutput) {
        this.warn(
          `[vite-plugin-webext] Skipping dist zip artifacts because output directory "${browserOutDir}" does not exist. This can happen when \`build.write\` is disabled.`,
        )
        return
      }
      await createDirectoryZip(browserOutDir, distZipPath)
      await fs.copyFile(distZipPath, modeZipPath)
    },
  }
}

interface AstNode {
  type: string
  start?: number
  end?: number
  computed?: boolean
  object?: unknown
  name?: string
  [key: string]: unknown
}

interface BundleChunkLike {
  type: 'chunk'
  fileName: string
  imports: string[]
  dynamicImports: string[]
  implicitlyLoadedBefore: string[]
  referencedFiles: string[]
  isEntry?: boolean
  facadeModuleId?: string | null
}

interface BundleAssetLike {
  type: 'asset'
  fileName: string
  originalFileNames?: string[]
  originalFileName?: string
  names?: string[]
  name?: string
}

type BundleOutputLike = BundleChunkLike | BundleAssetLike
type OutputBundleLike = Record<string, BundleOutputLike>

function resolveConfiguredDefaultBrowser(
  browser?: BrowserTarget,
  defaultBrowser?: BrowserTarget,
): BrowserTarget | undefined {
  if (!defaultBrowser) return browser
  if (!browser || browser === defaultBrowser) return defaultBrowser
  throw new Error(
    '[vite-plugin-webext] `browser` and `defaultBrowser` are both set with different values. Use only one option, or set the same value for both.',
  )
}

function resolveBrowserTarget(mode: string, configuredBrowser?: BrowserTarget): BrowserTarget {
  const browserFromMode = parseBrowserMode(mode)
  if (browserFromMode) return browserFromMode
  if (configuredBrowser) return configuredBrowser
  throw new Error(
    '[vite-plugin-webext] Could not resolve browser target. Use `vite build --mode chrome|firefox` or pass `webext({ defaultBrowser })` (or legacy `webext({ browser })`).',
  )
}

function parseBrowserMode(mode: string): BrowserTarget | null {
  if (mode === 'chrome' || mode === 'firefox') return mode
  return null
}

function requireBrowser(browser: BrowserTarget | null): BrowserTarget {
  if (!browser) {
    throw new Error('[vite-plugin-webext] Browser target is not resolved.')
  }
  return browser
}

function withBrowserSubDir(outDir: string, browser: BrowserTarget): string {
  if (path.basename(outDir) === browser) return outDir
  return path.join(outDir, browser)
}

function hasApiNamespaceAccess(code: string): boolean {
  return /\b(?:browser|chrome)\s*(?:\.|\?\.)/.test(code)
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function resolveManifest(
  manifest: WebExtensionManifest | ManifestFactory,
  browser: BrowserTarget,
): WebExtensionManifest {
  return typeof manifest === 'function' ? manifest(browser) : manifest
}

function rewriteSourcePrefixedBundlePaths(bundle: OutputBundleLike) {
  for (const output of Object.values(bundle)) {
    const newFileName = stripLeadingSrcSegment(output.fileName)
    output.fileName = newFileName
  }

  const renameMap = new Map<string, string>()
  for (const output of Object.values(bundle)) {
    renameMap.set(normalizePath(output.fileName), output.fileName)
  }

  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk') continue
    output.imports = rewriteReferencedFiles(output.imports, renameMap)
    output.dynamicImports = rewriteReferencedFiles(output.dynamicImports, renameMap)
    output.implicitlyLoadedBefore = rewriteReferencedFiles(output.implicitlyLoadedBefore, renameMap)
    output.referencedFiles = rewriteReferencedFiles(output.referencedFiles, renameMap)
  }
}

function rewriteReferencedFiles(
  files: string[] | undefined,
  renameMap: Map<string, string>,
): string[] {
  if (!files) return []
  return files.map((fileName) => renameMap.get(normalizePath(fileName)) ?? fileName)
}

function stripLeadingSrcSegment(fileName: string): string {
  const normalized = normalizePath(fileName)
  if (!normalized.startsWith('src/')) return normalized
  return normalized.slice('src/'.length)
}

function resolveManifestPathsFromBundle(
  manifest: WebExtensionManifest,
  bundle: OutputBundleLike,
  rootDir: string,
): WebExtensionManifest {
  const sourceToOutput = buildSourceToOutputPathMap(bundle, rootDir)
  return rewriteManifestPathLikeStrings(manifest, sourceToOutput)
}

function buildSourceToOutputPathMap(bundle: OutputBundleLike, rootDir: string): Map<string, string> {
  const pathMap = new Map<string, string>()

  for (const output of Object.values(bundle)) {
    if (output.type === 'chunk') {
      registerChunkPath(pathMap, output, rootDir)
      continue
    }
    registerAssetPaths(pathMap, output, rootDir)
  }

  return pathMap
}

function registerChunkPath(pathMap: Map<string, string>, chunk: BundleChunkLike, rootDir: string) {
  if (!chunk.isEntry || !chunk.facadeModuleId) return
  const relativeSourcePath = normalizeSourcePath(path.relative(rootDir, chunk.facadeModuleId))
  if (!relativeSourcePath || relativeSourcePath.startsWith('../')) return
  if (relativeSourcePath.endsWith('.html')) return
  setPathMapping(pathMap, relativeSourcePath, chunk.fileName)
}

function registerAssetPaths(pathMap: Map<string, string>, asset: BundleAssetLike, rootDir: string) {
  for (const originalFileName of getAssetOriginalFileNames(asset)) {
    const relativeSourcePath = normalizeSourcePath(
      path.isAbsolute(originalFileName) ? path.relative(rootDir, originalFileName) : originalFileName,
    )
    if (!relativeSourcePath || relativeSourcePath.startsWith('../')) continue
    setPathMapping(pathMap, relativeSourcePath, asset.fileName)
  }
}

function getAssetOriginalFileNames(asset: BundleAssetLike): string[] {
  const names: string[] = []
  if (Array.isArray(asset.originalFileNames)) {
    names.push(...asset.originalFileNames)
  }
  if (typeof asset.originalFileName === 'string') {
    names.push(asset.originalFileName)
  }

  return names
}

function setPathMapping(pathMap: Map<string, string>, sourcePath: string, outputPath: string) {
  const normalizedSource = normalizeSourcePath(sourcePath)
  const normalizedOutput = normalizePath(outputPath)
  if (!normalizedSource) return

  pathMap.set(normalizedSource, normalizedOutput)
  if (normalizedSource.startsWith('src/')) {
    pathMap.set(normalizedSource.slice('src/'.length), normalizedOutput)
  }
}

function rewriteManifestPathLikeStrings(
  manifest: WebExtensionManifest,
  sourceToOutput: Map<string, string>,
): WebExtensionManifest {
  const cloned = JSON.parse(JSON.stringify(manifest)) as unknown
  return rewriteManifestValue(cloned, sourceToOutput) as WebExtensionManifest
}

function rewriteManifestValue(value: unknown, sourceToOutput: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteManifestValue(entry, sourceToOutput))
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, childValue] of Object.entries(value)) {
      result[key] = rewriteManifestValue(childValue, sourceToOutput)
    }
    return result
  }
  if (typeof value === 'string') {
    return rewriteManifestPath(value, sourceToOutput)
  }
  return value
}

function rewriteManifestPath(value: string, sourceToOutput: Map<string, string>): string {
  if (isExternalSpecifier(value)) return value

  const normalized = normalizeSourcePath(value)
  if (!normalized) return value

  const mapped = sourceToOutput.get(normalized)
  if (mapped) return mapped

  if (normalized.startsWith('src/')) {
    return normalized.slice('src/'.length)
  }

  return value
}

function isExternalSpecifier(value: string): boolean {
  return /^[A-Za-z][A-Za-z\d+\-.]*:/.test(value) || value.startsWith('//')
}

function normalizeSourcePath(filePath: string): string {
  const normalized = normalizePath(filePath)
  return normalized.replace(/^\.\/+/, '').replace(/^\/+/, '')
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

function rewriteApiNamespacesToBrowser(
  code: string,
  parse: (source: string) => unknown,
) {
  const ast = parse(code) as AstNode
  const magic = new MagicString(code)
  let count = 0

  walkAst(ast, (node) => {
    if ((node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression') || node.computed) {
      return
    }

    const object = node.object as AstNode | undefined
    if (
      object?.type === 'Identifier' &&
      object.name === 'chrome' &&
      typeof object.start === 'number' &&
      typeof object.end === 'number'
    ) {
      magic.overwrite(object.start, object.end, 'browser')
      count++
    }
  })

  return {
    count,
    code: count > 0 ? magic.toString() : code,
    map: count > 0 ? magic.generateMap({ hires: true }) : null,
  }
}

function walkAst(node: unknown, visit: (node: AstNode) => void) {
  if (!node || typeof node !== 'object') return

  const astNode = node as AstNode
  if (!astNode.type) return

  visit(astNode)

  for (const value of Object.values(astNode)) {
    if (!value) continue
    if (Array.isArray(value)) {
      for (const item of value) walkAst(item, visit)
      continue
    }
    walkAst(value, visit)
  }
}

function sanitizeVersionForFileName(version: string): string {
  return version.replace(/[^A-Za-z0-9._-]/g, '_')
}

async function resolveArtifactVersion(
  outDir: string,
  manifest: WebExtensionManifest | null,
): Promise<{ version: string; source: 'manifest-option' | 'manifest-file' | 'fallback' }> {
  if (manifest?.version) {
    return { version: manifest.version, source: 'manifest-option' }
  }

  const manifestPath = path.join(outDir, 'manifest.json')
  try {
    await fs.access(manifestPath)
  } catch (error) {
    const maybeError = error as NodeJS.ErrnoException
    if (maybeError.code !== 'ENOENT') {
      throw error
    }
    return { version: '0.0.0', source: 'fallback' }
  }

  const manifestRaw = await fs.readFile(manifestPath, 'utf8')
  const parsed = JSON.parse(manifestRaw) as { version?: unknown }
  if (typeof parsed.version === 'string' && parsed.version.trim()) {
    return { version: parsed.version, source: 'manifest-file' }
  }

  return { version: '0.0.0', source: 'fallback' }
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
    const stat = await fs.stat(directory)
    return stat.isDirectory()
  } catch (error) {
    const maybeError = error as NodeJS.ErrnoException
    if (maybeError.code === 'ENOENT') return false
    throw error
  }
}

async function collectZipEntries(
  rootDirectory: string,
  currentDirectory: string,
  shouldInclude: (relativePath: string, isDirectory: boolean) => boolean,
): Promise<Array<{ name: string; data: Uint8Array<ArrayBuffer> }>> {
  const results: Array<{ name: string; data: Uint8Array<ArrayBuffer> }> = []
  const entries = await fs.readdir(currentDirectory, { withFileTypes: true })

  for (const entry of entries) {
    const absolutePath = path.join(currentDirectory, entry.name)
    const relativePath = path.relative(rootDirectory, absolutePath)
    const include = shouldInclude(relativePath, entry.isDirectory())
    if (!include) continue

    if (entry.isDirectory()) {
      const nested = await collectZipEntries(rootDirectory, absolutePath, shouldInclude)
      results.push(...nested)
      continue
    }
    if (!entry.isFile()) continue

    const content = await fs.readFile(absolutePath)
    const data = new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
    results.push({ name: toPosixPath(relativePath), data })
  }

  return results
}

async function writeZip(
  outputPath: string,
  entries: Array<{ name: string; data: Uint8Array<ArrayBuffer> }>,
) {
  const writer = new Uint8ArrayWriter()
  const zipWriter = new ZipWriter(writer)
  let closed = false
  try {
    for (const entry of entries) {
      await zipWriter.add(entry.name, new Uint8ArrayReader(entry.data))
    }
    const zipData = await zipWriter.close()
    closed = true
    await fs.writeFile(outputPath, Buffer.from(zipData))
  } finally {
    if (!closed) {
      await zipWriter.close().catch(() => undefined)
    }
  }
}

function shouldIncludeSourceEntry(relativePath: string): boolean {
  const segments = relativePath.split(path.sep)
  return !segments.some(
    (segment) =>
      segment === 'node_modules' ||
      segment === 'dist' ||
      segment === '.git' ||
      segment === '.copilot',
  )
}

function toPosixPath(filePath: string): string {
  return normalizePath(filePath)
}
