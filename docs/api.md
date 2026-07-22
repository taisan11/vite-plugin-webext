# API reference

## `unlistedScripts`

Configure scripts that are bundled as extension resources without registering them directly in `content_scripts`. The object key becomes the generated file name.

```ts
webext({
  unlistedScripts: {
    mainWorld: 'src/main-world.ts',
  },
})
```

For one script, use `unlistedScript: 'src/main-world.ts'`; its name is `main`.

Configured scripts become bundle entries, and the required `web_accessible_resources` entries are added to the manifest automatically.

## `defineUnlistedScript`

Define the body of an unlisted script:

```ts
import { defineUnlistedScript } from '@taisan11/vite-plugin-webext/inject-script'

export default defineUnlistedScript(() => {
  document.documentElement.dataset.extensionReady = 'true'
})
```

## `injectScript`

Inject an unlisted script into the page's main world from a content script. The name is the `unlistedScripts` key; the `.js` suffix is optional.

```ts
import { injectScript } from '@taisan11/vite-plugin-webext/inject-script'

await injectScript('mainWorld')
await injectScript('mainWorld', { keepInDom: true })
```

Options:

- `keepInDom`: keep the `script` element in the DOM after it loads
- `modifyScript`: modify the script element before it is appended

## `i18n`

Set `i18n: true` to collect message IDs from `defineLocale` exports in `src/locale/*.ts`:

```ts
import { t } from '@taisan11/vite-plugin-webext/i18n'

const title = t('appTitle')
```

At build time, `t('appTitle')` is replaced with `browser.i18n.getMessage('appTitle')`.

## Messaging

```ts
import { sendMessage, sendMessageToTab } from '@taisan11/vite-plugin-webext/messaging'

const result = await sendMessage('getProfile', { userId: '42' })
await sendMessageToTab(1, 'getProfile', { userId: '42' })
```

Calls are replaced at build time with `browser.runtime.sendMessage` and `browser.tabs.sendMessage`.

## `zipArtifacts`

`zipArtifacts` defaults to `true`, but ZIP creation requires `--mode chrome-zip` or `--mode firefox-zip`:

```ts
webext({
  zipArtifacts: false,
})
```

## `unavailableApi`

Choose how to handle APIs that are unavailable in the target browser:

```ts
webext({
  unavailableApi: 'warn', // 'error' | 'warn' | 'ignore'
})
```
