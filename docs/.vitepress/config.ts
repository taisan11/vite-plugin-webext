import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'en',
  title: 'vite-plugin-webext',
  description: 'Build Chrome and Firefox WebExtensions with Vite',
  locales: {
    root: { label: 'English', lang: 'en' },
    ja: { label: '日本語', lang: 'ja', link: '/ja/' },
  },
  themeConfig: {
    locales: {
      root: {
        label: 'English',
        selectText: 'Languages',
        nav: [
          { text: 'Guide', link: '/guide' },
          { text: 'API', link: '/api' },
          { text: 'GitHub', link: 'https://github.com/taisan11/vite-plugin-webext' },
        ],
        sidebar: [
          {
            text: 'Documentation',
            items: [
              { text: 'Getting started', link: '/guide' },
              { text: 'API', link: '/api' },
            ],
          },
        ],
      },
      ja: {
        label: '日本語',
        selectText: '言語',
        nav: [
          { text: 'ガイド', link: '/ja/guide' },
          { text: 'API', link: '/ja/api' },
          { text: 'GitHub', link: 'https://github.com/taisan11/vite-plugin-webext' },
        ],
        sidebar: [
          {
            text: 'ドキュメント',
            items: [
              { text: 'はじめに', link: '/ja/guide' },
              { text: 'API', link: '/ja/api' },
            ],
          },
        ],
      },
    },
    outline: 'deep',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/taisan11/vite-plugin-webext' },
    ],
  },
})
