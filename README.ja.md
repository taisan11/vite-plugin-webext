# vite-plugin-webext

`@taisan11/vite-plugin-webext` は、WebExtension をクロスブラウザ（Chrome / Firefox）でビルドするための Vite プラグインです。

主な機能:

- `--mode` (`chrome` / `firefox`) でターゲットブラウザを切り替え
- `--mode` が未指定でもデフォルトターゲットブラウザを設定可能
- `vite.config.ts` で定義した manifest の生成
- ブラウザ API namespace の静的変換（Chrome build では `browser.*` を `chrome.*` に変換）
- ブラウザ固有 API の利用可否チェック
- messaging ヘルパーの型安全 API と静的置換（`runtime.sendMessage` / `tabs.sendMessage`）
- ブラウザごとの出力ディレクトリ分離
- `@zip.js/zip.js` を使った zip 生成

対応する Vite は `^8.3.4` です。`manifest` は必須です。
公開オプションは `manifest`、`defaultBrowser`、`staticTransform`、
`unavailableApi`、`i18n`、`unlistedScripts` に整理しています。

## インストール

```bash
bun add @taisan11/vite-plugin-webext
```

## 新しいプロジェクトを作成

空のディレクトリで次のコマンドを実行すると、最小構成の WebExtension プロジェクトを生成します。

```bash
bunx @taisan11/vite-plugin-webext init .
```

別のディレクトリに生成する場合は、`.` の代わりにディレクトリ名を指定します。既存ファイルは上書きしません。

生成される `dev` は `vite` を起動します。Firefox 用は `bun run dev:firefox` を使ってください。

## `vite` による開発

```bash
vite                  # webext({ defaultBrowser }) の設定を使用
vite --mode chrome
vite --mode firefox
```

`webext({ manifest })` を設定すると、開発サーバーと同時に watch ビルドを起動します。
初回ビルドの完了を待ってから起動し、変更時は manifest や public のファイルを含めて
`dist/chrome/` / `dist/firefox/` を更新します。`build.outDir` の変更にも対応します。
サーバー終了時にはビルドの監視も終了します。

生成先を unpacked / 一時的な拡張機能としてブラウザに読み込んでください。
変更後は拡張機能を再読み込みし、content script の場合は対象タブも再読み込みします。
拡張機能の自動リロードや、インストール済み拡張機能内での HMR は提供しません。
開発サーバーで直接開いた HTML では通常の Vite HMR が使えますが、拡張機能 API は使えません。
従来の `vite build --watch` も引き続き利用できます。

## このパッケージのビルド（tsdown）

このプロジェクトは tsup ではなく `tsdown` を利用します。

```bash
bun run build
```

`build` は `tsdown --dts` を実行し、JS と型定義を同時生成します。

## `--mode` によるブラウザ切り替え

```bash
vite build --mode chrome
vite build --mode firefox
```

ブラウザを指定する `--mode` は `defaultBrowser` より優先されます。

## `--mode` 未指定時のデフォルトブラウザ

`--mode` が `chrome` / `firefox` 以外の場合に使うデフォルトを指定できます。

```ts
webext({
  manifest, // 必須の manifest オブジェクト、またはファクトリ
  defaultBrowser: 'chrome',
})
```

旧 `browser` オプションは廃止しました。

## 基本設定

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

`manifest` は必須で、以下を受け付けます。

- `WebExtensionManifest`
- `(browser) => WebExtensionManifest`

## 未列挙スクリプトの注入

`unlistedScripts` にスクリプト名とソースを指定すると、manifest の `content_scripts` には登録せず、拡張機能のリソースとしてビルドできます。

```ts
webext({
  unlistedScripts: {
    mainWorld: 'src/main-world.ts',
  },
  manifest: {
    manifest_version: 3,
    name: 'My Extension',
    version: '1.0.0',
    content_scripts: [{ matches: ['*://*/*'], js: ['src/content.ts'] }],
  },
})
```

