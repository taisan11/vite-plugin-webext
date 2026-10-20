# API reference

Requires Vite `^8.3.4`.

## `webext(options)`

| Option | Type | Default / behavior |
| --- | --- | --- |
| `manifest` | `WebExtensionManifest` or `(browser) => WebExtensionManifest` | Required |
| `defaultBrowser` | `'chrome'` or `'firefox'` | Used outside browser-specific modes; otherwise required |
| `staticTransform` | `boolean` | `true`; controls browser/chrome namespace rewriting only |
| `unavailableApi` | `'error'`, `'warn'`, `'ignore'` | `'error'`; independent of namespace rewriting |
| `i18n` | `boolean` or `{ enabled?: boolean, localeDir?: string }` | Disabled; locale directory defaults to `src/locale` |
| `unlistedScripts` | `Record<string, string>` | `{}`; names mapped to source files |

The old `browser`, `injectGlobals`, `unlistedScript`, and `zipArtifacts` options
have been removed. Use `defaultBrowser`, `staticTransform`, `unlistedScripts`,
and ZIP modes respectively.

## Browser selection

`chrome`, `firefox`, `chrome-zip`, and `firefox-zip` modes select the target before
`defaultBrowser`. Other modes use `defaultBrowser`; a missing target is an error.

## Namespace rewriting and API validation

`staticTransform: false` leaves source `browser.*` / `chrome.*` references intact.
It does not disable API validation or the i18n/messaging helper transforms.
Helpers always emit the selected browser's native namespace, even when source
namespace rewriting is disabled. No globals or polyfill are injected.

## `unlistedScripts`

Scripts are bundled without registering them directly in `content_scripts`.
Keys are logical names used by `injectScript`, not fixed output filenames.

```ts
webext({
  manifest,
  unlistedScripts: {
    mainWorld: 'src/main-world.ts',
  },
})
```

Use the same object form for one script. Required `web_accessible_resources`
entries are generated automatically. Actual filenames, including hashes, are
resolved from Vite's build manifest. The Vite manifest itself is not exposed as
a web-accessible resource.

Content scripts and unlisted scripts are independently bundled without shared
JS imports. Classic background scripts are handled the same way. HTML pages and
module backgrounds retain Vite's ordinary code splitting.

## `defineUnlistedScript`

```ts
import { defineUnlistedScript } from '@taisan11/vite-plugin-webext/inject-script'

export default defineUnlistedScript(() => {
  document.documentElement.dataset.extensionReady = 'true'
})
```

## `injectScript`

Inject an unlisted script into the page's main world from a content script.
The name is an `unlistedScripts` key; the `.js` suffix is optional.

```ts
import { injectScript } from '@taisan11/vite-plugin-webext/inject-script'

await injectScript('mainWorld')
await injectScript('mainWorld', { keepInDom: true })
```

- `keepInDom`: keep the script element after loading.
- `modifyScript`: modify the element before it is appended.

## `i18n`

```ts
webext({ manifest, i18n: { localeDir: 'src/locale' } })
```

`defineLocale` exports supply message IDs and `_locales/<locale>/messages.json`.
Message ID declarations are written to `<localeDir>/webext-i18n.d.ts` in dev and
production builds, and refreshed on locale changes without rewriting unchanged
content. `t(id)` emits `chrome.i18n.getMessage` or `browser.i18n.getMessage` for
the selected target, independently of `staticTransform`.

## Messaging

```ts
import { sendMessage, sendMessageToTab } from '@taisan11/vite-plugin-webext/messaging'

const result = await sendMessage('getProfile', { userId: '42' })
await sendMessageToTab(1, 'getProfile', { userId: '42' })
```

Calls are replaced with native `runtime.sendMessage` / `tabs.sendMessage` calls
in the selected target namespace, independently of `staticTransform`.

## Vite configuration contract

- `build.outDir` receives a browser subdirectory, unless it already ends with that browser name.
- The plugin owns `import.meta.env.BROWSER`, `IS_CHROME`, `IS_FIREFOX`, and `WEBEXT_UNLISTED_SCRIPT_PATHS` defines.
- Additional `input` and `build.rolldownOptions.input` accept strings, arrays, or named objects. All paths are resolved relative to Vite's root.
- Named user entries override automatic entries. Low-level `build.rolldownOptions.input` takes priority over top-level `input`. Strings/arrays add entries without replacing same-named automatic entries.
- Inputs are normalized into the client environment's `input` before Vite resolves it; resolved config is not modified.
- `build.manifest` is always enabled. A custom filename is respected, except `manifest.json`, which is reserved for the extension manifest.
- Only a single output is supported; an array in `build.rolldownOptions.output` is a configuration error. Build browser targets separately using mode.
- Output filenames are not changed. Resource paths come from the Vite build manifest. HTML page paths come from emitted HTML asset metadata because Vite's HTML manifest records describe their JS chunks.
- `vite` starts a watch build, with `write: true` and `minify: false`. Reload the installed extension manually after changes.

## ZIP modes

```bash
vite build --mode chrome-zip
vite build --mode firefox-zip
```

ZIP artifacts are always generated in these modes when output is written to disk.
Normal `chrome` / `firefox` modes do not generate them. There is no ZIP option in
`webext`; use the mode to select this behavior.
