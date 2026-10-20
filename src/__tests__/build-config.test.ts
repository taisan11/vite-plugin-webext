import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { build, resolveConfig, type InlineConfig, type Rolldown } from 'vite'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { webext, type WebExtOptions } from '../index.ts'
import type { WebExtensionManifest } from '../types/manifest.ts'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

function manifest(extra: Partial<WebExtensionManifest> = {}): WebExtensionManifest {
  return {
    manifest_version: 3, name: 'Test', version: '1.0.0',
    background: { service_worker: 'src/background.ts', type: 'module' },
    action: { default_popup: 'src/popup.html' },
    ...extra,
  }
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webext-build-'))
  directories.push(root)
  await fs.mkdir(path.join(root, 'src'), { recursive: true })
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}')
  await fs.writeFile(path.join(root, 'src/shared.ts'), 'export function shared() { console.log("shared", Date.now()) }')
  for (const name of ['background', 'content', 'main-world', 'custom', 'extra', 'popup']) {
    await fs.writeFile(path.join(root, `src/${name}.ts`), `import { shared } from './shared'; shared(); console.log('${name}', browser.runtime.id)`)
  }
  await fs.writeFile(path.join(root, 'src/popup.html'), '<script type="module" src="./popup.ts"></script>')
  return root
}

async function config(extra: InlineConfig = {}, options: Partial<WebExtOptions> = {}) {
  return resolveConfig({
    configFile: false, logLevel: 'silent', mode: 'chrome', ...extra,
    plugins: [webext({ manifest: manifest(), ...options }), ...(extra.plugins ?? [])],
  }, 'build')
}

async function compile(root: string, extra: InlineConfig = {}, options: Partial<WebExtOptions> = {}) {
  const result = await build({
    configFile: false, root, mode: 'chrome', logLevel: 'silent', ...extra,
    plugins: [webext({ manifest: manifest(), ...options }), ...(extra.plugins ?? [])],
    build: { write: false, minify: false, ...extra.build },
  })
  if ('on' in result || Array.isArray(result)) throw new Error('Expected a single build result')
  const assets = new Map(result.output.filter((output) => output.type === 'asset').map((asset) => [asset.fileName, String(asset.source)]))
  const chunks = new Map(result.output.filter((output): output is Rolldown.OutputChunk => output.type === 'chunk').map((chunk) => [chunk.fileName, chunk]))
  return { assets, chunks, manifest: JSON.parse(assets.get('manifest.json')!), viteManifest: JSON.parse(assets.get('.vite/manifest.json') ?? '{}') }
}

describe('configuration API', () => {
  it('exposes only the supported options', () => {
    expectTypeOf<keyof WebExtOptions>().toEqualTypeOf<
      'manifest' | 'defaultBrowser' | 'staticTransform' | 'unavailableApi' | 'i18n' | 'unlistedScripts'
    >()
  })

  it('requires a manifest at runtime as well as in its types', () => {
    // @ts-expect-error manifest is required
    expect(() => webext({ defaultBrowser: 'chrome' })).toThrow('manifest')
  })

  it('uses mode before defaultBrowser, without a browser alias', async () => {
    const result = await config({ mode: 'firefox' }, { defaultBrowser: 'chrome' })
    expect(result.define!['import.meta.env.BROWSER']).toBe('"firefox"')
    expect(result.build.outDir).toBe(path.join('dist', 'firefox'))
    await expect(config({ mode: 'development' })).rejects.toThrow('defaultBrowser')
    expect((await config({ mode: 'development' }, { defaultBrowser: 'chrome' })).define!['import.meta.env.BROWSER']).toBe('"chrome"')
  })

  it.each([undefined, false, true])('always generates the Vite build manifest (%s)', async (value) => {
    const result = await config({ build: { manifest: value } })
    expect(result.build.manifest).toBe(true)
    expect(result.environments.client!.build.manifest).toBe(true)
  })

  it('preserves a custom build manifest path and rejects the extension manifest path', async () => {
    expect((await config({ build: { manifest: '.vite/custom.json' } })).environments.client!.build.manifest).toBe('.vite/custom.json')
    await expect(config({ build: { manifest: 'manifest.json' } })).rejects.toThrow('reserved')
  })

  it('rejects multiple-output configuration before building', async () => {
    await expect(config({ build: { rolldownOptions: { output: [{ format: 'es' }] } } })).rejects.toThrow('single output')
    await expect(config({ build: { rolldownOptions: { output: [{ format: 'es' }, { format: 'cjs' }] } } })).rejects.toThrow('single output')
  })

  it('normalizes named input and lets user entries override automatic entries', async () => {
    const result = await config({
      input: { extra: 'src/extra.ts' },
      build: { rolldownOptions: { input: { background: 'src/custom.ts' } } },
    })
    expect(result.environments.client!.input).toMatchObject({
      background: path.resolve('src/custom.ts'), extra: path.resolve('src/extra.ts'), popup: path.resolve('src/popup.html'),
    })
    expect(result.environments.client!.build.rolldownOptions.input).toBeUndefined()
  })

  it.each([['src/extra.ts'], [['src/extra.ts', 'src/custom.ts']]])('preserves string and array input: %s', async (input) => {
    const result = await config({ build: { rolldownOptions: { input } } })
    const entries = Object.values(result.environments.client!.input!)
    expect(entries).toContain(path.resolve('src/extra.ts'))
    expect(entries).toContain(path.resolve('src/background.ts'))
    expect(entries.every((entry) => typeof entry === 'string')).toBe(true)
  })

  it('uses the final root and input from other normal config hooks', async () => {
    const root = await fixture()
    const result = await config({ plugins: [{ name: 'other', config: () => ({ root, input: { extra: 'src/extra.ts' } }) }] })
    expect(result.environments.client!.input).toMatchObject({
      background: path.join(root, 'src/background.ts'), extra: path.join(root, 'src/extra.ts'),
    })
  })
})