content script から `injectScript('mainWorld')` を呼ぶと、生成ファイルをページの main world に注入します。ハッシュを含む実際のファイル名は Vite の build manifest から解決します。単一スクリプトも `unlistedScripts: { main: 'src/main-world.ts' }` で指定します。

未列挙スクリプト側では `defineUnlistedScript` に処理を渡せます。

```ts
import { defineUnlistedScript } from '@taisan11/vite-plugin-webext/inject-script'

export default defineUnlistedScript(() => {
  console.log('running in the page')
})
```

```ts
import { injectScript } from '@taisan11/vite-plugin-webext/inject-script'

await injectScript('mainWorld')
```

`injectScript` は注入対象スクリプトを `web_accessible_resources` に自動登録します。未列挙スクリプトがあるビルドでは Vite の build manifest（既定 `.vite/manifest.json`）をビルド時に読み、ハッシュ付き出力ファイル名を Content Script に埋め込みます。Vite manifest 自体は WAR に登録しません。

content script と未列挙スクリプトは、共有 JS import が残らないよう個別にバンドルします。HTML ページ側の code splitting は Vite に任せます。複数のスクリプト間で共有コードが重複する場合があります。

## `build.rolldownOptions.input` の設定例

プラグインは渡した `manifest` からバンドルのエントリ入力を自動収集します（background service worker/スクリプト、popup、options、devtools、side panel、sidebar、Chrome URL オーバーライド、sandbox ページ）。通常 `build.rolldownOptions.input` を手動で指定する必要はありません。

```ts
import { defineConfig } from 'vite'
import { webext } from '@taisan11/vite-plugin-webext'

export default defineConfig({
  plugins: [
    webext({
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

追加エントリは Vite のトップレベル `input` または `build.rolldownOptions.input` に、文字列・配列・名前付きオブジェクトで指定できます。名前付きのユーザー入力は自動収集分を上書きします。両方を指定した場合は `build.rolldownOptions.input` が優先されます。文字列・配列は同名の自動エントリを置き換えず追加されます。パスは Vite の root を基準に解決します。

```ts
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { webext } from '@taisan11/vite-plugin-webext'

export default defineConfig({
  plugins: [webext({ manifest: (browser) => ({ manifest_version: 3, name: browser, version: '1.0.0' }) })],
  build: {
    rolldownOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.html'),
      },
    },
  },
})
```

## 拡張機能 API namespace

拡張機能のソースは、デフォルトで `browser.*` を使って記述します。ビルド時にターゲットへ合わせて namespace を静的変換します。

- Chrome build では `chrome.*` に変換します。
- Firefox build では `browser.*` に変換します。
- ランタイム shim は注入しません。

namespace の変換はデフォルトで有効です。`staticTransform: false` は namespace の変換だけを停止します。API の利用可否チェックと i18n・messaging のヘルパー変換は独立して動作し、ヘルパーは常に対象ブラウザのネイティブ API を使います。旧 `injectGlobals` オプションは廃止しました。

Rolldown 側で `experimental.nativeMagicString: true` が有効な場合、このプラグインは利用可能な `meta.magicString` を自動利用します。利用できない環境では従来どおり JavaScript の `magic-string` にフォールバックします。

## `browser.*` の型を有効化する方法

拡張機能側のプロジェクトに `src/env.d.ts` を作成し、次を追加してください。

```ts
/// <reference types="@taisan11/vite-plugin-webext/types" />
```

これで `browser.*` グローバルと `import.meta.env.BROWSER` / `IS_CHROME` / `IS_FIREFOX` に型が付きます。

## i18n ヘルパー (`t(id)`)

プラグイン設定で i18n 変換を有効化します。

```ts
webext({
  manifest,
  i18n: true,
})
```

`src/locale/[localeName].ts` で `defineLocale(...)` を export すると、メッセージ id が収集されます。

> **TODO:** 現在のロケール解析は静的なオブジェクトリテラルを前提としています。値に変数・関数呼び出し・式を使った場合、それらは実行・評価されず、正しいメッセージ JSON にならないことがあります。将来的に TypeScript AST を使った解析へ置き換える予定です。

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

拡張機能コードでは `t(id)` を使えます。

```ts
import { t } from '@taisan11/vite-plugin-webext/i18n'

