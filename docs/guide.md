# Getting started

## Install

Requires Vite `^8.3.4`. Add the plugin to an existing project:

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

`manifest` is required and accepts a `WebExtensionManifest` object or a factory receiving the target browser:

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

Output is written to `dist/chrome/` and `dist/firefox/`. If the mode is neither `chrome` nor `firefox`, `defaultBrowser` is used.

Write extension code with `browser.*` by default. The plugin statically rewrites API namespaces to `chrome.*` for Chrome builds and `browser.*` for Firefox builds. No runtime shim is injected. Set `staticTransform: false` to disable this behavior.

## Automatic entries

The plugin collects these inputs from the manifest:

- background service workers and MV2 background scripts
- action, browser-action, and page-action popups
- options, DevTools, side panel, and sidebar pages
- Chrome URL overrides and sandbox pages
- `content_scripts[].js`

Additional entries can be supplied through top-level `input` or `build.rolldownOptions.input` as strings, arrays, or named objects. Named user entries take precedence over automatic entries, and low-level input takes precedence over top-level input. Strings/arrays add entries without replacing automatic entries.

Vite's build manifest is always generated. Output filenames are preserved; resource references in the extension manifest are resolved from Vite's output metadata. Content scripts and unlisted scripts are bundled independently; HTML pages keep normal Vite code splitting.

## Development builds

The generated `dev` script runs `vite` with the configured `defaultBrowser`. With `webext({ manifest })`, the Vite dev server also starts a watch build and waits for the first build to finish. Extension artifacts are written to `dist/chrome/` or `dist/firefox/` on every change; custom `build.outDir` is respected. Stopping the server stops the build watcher too.

You can also run `vite --mode chrome` or `vite --mode firefox` directly. Load the output folder as an unpacked/temporary extension. After a rebuild, reload the extension and any tabs using its content scripts. Automatic extension reload and HMR inside the installed extension are not provided. HTML pages served directly by Vite retain normal Vite HMR but do not have extension API access. `vite build --watch` remains supported.

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

Regular `chrome` and `firefox` builds do not create ZIP files. ZIP generation is controlled only by mode; there is no `zipArtifacts` option. No ZIP files are created with `build.write: false`.
