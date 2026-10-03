import { arenaScores } from "../_lib/mongo"
import { isObscene } from "../_lib/profanity"
import { LEADERBOARD_SIZE, LeaderboardEntry, checkArenaScore } from "../../src/game/data/leaderboard"

/*
 * The arena leaderboard - GET for the top of the board, POST to put a run on it.
 * Runs are ranked by wave reached, then by kills, then by who got there first.
 */

/** Anything bigger than this isn't a score */
const MAX_BODY_BYTES = 1024

/** The board changes on every submit, and a player checking for their own run wants the live one */
const NO_STORE = { "Cache-Control": "no-store" }

function json(body: unknown, status = 200): Response {
    return Response.json(body, { status, headers: NO_STORE })
}

/** The top of the board, best first */
export async function GET(): Promise<Response> {
    try {
        const scores = await arenaScores()
        const entries: LeaderboardEntry[] = await scores
            .find({}, { projection: { _id: 0, name: 1, wave: 1, kills: 1 } })
            .sort({ wave: -1, kills: -1, createdAt: 1 })
            .limit(LEADERBOARD_SIZE)
            .toArray()

        return json({ entries })
    } catch (error) {
        console.error("leaderboard GET failed", error)
        return json({ error: "Leaderboard unavailable" }, 500)
    }
}

/** Put a finished run on the board, and say where it landed */
export async function POST(request: Request): Promise<Response> {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return json({ error: "Score too large" }, 413)

    let body: unknown
    try {
        body = JSON.parse(text)
    } catch {
        return json({ error: "Malformed score" }, 400)
    }

    const check = checkArenaScore(body)
    if (!check.ok) return json({ error: check.error }, 400)

    const { score } = check
    if (isObscene(score.name)) return json({ error: "Pick another name" }, 400)

    try {
        const scores = await arenaScores()
        await scores.insertOne({ ...score, createdAt: new Date() })

        // everything strictly better, plus one - a run that ties an earlier one shares its place
        const better = await scores.countDocuments({
            $or: [
                { wave: { $gt: score.wave } },
                { wave: score.wave, kills: { $gt: score.kills } },
            ],
        })

        return json({ rank: better + 1 }, 201)
    } catch (error) {
        console.error("leaderboard POST failed", error)
        return json({ error: "Leaderboard unavailable" }, 500)
    }
}
