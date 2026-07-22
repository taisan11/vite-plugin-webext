import { describe, expect, it } from 'vitest'
import { collectUnlistedScriptInputs, resolveUnlistedScriptManifest } from '../utils/unlisted-scripts.ts'
import { collectManifestInputs } from '../utils/manifest-inputs.ts'

describe('unlisted scripts', () => {
  it('creates named build inputs', () => {
    expect(collectUnlistedScriptInputs({ mainWorld: 'src/main-world.ts' }, '/project')).toEqual({
      mainWorld: '/project/src/main-world.ts',
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
    ).toEqual({ 'content-0-0': '/project/src/content.ts' })
  })
})
