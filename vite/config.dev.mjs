import { defineConfig } from 'vite';

// link previews (the og: tags in index.html) need absolute URLs. Vercel names the
// production domain at build time; set VITE_SITE_URL yourself to point somewhere else.
// Empty everywhere else, which leaves the tags relative
process.env.VITE_SITE_URL ??= process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : '';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
    },
    server: {
        port: 8080
    }
});
