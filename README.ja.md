# vite-plugin-webext

`@taisan11/vite-plugin-webext` is a Vite plugin for cross-browser WebExtension builds.

It supports:

- Browser target resolution from `--mode` (`chrome` / `firefox`)
- Manifest generation from `vite.config.ts`
- Static namespace rewrite with MagicString (`chrome.*` -> `browser.*`)
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

If `webext({ browser })` is also set, mode value takes precedence.

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

The plugin rewrites `chrome.*` access to `browser.*` with MagicString and emits warnings per file.

Codebase output should be unified to `browser.*`.

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
