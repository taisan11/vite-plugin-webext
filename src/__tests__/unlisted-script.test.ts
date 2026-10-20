import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { collectUnlistedScriptInputs, resolveUnlistedScriptManifest } from '../utils/unlisted-scripts.ts'
import { collectManifestInputs } from '../utils/manifest-inputs.ts'
import { injectScript } from '../inject-script.ts'

describe('unlisted scripts', () => {
  it('creates named build inputs', () => {
    expect(collectUnlistedScriptInputs({ mainWorld: 'src/main-world.ts' }, '/project')).toEqual({
      mainWorld: path.resolve('/project', 'src/main-world.ts'),
    })
  })

  it('adds unlisted scripts to web accessible resources', () => {
    const manifest = resolveUnlistedScriptManifest(
      {
        manifest_version: 3,
        name: 'test',
        version: '1.0.0',
        content_scripts: [{ matches: ['*://*.example.com/*'], js: ['content.js'] }],
      },
      ['mainWorld'],
    )

    expect(manifest.web_accessible_resources).toEqual([
      { resources: ['mainWorld.js'], matches: ['*://*.example.com/*'] },
    ])
  })

  it.each([2, 3] as const)('keeps the MV%s resource format with an initially empty list', (version) => {
    const manifest = resolveUnlistedScriptManifest({
      manifest_version: version, name: 'test', version: '1.0.0', web_accessible_resources: [],
    }, ['main'])
    expect(manifest.web_accessible_resources).toEqual(version === 2
      ? ['main.js']
      : [{ resources: ['main.js'], matches: ['<all_urls>'] }])
  })

  it('collects content script JavaScript as bundle inputs', () => {
    expect(
      collectManifestInputs(
        {
          manifest_version: 3,
          name: 'test',
          version: '1.0.0',
          content_scripts: [{ matches: ['<all_urls>'], js: ['src/content.ts'] }],
        },
        '/project',
      ),
    ).toEqual({ 'content-0-0': path.resolve('/project', 'src/content.ts') })
  })

  it('uses the Vite-manifest entry path embedded at build time', async () => {
    const script = {
      src: '',
      type: '',
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      remove: vi.fn(),
    }
    vi.stubGlobal('browser', {
      runtime: { getURL: (file: string) => `moz-extension://test/${file}` },
    })
    vi.stubGlobal('document', {
      createElement: vi.fn(() => script),
      head: {
        appendChild: (element: typeof script) => element.onload?.(),
      },
    })
    vi.stubEnv(
      'WEBEXT_UNLISTED_SCRIPT_PATHS',
      JSON.stringify({ mainWorld: 'assets/mainWorld-AbCd1234.js' }),
    )

    try {
      await injectScript('mainWorld')

      expect(script.src).toBe('moz-extension://test/assets/mainWorld-AbCd1234.js')
      expect(script.type).toBe('module')
      expect(script.remove).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    }
  })
})
