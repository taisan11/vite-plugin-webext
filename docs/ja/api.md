# API

## `unlistedScripts`

manifestの `content_scripts` に直接登録せず、あとからページへ注入するスクリプトを指定します。キーがビルド後のファイル名になります。

```ts
webext({
  unlistedScripts: {
    mainWorld: 'src/main-world.ts',
  },
})
```

単一スクリプトだけなら `unlistedScript: 'src/main-world.ts'` も使えます。この場合の名前は `main` です。

設定したスクリプトは入力エントリとしてビルドされ、必要な `web_accessible_resources` がmanifestへ追加されます。

## `defineUnlistedScript`

未列挙スクリプトの実行本体を定義します。

```ts
import { defineUnlistedScript } from '@taisan11/vite-plugin-webext/inject-script'

export default defineUnlistedScript(() => {
  document.documentElement.dataset.extensionReady = 'true'
})
```

## `injectScript`

content scriptから未列挙スクリプトをページのmain worldへ注入します。引数は `unlistedScripts` のキーで、`.js` は省略できます。

```ts
import { injectScript } from '@taisan11/vite-plugin-webext/inject-script'

await injectScript('mainWorld')
await injectScript('mainWorld', { keepInDom: true })
```

オプション:

- `keepInDom`: 読み込み後も `script` 要素をDOMに残す
- `modifyScript`: append前にscript要素を変更する

## `i18n`

`i18n: true` を指定すると、`src/locale/*.ts` の `defineLocale` からメッセージIDを収集します。

```ts
import { t } from '@taisan11/vite-plugin-webext/i18n'

const title = t('appTitle')
```

ビルド時に `t('appTitle')` は `browser.i18n.getMessage('appTitle')` へ置換されます。

## messaging

```ts
import { sendMessage, sendMessageToTab } from '@taisan11/vite-plugin-webext/messaging'

const result = await sendMessage('getProfile', { userId: '42' })
await sendMessageToTab(1, 'getProfile', { userId: '42' })
```

呼び出しはビルド時に `browser.runtime.sendMessage` / `browser.tabs.sendMessage` へ置換されます。

## `zipArtifacts`

`zipArtifacts` のデフォルトは `true` ですが、ZIP作成には `--mode chrome-zip` または `--mode firefox-zip` が必要です。

```ts
webext({
  zipArtifacts: false,
})
```

## `unavailableApi`

対象ブラウザに存在しないAPIを検出したときの扱いを指定します。

```ts
webext({
  unavailableApi: 'warn', // 'error' | 'warn' | 'ignore'
})
```
