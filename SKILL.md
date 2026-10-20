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

Requires Vite `^8.3.4`. `manifest` is required. If mode does not select a browser, set `defaultBrowser`. The `browser`, `injectGlobals`, `unlistedScript`, and `zipArtifacts` options have been removed.

For development, run `vite` (using `defaultBrowser`) or `vite --mode chrome|firefox`. The server also maintains an on-disk watch build. Reload the extension manually after changes.

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

Extra top-level `input` and `build.rolldownOptions.input` accept strings, arrays, and named objects. Named user entries override automatic entries, with low-level input taking priority over top-level input. Strings/arrays add entries without replacing automatic entries. Paths are resolved relative to Vite's root.

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
  manifest,
  defaultBrowser: 'chrome',
  unavailableApi: 'warn',
})
```

`staticTransform: false` disables namespace rewriting only. Unavailable-API validation and i18n/messaging helper transforms remain independent; helpers always use the selected browser's namespace.

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
  manifest,
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

Helpers emit `browser.i18n.getMessage(...)` or `chrome.i18n.getMessage(...)` for the target, independently of `staticTransform`. `<localeDir>/webext-i18n.d.ts` is generated in both dev and production builds and updated on locale changes.

Customize the locale directory with:

```ts
webext({
  manifest,
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

`manifest` is required as an object or `(browser) => manifest`. The plugin always enables Vite's build manifest (default `.vite/manifest.json`) and uses it to resolve extension resource paths. HTML pages are resolved from emitted asset metadata. Never rename generated output files or strip `src/` from their paths. `manifest.json` is reserved for the extension manifest.

Content scripts and unlisted scripts are independently bundled without shared JS imports; HTML pages keep Vite's code splitting. Use `unlistedScripts: { main: 'src/main-world.ts' }` even for one script.

ZIP artifacts are controlled only by `vite build --mode chrome-zip|firefox-zip`. Ordinary browser modes do not create ZIPs. `build.write: false` also skips ZIP generation.

## Validation

After changing configuration or plugin usage, run:

```bash
bun run typecheck
bun run build
```

For consuming projects, run the project's own build command for each target browser mode.
