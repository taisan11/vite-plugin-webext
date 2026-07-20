---
name: vite-plugin-webext
description: Use when configuring or maintaining Vite-based Chrome/Firefox WebExtension builds with @taisan11/vite-plugin-webext, including manifest generation, browser-targeted builds, static browser/chrome API rewrites, i18n helpers, messaging helpers, and zip artifacts.
---

# vite-plugin-webext

Use `@taisan11/vite-plugin-webext` when a Vite project needs to build a browser extension for Chrome and/or Firefox with static browser-specific output.

## Install

```bash
bun add @taisan11/vite-plugin-webext
```

If the project uses another package manager, use the equivalent `npm install`, `pnpm add`, or `yarn add` command.

## Basic Setup

Add `webext()` to `vite.config.ts` and provide a manifest object or manifest factory.

```ts
import { defineConfig } from 'vite'
import { webext } from '@taisan11/vite-plugin-webext'

export default defineConfig({
  plugins: [
    webext({
      defaultBrowser: 'chrome',
      manifest: (browser) => ({
        manifest_version: 3,
        name: `My Extension (${browser})`,
        version: '1.0.0',
        background: {
          service_worker: 'src/background.ts',
          type: 'module',
        },
      }),
    }),
  ],
})
```

Build with Vite mode to select the target browser.

```bash
vite build --mode chrome
vite build --mode firefox
```

If `--mode` is not `chrome` or `firefox`, set `defaultBrowser`. The legacy `browser` option is still accepted as an alias.

## Multi-Entry Extensions

The plugin automatically derives bundle entry inputs from the `manifest` you pass. HTML pages (popup, options, devtools, side panel, sidebar, URL overrides, sandbox) and background scripts/service workers are collected from the manifest, so you normally do not need to configure `build.rolldownOptions.input` yourself.

```ts
import { defineConfig } from 'vite'
import { webext } from '@taisan11/vite-plugin-webext'

export default defineConfig({
  plugins: [
    webext({
      defaultBrowser: 'chrome',
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

If a project needs extra inputs not present in the manifest, pass them via `build.rolldownOptions.input`; the plugin merges user inputs on top of the auto-derived ones (user keys win).

```ts
export default defineConfig({
  plugins: [webext({ manifest })],
  build: {
    rolldownOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.html'),
      },
    },
  },
})
```

The plugin writes browser-specific output directories such as `dist/chrome` and `dist/firefox`.

## Static API Rewrite

Write extension source code with `browser.*` by default. During build:

- `vite build --mode chrome` rewrites extension API namespace usage to `chrome.*`.
- `vite build --mode firefox` keeps or rewrites usage to `browser.*`.
- No runtime shim is injected.

Unavailable APIs are checked at build time. Configure behavior with `unavailableApi: 'error' | 'warn' | 'ignore'`; default is `'error'`.

```ts
webext({
  defaultBrowser: 'chrome',
  unavailableApi: 'warn',
})
```

Disable static namespace rewriting with `staticTransform: false` when a project intentionally manages namespaces itself. The legacy `injectGlobals` option is accepted as an alias.

When Vite/Rolldown provides `meta.magicString` through `experimental.nativeMagicString: true`, the plugin uses it automatically and falls back to the JavaScript `magic-string` package otherwise.

## TypeScript Globals

Create or update the extension project's environment declarations.

```ts
/// <reference types="@taisan11/vite-plugin-webext/types" />
```

This provides types for the global `browser.*` API and `import.meta.env.BROWSER`, `IS_CHROME`, and `IS_FIREFOX`.

## i18n Helper

Enable i18n when the project wants typed locale ids and static `t(id)` replacement.

```ts
webext({
  i18n: true,
})
```

Create locale source files under `src/locale` by default.

```ts
import { defineLocale } from '@taisan11/vite-plugin-webext/i18n'

export default defineLocale({
  appTitle: 'My Extension',
  openSettings: 'Open Settings',
})
```

Use `t()` in extension code.

```ts
import { t } from '@taisan11/vite-plugin-webext/i18n'

document.title = t('appTitle')
```

At build time, static calls are rewritten to `browser.i18n.getMessage(...)` or `chrome.i18n.getMessage(...)`, depending on the target and namespace rewrite settings.

Customize the locale directory with:

```ts
webext({
  i18n: {
    localeDir: 'src/locales',
  },
})
```

## Messaging Helper

Use the messaging helpers when a project wants typed message names and payloads while still emitting native extension API calls.

```ts
import { sendMessage, sendMessageToTab } from '@taisan11/vite-plugin-webext/messaging'

await sendMessage('PING', { at: Date.now() })
await sendMessageToTab(tabId, 'PING', { at: Date.now() })
```

At build time, helper calls are statically replaced with native `runtime.sendMessage` or `tabs.sendMessage` calls using the target namespace.

## Manifest And Artifacts

Pass `manifest` as a plain object or `(browser) => manifest`. The plugin emits `manifest.json` during build and rewrites path-like manifest strings to match generated bundle paths.

Zip artifacts are enabled by default. Disable them when not needed:

```ts
webext({
  zipArtifacts: false,
})
```

## Validation

After changing configuration or plugin usage, run:

```bash
bun run typecheck
bun run build
```

For consuming projects, run the project's own build command for each target browser mode.
