import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { webext } from '../index.ts'

const directories: string[] = []
const servers: ViteDevServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webext-dev-'))
  directories.push(root)
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}')
  await fs.mkdir(path.join(root, 'src'), { recursive: true })
  await fs.writeFile(path.join(root, 'src/background.ts'), 'console.log("initial", browser.runtime.id)')
  await fs.writeFile(path.join(root, 'src/popup.html'), '<script type="module" src="./popup.ts"></script>')
  await fs.writeFile(path.join(root, 'src/popup.ts'), 'console.log("popup", import.meta.env.BROWSER)')
  await fs.writeFile(path.join(root, 'src/content.ts'), 'console.log("content", browser.runtime.id)')
  await fs.writeFile(path.join(root, 'src/main-world.ts'), 'console.log("main-world")')
  await fs.mkdir(path.join(root, 'src/locale'), { recursive: true })
  await fs.writeFile(path.join(root, 'src/locale/en.ts'), 'export default defineLocale({ title: "Hello" })')
  await fs.mkdir(path.join(root, 'public'), { recursive: true })
  await fs.writeFile(path.join(root, 'public/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  return root
}

async function readBackground(outDir: string) {
  const manifest = JSON.parse(await fs.readFile(path.join(outDir, 'manifest.json'), 'utf8'))
  return fs.readFile(path.join(outDir, manifest.background.service_worker), 'utf8')
}

describe('Vite development server', () => {
  it('supports a config file, defaultBrowser and a custom output directory', async () => {
    const root = await fixture()
    const pluginPath = path.resolve('src/index.ts').replaceAll('\\', '/')
    await fs.writeFile(path.join(root, 'vite.config.ts'), `
      import { webext } from ${JSON.stringify(pluginPath)}
      export default {
        plugins: [webext({
          defaultBrowser: 'chrome',
          manifest: {
            manifest_version: 3, name: 'Config test', version: '1.0.0',
            background: { service_worker: 'src/background.ts', type: 'module' },
          },
        })],
        build: { outDir: 'artifacts' },
      }
    `)
    const server = await createServer({ root, logLevel: 'silent', server: { port: 0 } })
    servers.push(server)
    await server.listen()
    expect(await readBackground(path.join(root, 'artifacts/chrome'))).toContain('chrome.runtime.id')
  }, 20_000)

  it.each(['chrome', 'firefox'] as const)('writes and rebuilds a loadable %s extension', async (browser) => {
    const root = await fixture()
    const server = await createServer({
      configFile: false,
      root,
      mode: browser,
      logLevel: 'silent',
      server: { port: 0 },
      plugins: [[webext({
        i18n: true,
        unlistedScripts: { mainWorld: 'src/main-world.ts' },
        manifest: {
          manifest_version: 3,
          name: 'Dev test',
          version: '1.0.0',
          background: { service_worker: 'src/background.ts', type: 'module' },
          action: { default_popup: 'src/popup.html' },
          content_scripts: [{ matches: ['<all_urls>'], js: ['src/content.ts'] }],
          icons: { '16': 'icon.svg' },
        },
      })]],
    })
    servers.push(server)
    await server.listen()

    const outDir = path.join(root, 'dist', browser)
    expect(await readBackground(outDir)).toContain(`${browser === 'chrome' ? 'chrome' : 'browser'}.runtime.id`)
    const manifest = JSON.parse(await fs.readFile(path.join(outDir, 'manifest.json'), 'utf8'))
    await expect(fs.readFile(path.join(outDir, manifest.action.default_popup), 'utf8')).resolves.toContain('<script')
    await expect(fs.readFile(path.join(outDir, 'icon.svg'), 'utf8')).resolves.toContain('<svg')
    expect(await fs.readdir(path.join(root, 'dist'))).toEqual([browser])
    const messagesPath = path.join(outDir, '_locales/en/messages.json')
    expect(JSON.parse(await fs.readFile(messagesPath, 'utf8')).title.message).toBe('Hello')
    const localeTypesPath = path.join(root, 'src/locale/webext-i18n.d.ts')
    await expect(fs.readFile(localeTypesPath, 'utf8')).resolves.toContain('title')

    // The regular Vite server remains usable as well as the on-disk extension.
    const address = server.httpServer!.address() as { port: number }
    const response = await fetch(`http://localhost:${address.port}/src/popup.html`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('/@vite/client')

    await fs.writeFile(path.join(root, 'src/background.ts'), 'console.log("updated", browser.runtime.id)')
    await expect.poll(() => readBackground(outDir), { timeout: 10_000 }).toContain('updated')
    await fs.writeFile(path.join(root, 'src/locale/en.ts'), 'export default defineLocale({ title: "Updated locale", addedInDev: "New message" })')
    await expect.poll(async () => JSON.parse(await fs.readFile(messagesPath, 'utf8')).title.message, {
      timeout: 10_000,
    }).toBe('Updated locale')
    await expect.poll(() => fs.readFile(localeTypesPath, 'utf8'), { timeout: 10_000 }).toContain('addedInDev')
    await fs.writeFile(path.join(root, 'public/icon.svg'), '<svg><!-- updated icon --></svg>')
    await expect.poll(() => fs.readFile(path.join(outDir, 'icon.svg'), 'utf8'), {
      timeout: 10_000,
    }).toContain('updated icon')

    await server.close()
    servers.splice(servers.indexOf(server), 1)
    await fs.writeFile(path.join(root, 'src/background.ts'), 'console.log("after-close")')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(await readBackground(outDir)).not.toContain('after-close')
  }, 20_000)
})