describe('actual build output', () => {
  it('uses Vite manifest paths and preserves custom filenames and HTML references', async () => {
    const root = await fixture()
    const result = await compile(root, {
      build: { rolldownOptions: { output: { entryFileNames: 'src/[name].js' } } },
    }, { manifest: manifest({ name: 'src/popup.html', icons: { '16': 'src/icon.svg' } }) })
    const popup = result.manifest.action.default_popup
    expect(popup).toBe('src/popup.html')
    expect(result.viteManifest['src/popup.html'].file).toBe('src/popup.js')
    expect(result.manifest.background.service_worker).toBe('src/background.js')
    expect(result.chunks.has('src/background.js')).toBe(true)
    expect(result.assets.get(popup)).toContain('/src/popup.js')
    expect(result.chunks.has('src/popup.js')).toBe(true)
    expect(result.manifest.name).toBe('src/popup.html')
    expect(result.manifest.icons['16']).toBe('src/icon.svg')
  })

  it('resolves an overridden manifest entry and also builds top-level extra input', async () => {
    const root = await fixture()
    const result = await compile(root, {
      input: { extra: 'src/extra.ts' },
      build: { rolldownOptions: { input: { background: 'src/custom.ts' } } },
    })
    expect(result.manifest.background.service_worker).toBe(result.viteManifest['src/custom.ts'].file)
    expect(result.chunks.has(result.viteManifest['src/extra.ts'].file)).toBe(true)
  })

  it.each([false, true])('bundles content/unlisted scripts independently while preserving HTML code splitting (minify=%s)', async (minify) => {
    const root = await fixture()
    const result = await compile(root, { build: { minify } }, {
      unlistedScripts: { mainWorld: 'src/main-world.ts' },
      manifest: manifest({ content_scripts: [{ matches: ['<all_urls>'], js: ['src/content.ts'] }] }),
    })
    const content = result.chunks.get(result.manifest.content_scripts[0].js[0])!
    expect(content.imports).toEqual([])
    expect(content.dynamicImports).toEqual([])
    expect(content.code).toContain('shared')
    const messages: unknown[][] = []
    vm.runInNewContext(content.code, { chrome: { runtime: { id: 'test' } }, console: { log: (...args: unknown[]) => messages.push(args) } })
    expect(messages.some((args) => args[0] === 'content')).toBe(true)
    const resource = result.manifest.web_accessible_resources[0].resources[0]
    expect(resource).toBe(result.viteManifest['src/main-world.ts'].file)
    expect(result.chunks.get(resource)!.imports).toEqual([])
    expect(result.chunks.get(result.manifest.background.service_worker)!.imports.length).toBeGreaterThan(0)
    expect(result.viteManifest['src/content.ts'].imports).toBeUndefined()
    expect(result.manifest.web_accessible_resources[0].resources).not.toContain('.vite/manifest.json')
  })

  it('preserves asset URLs and sourcemaps when inlining a content script', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'src/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')
    await fs.writeFile(path.join(root, 'src/background.ts'), 'import icon from "./icon.svg"; console.log(icon)')
    await fs.writeFile(path.join(root, 'src/content.ts'), 'import icon from "./icon.svg"; console.log("content-image", icon, import.meta.url)')
    const result = await compile(root, {
      base: './',
      build: {
        assetsInlineLimit: 0, sourcemap: true,
        rolldownOptions: { output: {
          entryFileNames: 'scripts/[name]-[hash].js', chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'images/[name]-[hash][extname]',
        } },
      },
    }, { manifest: manifest({ content_scripts: [{ matches: ['<all_urls>'], js: ['src/content.ts'] }] }) })
    const fileName = result.manifest.content_scripts[0].js[0]
    const content = result.chunks.get(fileName)!
    const messages: unknown[][] = []
    vm.runInNewContext(content.code, {
      URL, chrome: { runtime: { getURL: (file: string) => `chrome-extension://test/${file}` } },
      console: { log: (...args: unknown[]) => messages.push(args) },
    })
    const image = [...result.assets.keys()].find((file) => file.endsWith('.svg'))!
    expect(messages[0]).toEqual(['content-image', `chrome-extension://test/${image}`, `chrome-extension://test/${fileName}`])
    expect(result.assets.has(`${fileName}.map`)).toBe(true)
    expect(JSON.parse(result.assets.get(`${fileName}.map`)!).mappings).not.toBe('')
  })

  it('creates ZIP artifacts only in ZIP modes, without a zipArtifacts option', async () => {
    const root = await fixture()
    await compile(root, { mode: 'chrome', build: { write: true } })
    expect(await fs.readdir(path.join(root, 'dist'))).toEqual(['chrome'])
    await compile(root, { mode: 'chrome-zip', build: { write: true } })
    expect(await fs.readdir(path.join(root, 'dist'))).toEqual(expect.arrayContaining([
      'chrome-1.0.0-source.zip', 'chrome-1.0.0-dist.zip', 'chrome-zip.zip',
    ]))
  })

  it('resolves a custom Vite manifest path', async () => {
    const result = await compile(await fixture(), { build: { manifest: '.vite/custom.json' } })
    expect(result.assets.has('.vite/custom.json')).toBe(true)
    expect(result.chunks.has(result.manifest.background.service_worker)).toBe(true)
  })

  it('staticTransform=false preserves namespaces but still targets helper calls correctly', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'src/background.ts'), `
      import { sendMessage } from '@taisan11/vite-plugin-webext/messaging'
      browser.runtime.getManifest()
      sendMessage('test', { value: 1 })
    `)
    const result = await compile(root, {
      resolve: { alias: { '@taisan11/vite-plugin-webext/messaging': path.resolve('src/messaging/index.ts') } },
    }, { staticTransform: false })
    const code = result.chunks.get(result.manifest.background.service_worker)!.code
    expect(code).toContain('browser.runtime.getManifest')
    expect(code).toContain('chrome.runtime.sendMessage')
  })

  it('generates i18n declarations and targets helpers even with namespace rewriting disabled', async () => {
    const root = await fixture()
    await fs.mkdir(path.join(root, 'src/locale'))
    await fs.writeFile(path.join(root, 'src/locale/en.ts'), 'export default defineLocale({ title: "Hello" })')
    await fs.writeFile(path.join(root, 'src/background.ts'), `
      import { t } from '@taisan11/vite-plugin-webext/i18n'
      console.log(browser.runtime.id, t('title'))
    `)
    const result = await compile(root, {
      resolve: { alias: { '@taisan11/vite-plugin-webext/i18n': path.resolve('src/i18n/index.ts') } },
    }, { staticTransform: false, i18n: true })
    const code = result.chunks.get(result.manifest.background.service_worker)!.code
    expect(code).toContain('browser.runtime.id')
    expect(code).toContain('chrome.i18n.getMessage')
    expect(JSON.parse(result.assets.get('_locales/en/messages.json')!).title.message).toBe('Hello')
    await expect(fs.readFile(path.join(root, 'src/locale/webext-i18n.d.ts'), 'utf8')).resolves.toContain('title')
  })

  it('validates unavailable APIs independently of namespace rewriting', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'src/background.ts'), 'browser.theme.reset()')
    await expect(compile(root, {}, { staticTransform: false })).rejects.toThrow('not available')
    const result = await compile(root, {}, { staticTransform: false, unavailableApi: 'ignore' })
    expect(result.chunks.get(result.manifest.background.service_worker)!.code).toContain('browser.theme.reset')
  })
})
