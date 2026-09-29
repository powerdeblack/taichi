import { defineConfig } from 'vite';

// GitHub Pages serves this repo from /<repo-name>/, not the domain root, so
// asset URLs need that prefix baked in. The Pages workflow passes the repo's
// current name (GH_PAGES_BASE), so renaming the repository just works.
// Vercel (and local dev) serve from root.
export default defineConfig({
  base: process.env.GH_PAGES_BASE || (process.env.GH_PAGES ? '/taichi/' : '/'),
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
