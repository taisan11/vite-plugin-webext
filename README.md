# vite-plugin-webext

`@taisan11/vite-plugin-webext` は、WebExtension をクロスブラウザ（Chrome / Firefox）でビルドするための Vite プラグインです。

主な機能:

- `--mode` (`chrome` / `firefox`) でターゲットブラウザを切り替え
- `--mode` が未指定でもデフォルトターゲットブラウザを設定可能
- `vite.config.ts` で定義した manifest の生成
- MagicString による静的変換（`chrome.*` -> `browser.*`）
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

コード中の `chrome.*` は MagicString により `browser.*` へ静的変換され、変換件数を警告として出力します。

出力コードは `browser.*` に統一されます。

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
