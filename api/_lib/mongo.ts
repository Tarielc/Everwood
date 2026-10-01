import { Collection, MongoClient } from "mongodb"
import type { ArenaScore } from "../../src/game/data/leaderboard"

/** A run as it sits in the collection */
export interface StoredArenaScore extends ArenaScore {
    /** When it was submitted - breaks a tie in favour of whoever got there first */
    createdAt: Date,
}

/**
 * One client per warm function instance. A serverless function is frozen between
 * requests rather than torn down, so the connection pool is kept on the module and
 * reused - opening a fresh one per request would exhaust Atlas's connection limit
 */
let client: Promise<MongoClient> | null = null

/** The ranking index, created once per instance - createIndex on an existing index is a no-op */
let indexed: Promise<string> | null = null

/**
 * The arena scores collection, connected and indexed
 *
 * @returns The collection, typed as it is stored
 * @throws If `MONGODB_URI` isn't set or the database can't be reached
 */
export async function arenaScores(): Promise<Collection<StoredArenaScore>> {
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error("MONGODB_URI is not set")

    client ??= new MongoClient(uri, { maxPoolSize: 5 })
        .connect()

    let connected: MongoClient
    try {
        connected = await client
    } catch (error) {
        // a failed connect would otherwise be handed to every request this instance serves
        client = null
        throw error
    }

    const collection = connected
        .db(process.env.MONGODB_DB ?? "everwood")
        .collection<StoredArenaScore>("arenaScores")

    // matches the board's sort exactly, so reading the top ten walks the index
    indexed ??= collection.createIndex({ wave: -1, kills: -1, createdAt: 1 }, { name: "ranking" })

    try {
        await indexed
    } catch (error) {
        indexed = null
        throw error
    }

    return collection
}
