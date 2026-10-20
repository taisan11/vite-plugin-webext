# @taisan11/vite-plugin-webext

Create a minimal WebExtension project in an empty directory:

```bash
bunx @taisan11/vite-plugin-webext init .
```

**A simple Vite plugin to easily create lightweight extensions.**

Requires Vite `^8.3.4`. Every `webext()` call must provide `manifest`.
The supported options are `manifest`, `defaultBrowser`, `staticTransform`,
`unavailableApi`, `i18n`, and `unlistedScripts`.

## Publishing (maintainers)

`.github/workflows/publish.yml` publishes to npm when a `v*` tag is pushed.
The tag must exactly match `v` + the version in `package.json`. The workflow
installs dependencies with Bun's frozen lockfile, typechecks, tests, and builds
before publishing with provenance.

Before the first automated release, configure a GitHub Actions trusted publisher
in the npm settings for `@taisan11/vite-plugin-webext`:

- Owner: `taisan11`
- Repository: `vite-plugin-webext`
- Workflow filename: `publish.yml`
- Environment: leave blank

No `NPM_TOKEN` secret is required. Update `package.json` to a new, unpublished
version, commit it, and push that commit and its matching tag:

```bash
git tag v<version>
git push origin HEAD
git push origin v<version>
```

## Development with `vite`

```bash
vite                  # uses webext({ defaultBrowser })
vite --mode chrome
vite --mode firefox
```

With `webext({ manifest })`, the dev server also runs a watch build. It waits for
an initial build, then keeps a loadable extension in `dist/chrome/` or
`dist/firefox/` up to date, including the manifest and public assets. Custom
`build.outDir` is supported. Stopping the dev server stops the build watcher.

Load this folder as an unpacked/temporary extension. After changes, reload the
extension (and affected tabs for content scripts). Automatic extension reload
and HMR inside the installed extension are not provided. HTML pages opened via
the Vite server still use normal Vite HMR, but do not have extension API access.
`vite build --watch` remains supported.

## Browser target by `--mode`

Use Vite mode to pick the browser:

```bash
vite build --mode chrome
vite build --mode firefox
```

Browser modes take precedence over `defaultBrowser`.

## Default browser without `--mode`

You can set a fallback browser when build mode is not `chrome` / `firefox`:

```ts
webext({
  manifest, // your required manifest object or factory
  defaultBrowser: 'chrome',
})
```

The old `browser` option has been removed.

## Plugin usage

```ts
import { defineConfig } from 'vite'
import { webext } from '@taisan11/vite-plugin-webext'

export default defineConfig({
  plugins: [
    webext({
      manifest: {
        manifest_version: 3,
        name: 'My Extension',
        version: '1.2.3',
        background: { service_worker: 'src/background.ts', type: 'module' },
      },
    }),
  ],
})
```

`manifest` is required and can be:

- `WebExtensionManifest`
- `(browser) => WebExtensionManifest`

## Injecting unlisted scripts

Configure scripts that should be bundled as extension resources without adding them to `content_scripts`:

```ts
webext({
  unlistedScripts: {
    mainWorld: 'src/main-world.ts',
  },
  manifest: {
    manifest_version: 3,
    name: 'My Extension',
    version: '1.0.0',
    content_scripts: [{ matches: ['*://*/*'], js: ['src/content.ts'] }],
  },
})
```

From a content script, call `injectScript('mainWorld')` to inject the generated file into the page's main world. Its actual filename (including any hash) is resolved from Vite's build manifest:

The unlisted script itself can use `defineUnlistedScript`:

```ts
import { defineUnlistedScript } from '@taisan11/vite-plugin-webext/inject-script'

export default defineUnlistedScript(() => {
  console.log('running in the page')
})
```

```ts
import { injectScript } from '@taisan11/vite-plugin-webext/inject-script'

await injectScript('mainWorld')
```

The plugin automatically adds the configured scripts to `web_accessible_resources`.
Use `unlistedScripts: { main: 'src/main-world.ts' }` even for a single script.
Content scripts and unlisted scripts are bundled independently, without shared
JS imports; HTML pages retain Vite's normal code splitting.

## `build.rolldownOptions.input` example

The plugin automatically collects bundle entry inputs from the `manifest` you pass (background service worker/scripts, popup, options, devtools, side panel, sidebar, Chrome URL overrides, sandbox pages). You normally do not need to configure `build.rolldownOptions.input` manually:

```ts
import { defineConfig } from 'vite'
import { webext } from '@taisan11/vite-plugin-webext'

export default defineConfig({
  plugins: [
    webext({
      manifest: {
        manifest_version: 3,
        name: 'My Extension',
        version: '1.0.0',
        background: { service_worker: 'src/background.ts', type: 'module' },
        action: { default_popup: 'src/popup/index.html' },
        options_ui: { page: 'src/options/index.html' },
      },
    }),
  ],
})
```

