# はじめに

## インストール

対応する Vite は `^8.3.4` です。既存プロジェクトへ追加する場合:

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

`manifest` は必須です。`WebExtensionManifest` オブジェクト、またはブラウザ名を受け取るファクトリを指定します。

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

出力先はそれぞれ `dist/chrome/`、`dist/firefox/` です。`--mode` が `chrome` / `firefox` 以外の場合は `defaultBrowser`が使われます。

拡張機能のソースはデフォルトで `browser.*` を使って記述します。プラグインがビルド時に Chrome では `chrome.*` へ、Firefox では `browser.*` へ静的変換します。ランタイム shim は注入しません。無効化する場合は `staticTransform: false` を指定してください。

## エントリの自動収集

manifestから次の入力を自動収集します。

- background service worker / MV2 background scripts
- action、browser action、page action の popup
- options、devtools、side panel、sidebar
- Chrome URL override、sandbox page
- `content_scripts[].js`

追加エントリはトップレベル `input` または `build.rolldownOptions.input` に、文字列・配列・名前付きオブジェクトで指定できます。名前付きユーザー入力は自動収集分を上書きし、低レベル入力はトップレベル入力より優先されます。文字列・配列は自動エントリを置き換えず追加します。

Vite の build manifest は常に生成し、出力ファイル名は変更しません。拡張機能 manifest の参照先を Vite の出力情報から解決します。content script・未列挙スクリプトは個別バンドルし、HTML 側の code splitting は維持します。

## 開発ビルド

生成プロジェクトの `dev` は `vite` を起動し、設定した `defaultBrowser` を使います。`webext({ manifest })` がある場合、開発サーバーと同時に watch ビルドを起動し、初回ビルド完了を待ちます。変更時は `dist/chrome/` / `dist/firefox/` に拡張機能を書き出します。`build.outDir` の変更にも対応し、サーバー終了時にはビルド監視も停止します。

`vite --mode chrome` / `vite --mode firefox` の直接実行も可能です。出力先を unpacked / 一時的な拡張機能としてブラウザに読み込み、変更後は拡張機能と content script の対象タブを再読み込みしてください。拡張機能の自動リロードやインストール済み拡張機能内での HMR は提供しません。Vite から直接配信した HTML では通常の HMR が使えますが、拡張機能 API は使えません。従来の `vite build --watch` も利用できます。

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

通常の `chrome` / `firefox` build では ZIP は生成しません。切り替えは mode のみで行い、`zipArtifacts` オプションは廃止しました。`build.write: false` の場合も ZIP を生成しません。
