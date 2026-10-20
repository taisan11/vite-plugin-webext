# API

対応する Vite は `^8.3.4` です。

## `webext(options)`

| オプション | 型 | デフォルト・動作 |
| --- | --- | --- |
| `manifest` | `WebExtensionManifest` または `(browser) => WebExtensionManifest` | 必須 |
| `defaultBrowser` | `'chrome'` / `'firefox'` | ブラウザ指定 mode 以外で使用。その場合は指定必須 |
| `staticTransform` | `boolean` | `true`。browser/chrome namespace の変換のみ制御 |
| `unavailableApi` | `'error'` / `'warn'` / `'ignore'` | `'error'`。namespace 変換とは独立 |
| `i18n` | `boolean` または `{ enabled?: boolean, localeDir?: string }` | 無効。locale ディレクトリの既定値は `src/locale` |
| `unlistedScripts` | `Record<string, string>` | `{}`。スクリプト名とソースの対応 |

旧 `browser`、`injectGlobals`、`unlistedScript`、`zipArtifacts` は廃止しました。
それぞれ `defaultBrowser`、`staticTransform`、`unlistedScripts`、ZIP 用 mode を使ってください。

## ブラウザ選択

`chrome` / `firefox` / `chrome-zip` / `firefox-zip` mode は `defaultBrowser` より優先されます。
それ以外の mode は `defaultBrowser` を使い、対象が決まらなければエラーにします。

## namespace 変換と API 検証

`staticTransform: false` はソースの `browser.*` / `chrome.*` をそのまま残します。
API の利用可否チェック、i18n・messaging ヘルパーの変換は停止しません。
ヘルパーは常に対象ブラウザのネイティブ namespace へ変換します。
グローバル変数や polyfill の注入は行いません。

## `unlistedScripts`

manifest の `content_scripts` に直接登録せず、あとから注入するスクリプトです。
キーは `injectScript` が使う論理名で、出力ファイル名を固定するものではありません。

```ts
webext({
  manifest,
  unlistedScripts: {
    mainWorld: 'src/main-world.ts',
  },
})
```

単一スクリプトも同じオブジェクト形式で指定します。
必要な `web_accessible_resources` は自動生成し、ハッシュを含む実ファイル名は
Vite の build manifest から解決します。Vite manifest 自体は公開リソースにしません。

content script・未列挙スクリプトは共有 JS import を含まない形に個別バンドルします。
classic background script も同様です。HTML ページと module background の
code splitting は Vite の通常の動作を維持します。

## `defineUnlistedScript`

```ts
import { defineUnlistedScript } from '@taisan11/vite-plugin-webext/inject-script'

export default defineUnlistedScript(() => {
  document.documentElement.dataset.extensionReady = 'true'
})
```

## `injectScript`

content script からページの main world にスクリプトを注入します。
引数は `unlistedScripts` のキーで、`.js` は省略できます。

```ts
import { injectScript } from '@taisan11/vite-plugin-webext/inject-script'

await injectScript('mainWorld')
await injectScript('mainWorld', { keepInDom: true })
```

- `keepInDom`: 読み込み後も script 要素を残す。
- `modifyScript`: append 前に要素を変更する。

## `i18n`

```ts
webext({ manifest, i18n: { localeDir: 'src/locale' } })
```

`defineLocale` からメッセージ ID と `_locales/<locale>/messages.json` を生成します。
型定義は `<localeDir>/webext-i18n.d.ts` へ dev・本番ビルドの両方で生成し、locale の変更時にも更新します。
内容が変わらなければ型定義を書き直しません。
`t(id)` は `staticTransform` に関係なく、対象に合わせて
`chrome.i18n.getMessage` / `browser.i18n.getMessage` に変換します。

## messaging

```ts
import { sendMessage, sendMessageToTab } from '@taisan11/vite-plugin-webext/messaging'

const result = await sendMessage('getProfile', { userId: '42' })
await sendMessageToTab(1, 'getProfile', { userId: '42' })
```

`staticTransform` に関係なく、対象ブラウザのネイティブな
`runtime.sendMessage` / `tabs.sendMessage` に変換します。

## Vite 設定との関係

- `build.outDir` にブラウザ名のサブディレクトリを追加します。同名で終わっている場合は追加しません。
- `import.meta.env.BROWSER`、`IS_CHROME`、`IS_FIREFOX`、`WEBEXT_UNLISTED_SCRIPT_PATHS` はプラグインが定義します。
- `input` と `build.rolldownOptions.input` は文字列・配列・名前付きオブジェクトを受け付けます。パスは Vite の root が基準です。
- 名前付きユーザー入力は自動エントリを上書きします。`build.rolldownOptions.input` はトップレベル `input` より優先します。文字列・配列は同名の自動エントリを置き換えず追加します。
- 入力は Vite が解決する前に client environment の `input` へ正規化します。解決済み設定の変更は行いません。
- `build.manifest` は常に有効です。独自ファイル名も使えますが、`manifest.json` は拡張機能用に予約しています。
- 出力は1つに限定し、`build.rolldownOptions.output` の配列指定は設定時にエラーにします。ブラウザごとに mode を変えてビルドしてください。
- 出力ファイル名は変更しません。リソースは Vite build manifest から、HTML ページは出力 HTML アセットの情報からパスを解決します。Vite manifest の HTML エントリはページではなく JS chunk を指すためです。
- `vite` は `write: true` / `minify: false` の watch ビルドも起動します。変更後の拡張機能再読み込みは手動です。

## ZIP 用 mode

```bash
vite build --mode chrome-zip
vite build --mode firefox-zip
```

この mode では、出力をディスクに書き込む場合に常に ZIP を生成します。
通常の `chrome` / `firefox` mode では生成しません。
`webext` の ZIP オプションはなく、mode のみで切り替えます。
