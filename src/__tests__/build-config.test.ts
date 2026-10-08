import { describe, expect, it } from 'vitest'
import { webext } from '../index.ts'

function createResolvedConfig(rolldownOptions: Record<string, unknown> = {}) {
  return {
    root: process.cwd(),
    mode: 'chrome',
    build: {
      outDir: `${process.cwd()}/dist/chrome`,
      manifest: undefined as boolean | string | undefined,
      rolldownOptions,
    },
  }
}

async function resolvePluginConfig(plugin: ReturnType<typeof webext>, config: object) {
  const hook = plugin.configResolved
  if (typeof hook !== 'function') throw new Error('Expected configResolved hook function')
  await hook.call(plugin, config as never)
}

describe('content script output configuration', () => {
  it('disables code splitting for content scripts', async () => {
    const config = createResolvedConfig({
      output: { entryFileNames: '[name].js', sourcemap: true },
    })
    const plugin = webext({
      defaultBrowser: 'chrome',
      manifest: {
        manifest_version: 3,
        name: 'test',
        version: '1.0.0',
        content_scripts: [{ matches: ['<all_urls>'], js: ['src/content.ts'] }],
      },
    })

    await resolvePluginConfig(plugin, config)

    expect(config.build.rolldownOptions.output).toEqual({
      entryFileNames: '[name].js',
      sourcemap: true,
      codeSplitting: false,
    })
  })

  it('reads the Vite manifest at build time without exposing it as a web resource', async () => {
    const config = createResolvedConfig()
    const plugin = webext({
      defaultBrowser: 'chrome',
      unlistedScripts: { mainWorld: 'src/main-world.ts' },
      manifest: {
        manifest_version: 3,
        name: 'test',
        version: '1.0.0',
        content_scripts: [{ matches: ['<all_urls>'], js: ['src/content.ts'] }],
      },
    })
    await resolvePluginConfig(plugin, config)
    expect(config.build.manifest).toBe(true)

    const bundle = {
      '.vite/manifest.json': {
        type: 'asset',
        fileName: '.vite/manifest.json',
        source: JSON.stringify({
          'src/main-world.ts': {
            file: 'assets/mainWorld-AbCd1234.js',
            name: 'mainWorld',
            src: 'src/main-world.ts',
            isEntry: true,
          },
          'src/content.ts': {
            file: 'assets/content-DefG5678.js',
            name: 'content-0-0',
            src: 'src/content.ts',
            isEntry: true,
          },
        }),
      },
      'assets/mainWorld-AbCd1234.js': {
        type: 'chunk',
        fileName: 'assets/mainWorld-AbCd1234.js',
        code: '',
        imports: [],
        dynamicImports: [],
        implicitlyLoadedBefore: [],
        referencedFiles: [],
        isEntry: true,
        facadeModuleId: `${process.cwd()}/src/main-world.ts`,
      },
      'assets/content-DefG5678.js': {
        type: 'chunk',
        fileName: 'assets/content-DefG5678.js',
        code: 'const paths = __VITE_PLUGIN_WEBEXT_UNLISTED_SCRIPT_PATHS__;',
        imports: [],
        dynamicImports: [],
        implicitlyLoadedBefore: [],
        referencedFiles: [],
        isEntry: true,
        facadeModuleId: `${process.cwd()}/src/content.ts`,
      },
    }
    const emitted: Array<{ fileName: string; source: string }> = []
    const hook = plugin.generateBundle
    if (!hook || typeof hook === 'function') throw new Error('Expected generateBundle hook object')
    await hook.handler.call(
      { emitFile: (file: { fileName: string; source: string }) => emitted.push(file) } as never,
      {},
      bundle as never,
    )

    const generatedManifest = emitted.find((file) => file.fileName === 'manifest.json')
    expect(generatedManifest).toBeDefined()
    expect(JSON.parse(generatedManifest!.source).web_accessible_resources).toEqual([
      {
        resources: ['assets/mainWorld-AbCd1234.js'],
        matches: ['<all_urls>'],
      },
    ])
    expect(bundle['assets/content-DefG5678.js'].code).toContain(
      'const paths = {"mainWorld":"assets/mainWorld-AbCd1234.js"};',
    )
  })

  it('disables code splitting for unlisted scripts used for page injection', async () => {
    const config = createResolvedConfig({ output: [{ format: 'es' }, { format: 'cjs' }] })
    const plugin = webext({
      defaultBrowser: 'chrome',
      unlistedScripts: { mainWorld: 'src/main-world.ts' },
    })

    await resolvePluginConfig(plugin, config)

    expect(config.build.rolldownOptions.output).toEqual([
      { format: 'es', codeSplitting: false },
      { format: 'cjs', codeSplitting: false },
    ])
  })

  it('keeps code splitting unchanged without content or unlisted scripts', async () => {
    const config = createResolvedConfig()
    const plugin = webext({ defaultBrowser: 'chrome' })

    await resolvePluginConfig(plugin, config)

    expect(config.build.rolldownOptions.output).toBeUndefined()
  })
})
