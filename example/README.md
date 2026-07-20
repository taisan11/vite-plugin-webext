# example

A minimal multi-entry WebExtension that uses `@taisan11/vite-plugin-webext`.

It demonstrates:

- manifest generation from `vite.config.ts`
- multi-entry build via `build.rolldownOptions.input` (background, popup, options)
- static `browser.*` namespace rewriting
- typed messaging helpers (`sendMessage`) with `WebextMessageMap`
- browser-separated output (`dist/chrome`, `dist/firefox`)

## Run

From this directory:

```bash
bun install
bun run build:chrome
bun run build:firefox
```

Output is written to `dist/chrome` and `dist/firefox`.

Load the generated folder as an unpacked extension:

- Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `dist/chrome`
- Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → select `dist/firefox/manifest.json`
