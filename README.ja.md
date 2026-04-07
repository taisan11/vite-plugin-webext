# vite-plugin-webext

`@taisan11/vite-plugin-webext` は、WebExtension をクロスブラウザ（Chrome / Firefox）でビルドするための Vite プラグインです。

主な機能:

- `--mode` (`chrome` / `firefox`) でターゲットブラウザを切り替え
- `--mode` が未指定でもデフォルトターゲットブラウザを設定可能
- `vite.config.ts` で定義した manifest の生成
- MagicString による完全静的変換（`chrome` 出力は `chrome.*`、`firefox` 出力は `browser.*`）
- messaging ヘルパーの型安全 API と静的置換（`runtime.sendMessage` / `tabs.sendMessage`）
- ブラウザごとの出力ディレクトリ分離
- `@zip.js/zip.js` を使った zip 生成

## インストール

```bash
bun add @taisan11/vite-plugin-webext
```

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

`webext({ defaultBrowser })` や `webext({ browser })` を併用しても、`--mode` が優先されます。

## `--mode` 未指定時のデフォルトブラウザ

`--mode` が `chrome` / `firefox` 以外の場合に使うデフォルトを指定できます。

```ts
webext({
  defaultBrowser: 'chrome',
})
```

`browser` は後方互換のため、`defaultBrowser` のエイリアスとして引き続き利用できます。

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

`manifest` は以下を受け付けます。

- `WebExtensionManifest`
- `(browser) => WebExtensionManifest`

## `build.rolldownOptions.input` の設定例

拡張機能で複数エントリを使う場合は `build.rolldownOptions.input` を指定します。

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

## 静的変換ポリシー

拡張機能のコードは `browser.*` で統一して記述します。

ビルド時に MagicString で完全静的変換を行います。

- `vite build --mode chrome` では `browser.*` / `chrome.*` を `chrome.*` へ統一
- `vite build --mode firefox` では `browser.*` / `chrome.*` を `browser.*` へ統一

ランタイム shim は注入しません。

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
  i18n: true,
})
```

`src/locale/[localeName].ts` で `defineLocale(...)` を export すると、メッセージ id が収集されます。

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

## 出力ディレクトリ

ビルド成果物は以下に分離されます。

- `dist/chrome/`
- `dist/firefox/`

## zip 生成

`--mode` でビルドすると次を生成します。

- `dist/<browser>-<version>-source.zip`
- `dist/<browser>-<version>-dist.zip`
- `dist/<browser>-zip.zip`

Chrome の例:

- `dist/chrome-1.2.3-source.zip`
- `dist/chrome-1.2.3-dist.zip`
- `dist/chrome-zip.zip`

`zipArtifacts: false` を指定すると zip 生成を無効化できます。

ブラウザ別の出力ディレクトリが存在しない場合（例: `build.write: false`）は、dist zip 生成を警告付きでスキップし、ビルドを失敗させません。
