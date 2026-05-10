import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// IMPORTANT: change `base` to match your GitHub repo name.
// e.g. if your repo is https://github.com/yourname/hemosim-pro,
// then base should be '/hemosim-pro/'.
// For a user/organization site (yourname.github.io), use '/'.
export default defineConfig({
  plugins: [react()],
  base: '/hemosim-pro/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
