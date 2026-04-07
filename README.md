# vite-plugin-webext

`@taisan11/vite-plugin-webext` is a Vite plugin for cross-browser WebExtension builds.

It supports:

- Browser target resolution from `--mode` (`chrome` / `firefox`)
- Configurable default browser when `--mode` is not set
- Manifest generation from `vite.config.ts`
- Fully static namespace rewrite with MagicString (`chrome` output uses `chrome.*`, `firefox` output uses `browser.*`)
- Type-safe messaging helpers with static replacement (`runtime.sendMessage` / `tabs.sendMessage`)
- Browser-separated output directories
- Zip artifact generation via `@zip.js/zip.js`

## Install

```bash
bun add @taisan11/vite-plugin-webext
```

## Build this package with tsdown

This project uses `tsdown` (replacement for tsup).

```bash
bun run build
```

`build` runs `tsdown --dts`, so JS bundle and `.d.ts` are generated together.

## Browser target by `--mode`

Use Vite mode to pick the browser:

```bash
vite build --mode chrome
vite build --mode firefox
```

If `webext({ defaultBrowser })` or `webext({ browser })` is also set, mode value takes precedence.

## Default browser without `--mode`

You can set a fallback browser when build mode is not `chrome` / `firefox`:

```ts
webext({
  defaultBrowser: 'chrome',
})
```

`browser` is still supported as a backward-compatible alias of `defaultBrowser`.

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

`manifest` can be:

- `WebExtensionManifest`
- `(browser) => WebExtensionManifest`

## `build.rolldownOptions.input` example

For multi-entry extension builds, set input via `build.rolldownOptions.input`:

```ts
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { webext } from '@taisan11/vite-plugin-webext'

export default defineConfig({
  plugins: [webext({ manifest: (browser) => ({ manifest_version: 3, name: browser, version: '1.0.0' }) })],
  build: {
    rolldownOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        popup: resolve(__dirname, 'src/popup/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
      },
    },
  },
})
```

## Static rewrite policy

Write extension code with `browser.*`.

At build time, the plugin performs fully static namespace rewriting with MagicString:

- `vite build --mode chrome` rewrites `browser.*` / `chrome.*` to `chrome.*`
- `vite build --mode firefox` rewrites `browser.*` / `chrome.*` to `browser.*`

No runtime shim is injected.

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

## Zip artifacts

When building with mode, the plugin creates:

- `dist/<browser>-<version>-source.zip`
- `dist/<browser>-<version>-dist.zip`
- `dist/<browser>-zip.zip`

Example for chrome mode:

- `dist/chrome-1.2.3-source.zip`
- `dist/chrome-1.2.3-dist.zip`
- `dist/chrome-zip.zip`

Set `zipArtifacts: false` to disable zip generation.

If the browser output directory is missing (for example, `build.write: false`), dist zip generation is skipped with a warning instead of failing the build.
