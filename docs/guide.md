# Getting started

## Install

Add the plugin to an existing project:

```bash
bun add @taisan11/vite-plugin-webext
```

To create a new project, run this in an empty directory:

```bash
bunx @taisan11/vite-plugin-webext init .
```

Existing files are never overwritten. The generated project includes `dev`, `dev:chrome`, `dev:firefox`, `build:chrome`, and `build:firefox` scripts.

## Minimal configuration

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
        background: {
          service_worker: 'src/background.ts',
          type: 'module',
        },
        action: {
          default_popup: 'src/popup/index.html',
        },
      },
    }),
  ],
})
```

`manifest` accepts a `WebExtensionManifest` object or a factory receiving the target browser:

```ts
webext({
  manifest: (browser) => ({
    manifest_version: 3,
    name: `My Extension (${browser})`,
    version: '1.0.0',
  }),
})
```

## Browser builds

```bash
vite build --mode chrome
vite build --mode firefox
```

Output is written to `dist/chrome/` and `dist/firefox/`. If the mode is neither `chrome` nor `firefox`, `defaultBrowser` (or the backwards-compatible `browser` option) is used.

Browser API namespaces are not rewritten. Choose `browser.*` or `chrome.*` according to the runtime and polyfills used by your project.

## Automatic entries

The plugin collects these inputs from the manifest:

- background service workers and MV2 background scripts
- action, browser-action, and page-action popups
- options, DevTools, side panel, and sidebar pages
- Chrome URL overrides and sandbox pages
- `content_scripts[].js`

Additional entries can be supplied through `build.rolldownOptions.input`. They are merged with the automatic entries, with user-defined keys taking precedence.

## Development builds

The generated `dev` script runs `vite build --watch --mode chrome`. It writes extension artifacts to `dist/chrome/` on every change instead of starting a regular Vite web server.

```bash
bun run dev
bun run dev:firefox
```

## ZIP artifacts

ZIP files are created only for the dedicated modes:

```bash
vite build --mode chrome-zip
vite build --mode firefox-zip
```

The generated files are:

- `<browser>-<version>-source.zip`
- `<browser>-<version>-dist.zip`
- `<browser>-zip.zip`

Regular `chrome` and `firefox` builds do not create ZIP files. Set `zipArtifacts: false` to disable ZIP creation even in a `-zip` mode.
