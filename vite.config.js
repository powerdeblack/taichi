import { defineConfig } from 'vite';

// GitHub Pages serves this repo from /taichi/, not the domain root, so asset
// URLs need that prefix baked in. Vercel (and local dev) serve from root, so
// the workflow that builds for Pages sets GH_PAGES=true to opt into it.
export default defineConfig({
  base: process.env.GH_PAGES ? '/taichi/' : '/',
});
