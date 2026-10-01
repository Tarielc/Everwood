/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Where the arena leaderboard API lives - defaults to the Vercel function on the same origin */
    readonly VITE_LEADERBOARD_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