const title = t('appTitle')
```

ビルド時に `t('appTitle')` は静的に `browser.i18n.getMessage('appTitle')` へ置換され、`src/locale/*.ts` から id 型も自動導出されます。
（`notificationContent.message` のようなネストキーは id として収集されず、`notificationContent` だけがメッセージ id になります。）

`src/locale/webext-i18n.d.ts` は dev・本番ビルドの両方で生成し、locale の変更時にも更新します。内容が変わらなければファイルを書き直しません。

## messaging ヘルパー (`sendMessage`, `sendMessageToTab`)

`WebextMessageMap` を拡張すると、リクエスト/レスポンスの型を定義できます。

```ts
declare global {
  interface WebextMessageMap {
    getProfile: { request: { userId: string }; response: { name: string } }
  }
}
```

`@taisan11/vite-plugin-webext/messaging` から型付きヘルパーを利用できます。

```ts
import { sendMessage, sendMessageToTab } from '@taisan11/vite-plugin-webext/messaging'

const profile = await sendMessage('getProfile', { userId: '42' })
await sendMessageToTab(1, 'getProfile', { userId: '42' })
```

ビルド時には呼び出しが静的にネイティブ API へ置換されます。

- `sendMessage(type, payload, options?)` → `browser.runtime.sendMessage({ type, payload }, options?)`
- `sendMessageToTab(tabId, type, payload, options?)` → `browser.tabs.sendMessage(tabId, { type, payload }, options?)`

## npm への公開（メンテナー向け）

`v*` タグを push すると `.github/workflows/publish.yml` が実行されます。
タグは `package.json` のバージョンに `v` を付けた値と一致する必要があります。
Bun の frozen lockfile でインストールし、型チェック・テスト・ビルドが
すべて成功した場合に provenance 付きで npm に公開します。

初回のみ、npm の `@taisan11/vite-plugin-webext` の設定で GitHub Actions の
Trusted Publisher を登録してください。

- Owner: `taisan11`
- Repository: `vite-plugin-webext`
- Workflow filename: `publish.yml`
- Environment: 空欄

`NPM_TOKEN` シークレットは不要です。`package.json` を未公開の新バージョンに
更新してコミットした後、そのコミットと一致するタグを push します。

```bash
git tag v<version>
git push origin HEAD
git push origin v<version>
```

## 出力ディレクトリ

ビルド成果物は以下に分離されます。

- `dist/chrome/`
- `dist/firefox/`

Vite の build manifest は常に生成します（既定 `.vite/manifest.json`）。
`build.manifest` の独自ファイル名も使えますが、`manifest.json` は拡張機能用に予約しています。
出力ファイル名は変更せず、スクリプト・リソースは Vite manifest、HTML ページは出力アセットの情報からパスを解決します。

## zip 生成

`--mode chrome-zip` または `--mode firefox-zip` でビルドした場合だけ、次を生成します。

- `dist/<browser>-<version>-source.zip`
- `dist/<browser>-<version>-dist.zip`
- `dist/<browser>-zip.zip`

Chrome の例:

- `dist/chrome-1.2.3-source.zip`
- `dist/chrome-1.2.3-dist.zip`
- `dist/chrome-zip.zip`

ZIP 生成の切り替えは mode のみで行います。`zipArtifacts` オプションは廃止しました。
通常の `--mode chrome` / `--mode firefox` では生成しません。
`build.write: false` または出力ディレクトリが存在しない場合は ZIP を生成しません。
