# はじめに

## インストール

既存プロジェクトへ追加する場合:

```bash
bun add @taisan11/vite-plugin-webext
```

新規プロジェクトを作る場合は、空のディレクトリで初期化します。

```bash
bunx @taisan11/vite-plugin-webext init .
```

既存ファイルは上書きされません。生成されたプロジェクトには `dev`、`dev:chrome`、`dev:firefox`、`build:chrome`、`build:firefox` が用意されます。

## 最小設定

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

`manifest` には `WebExtensionManifest` オブジェクト、またはブラウザ名を受け取るファクトリを指定できます。

```ts
webext({
  manifest: (browser) => ({
    manifest_version: 3,
    name: `My Extension (${browser})`,
    version: '1.0.0',
  }),
})
```

## ブラウザ別ビルド

```bash
vite build --mode chrome
vite build --mode firefox
```

出力先はそれぞれ `dist/chrome/`、`dist/firefox/` です。`--mode` が `chrome` / `firefox` 以外の場合は `defaultBrowser`（または後方互換の `browser`）が使われます。

拡張機能のソースはデフォルトで `browser.*` を使って記述します。プラグインがビルド時に Chrome では `chrome.*` へ、Firefox では `browser.*` へ静的変換します。ランタイム shim は注入しません。無効化する場合は `staticTransform: false` を指定してください。

## エントリの自動収集

manifestから次の入力を自動収集します。

- background service worker / MV2 background scripts
- action、browser action、page action の popup
- options、devtools、side panel、sidebar
- Chrome URL override、sandbox page
- `content_scripts[].js`

追加エントリは `build.rolldownOptions.input` に指定できます。自動収集分とマージされ、同じキーではユーザー指定が優先されます。

## 開発ビルド

生成プロジェクトの `dev` は `vite build --watch --mode chrome` です。Viteの開発サーバーではなく、変更のたびに拡張機能の成果物を `dist/chrome/` へ書き出します。

```bash
bun run dev
bun run dev:firefox
```

## ZIP

ZIPは専用modeのときだけ生成されます。

```bash
vite build --mode chrome-zip
vite build --mode firefox-zip
```

生成されるファイル:

- `<browser>-<version>-source.zip`
- `<browser>-<version>-dist.zip`
- `<browser>-zip.zip`

通常の `chrome` / `firefox` buildではZIPは生成されません。`zipArtifacts: false` で `-zip` modeでも無効化できます。
