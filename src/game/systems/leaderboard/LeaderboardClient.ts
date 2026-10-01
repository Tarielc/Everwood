import type { ArenaScore, LeaderboardEntry } from '../../data/leaderboard';

/** The Vercel function in `api/arena/leaderboard.ts`, unless the build points elsewhere */
const ENDPOINT = import.meta.env.VITE_LEADERBOARD_URL ?? "/api/arena/leaderboard"

/** How long a request gets before the board is called unavailable */
const TIMEOUT_MS = 8000

/** Where the last name typed is kept, so the next run is one tap to submit */
const NAME_STORAGE_KEY = "everwood.leaderboard.name"

/**
 * Talks to the arena leaderboard API. Every call resolves or rejects with an `Error` whose
 * message is fit to put on screen - the server's own reason when it gave one.
 */
export const LeaderboardClient = {
    /** The top of the board, best first */
    async top(): Promise<LeaderboardEntry[]> {
        const body = await request<{ entries: LeaderboardEntry[] }>("GET")
        return body.entries
    },

    /**
     * Put a run on the board
     *
     * @param score - The run, name already cleaned
     * @returns The place it landed in, counting from 1
     */
    async submit(score: ArenaScore): Promise<number> {
        const body = await request<{ rank: number }>("POST", score)
        rememberName(score.name)
        return body.rank
    },

    /** The name the last run was signed with on this device, if any */
    lastName(): string {
        try {
            return localStorage.getItem(NAME_STORAGE_KEY) ?? ""
        } catch {
            // private mode, or site data blocked - just start blank
            return ""
        }
    },
}

function rememberName(name: string): void {
    try {
        localStorage.setItem(NAME_STORAGE_KEY, name)
    } catch {
        // not worth failing a submit over
    }
}

async function request<T>(method: "GET" | "POST", body?: unknown): Promise<T> {
    let response: Response
    try {
        response = await fetch(ENDPOINT, {
            method,
            headers: body === undefined
                ? undefined
                : { "Content-Type": "application/json" },
            body: body === undefined
                ? undefined
                : JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })
    } catch {
        throw new Error("Leaderboard unavailable")
    }

    const payload = await response.json().catch(() => null) as ({ error?: string } & T) | null

    if (!response.ok || !payload) throw new Error(payload?.error ?? "Leaderboard unavailable")
    return payload
}
