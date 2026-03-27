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
   * Target browser for this build.
   * When omitted, this plugin resolves from Vite mode (`--mode chrome|firefox`).
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
    browser,
    unavailableApi = 'error',
    injectGlobals = true,
    manifest,
    zipArtifacts = true,
  } = options

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
      activeBrowser = resolveBrowserTarget(configEnv.mode, browser)
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
      activeBrowser = activeBrowser ?? resolveBrowserTarget(config.mode, browser)
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

    generateBundle(_, bundle) {
      if (!manifest || !resolvedManifest) return

      if (bundle['manifest.json']) {
        this.error(
          '[vite-plugin-webext] `manifest.json` already exists in build output. Remove the duplicate or omit `webext({ manifest })`.',
        )
      }

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(resolvedManifest, null, 2)}\n`,
      })
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

function resolveBrowserTarget(mode: string, configuredBrowser?: BrowserTarget): BrowserTarget {
  const browserFromMode = parseBrowserMode(mode)
  if (browserFromMode) return browserFromMode
  if (configuredBrowser) return configuredBrowser
  throw new Error(
    '[vite-plugin-webext] Could not resolve browser target. Use `vite build --mode chrome|firefox` or pass `webext({ browser })`.',
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
  return filePath.split(path.sep).join('/')
}
