---
layout: home

hero:
  name: vite-plugin-webext
  text: Build WebExtensions with Vite
  tagline: A Vite plugin for Chrome and Firefox manifests, multiple entries, and content-script injection
  actions:
    - theme: brand
      text: Get started
      link: /guide
    - theme: alt
      text: API reference
      link: /api

features:
  - title: Browser-specific builds
    details: Use --mode chrome or --mode firefox to select the output directory and API checks.
  - title: Manifest-driven entries
    details: Background, popup, options, and content-script entries are collected automatically.
  - title: Unlisted scripts
    details: Use unlistedScripts and injectScript to inject code into a page's main world.
---

## Try it in 30 seconds

Run this in an empty directory:

```bash
bunx @taisan11/vite-plugin-webext init .
bun install
bun run dev
```

Development builds are written to `dist/chrome/`. Use `bun run dev:firefox` for Firefox.