Extra inputs may be supplied through Vite's top-level `input` or
`build.rolldownOptions.input`, as a string, array, or named object. Named user
entries override automatic entries; `build.rolldownOptions.input` takes priority
over top-level `input`. Strings and arrays add entries without replacing
same-named automatic entries. All paths are resolved relative to Vite's root:

```ts
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { webext } from '@taisan11/vite-plugin-webext'

export default defineConfig({
  plugins: [webext({ manifest: (browser) => ({ manifest_version: 3, name: browser, version: '1.0.0' }) })],
  build: {
    rolldownOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.html'),
      },
    },
  },
})
```

## Extension API namespaces

Write extension code with `browser.*` by default. The plugin rewrites API
namespace references to the active browser target during the build:

- Chrome builds use `chrome.*`.
- Firefox builds use `browser.*`.
- No runtime shim is injected.

Namespace rewriting is enabled by default. Set `staticTransform: false` to keep
the source namespace unchanged. This does not disable API validation or the i18n
and messaging helper transforms; helpers always target the selected browser's
native API. The old `injectGlobals` option has been removed.

When running on Rolldown with `experimental.nativeMagicString: true`, the plugin automatically uses the native `meta.magicString` object when it is available and falls back to the JavaScript `magic-string` package otherwise.

## TypeScript setup for `browser.*`

Create `src/env.d.ts` in your extension project and add:

```ts
/// <reference types="@taisan11/vite-plugin-webext/types" />
```

This enables typings for the global `browser.*` API and `import.meta.env.BROWSER` / `IS_CHROME` / `IS_FIREFOX`.

## i18n helper (`t(id)`)

Enable i18n transform in plugin options:

```ts
webext({
  manifest,
  i18n: true,
})
```

Export `defineLocale(...)` from `src/locale/[localeName].ts` to register message ids:

```ts
import { defineLocale } from '@taisan11/vite-plugin-webext/i18n'

export default defineLocale({
  appTitle: 'My Extension',
  openSettings: 'Open Settings',
  notificationContent: {
    message: 'You clicked $URL$.',
    description: 'Tells the user which link they clicked.',
    placeholders: {
      url: {
        content: '$1',
        example: 'https://developer.mozilla.org',
      },
    },
  },
})
```

Use `t(id)` in extension code:

```ts
import { t } from '@taisan11/vite-plugin-webext/i18n'

const title = t('appTitle')
```

At build time, `t('appTitle')` is statically rewritten to `browser.i18n.getMessage('appTitle')`, and message id types are derived from `src/locale/*.ts`.
Nested keys such as `notificationContent.message` are not collected as message ids; only top-level ids like `notificationContent` are collected.
`src/locale/webext-i18n.d.ts` is generated in dev and production builds and refreshed
on locale changes. An unchanged declaration is not rewritten.

## messaging helpers (`sendMessage`, `sendMessageToTab`)

You can define request/response contracts by augmenting `WebextMessageMap`:

```ts
declare global {
  interface WebextMessageMap {
    getProfile: { request: { userId: string }; response: { name: string } }
  }
}
```

Use typed helpers from `@taisan11/vite-plugin-webext/messaging`:

```ts
import { sendMessage, sendMessageToTab } from '@taisan11/vite-plugin-webext/messaging'

const profile = await sendMessage('getProfile', { userId: '42' })
await sendMessageToTab(1, 'getProfile', { userId: '42' })
```

At build time, helper calls are statically rewritten to native APIs:

- `sendMessage(type, payload, options?)` → `browser.runtime.sendMessage({ type, payload }, options?)`
- `sendMessageToTab(tabId, type, payload, options?)` → `browser.tabs.sendMessage(tabId, { type, payload }, options?)`

## Output layout

Build output is placed under:

- `dist/chrome/`
- `dist/firefox/`

Vite's build manifest is always generated (default `.vite/manifest.json`). A
custom `build.manifest` filename is supported, except `manifest.json`, which is
reserved for the extension manifest. Output filenames are never rewritten:
script/resource paths are resolved from the Vite manifest and HTML page paths
from emitted HTML assets.

## Zip artifacts

When building with `--mode chrome-zip` or `--mode firefox-zip`, the plugin creates:

- `dist/<browser>-<version>-source.zip`
- `dist/<browser>-<version>-dist.zip`
- `dist/<browser>-zip.zip`

Example for chrome mode:

- `dist/chrome-1.2.3-source.zip`
- `dist/chrome-1.2.3-dist.zip`
- `dist/chrome-zip.zip`

ZIP generation is controlled only by mode; there is no `zipArtifacts` option.
Regular `--mode chrome` / `--mode firefox` builds do not generate ZIP files.
ZIP artifacts are skipped when `build.write: false` or the output directory is missing.
