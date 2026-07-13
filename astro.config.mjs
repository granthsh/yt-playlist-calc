// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  site: 'https://ytplaylistcalc.pro',

  output: 'server',

  adapter: cloudflare(),

  devToolbar: {
    enabled: false
  },

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['@astrojs/cloudflare']
    }
  },

  integrations: [mdx(), sitemap({
    filter: (page) => !page.includes('/404') && !page.includes('/500'),
    changefreq: 'weekly',
    priority: 0.7,
    lastmod: new Date(),
  })]
});