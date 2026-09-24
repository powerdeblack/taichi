import { defineConfig } from 'vite';

// GitHub Pages serves this repo from /taichi/, not the domain root, so asset
// URLs need that prefix baked in. Vercel (and local dev) serve from root, so
// the workflow that builds for Pages sets GH_PAGES=true to opt into it.
export default defineConfig({
  base: process.env.GH_PAGES ? '/taichi/' : '/',
  build: {
    rollupOptions: {
      // The Axie Mixer toolkit lazy-loads some of its code (Mystic
      // materials, add-on particles) as separate hashed chunks. Every deploy
      // replaces those files, so a page opened (or cached) before a deploy
      // asked for chunks that no longer existed and no 3D model could load.
      // One bundle means everything the page needs arrives with it.
      output: { inlineDynamicImports: true },
    },
  },
});
