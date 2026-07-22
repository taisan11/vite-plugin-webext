---
layout: home

hero:
  name: vite-plugin-webext
  text: ViteでWebExtensionをビルド
  tagline: Chrome / Firefox向けのmanifest生成、複数エントリ、content script注入をまとめて扱うViteプラグイン
  actions:
    - theme: brand
      text: はじめる
      link: /ja/guide
    - theme: alt
      text: APIを見る
      link: /ja/api

features:
  - title: ブラウザ別ビルド
    details: --mode chrome / --mode firefox で出力先とAPIチェックを切り替えます。
  - title: manifestから自動入力
    details: background、popup、options、content scriptなどのエントリを自動収集します。
  - title: 未列挙スクリプト
    details: unlistedScriptsとinjectScriptでページのmain worldへスクリプトを注入できます。
---

## 30秒で試す

空のディレクトリで実行します。

```bash
bunx @taisan11/vite-plugin-webext init .
bun install
bun run dev
```

開発ビルドは `dist/chrome/` に出力されます。Firefox向けは `bun run dev:firefox` を使ってください。
