# Arena Leaderboard

A global leaderboard for the arena's endless waves. A run is ranked by the **wave it ended on**, then by **kills**, then by **who got there first**. Players sign a run with a free-text name from the death screen.

[API: api/arena/leaderboard.ts](/api/arena/leaderboard.ts)
[Rules: leaderboard.ts](/src/game/data/leaderboard.ts)
[Screen: LeaderboardScene.ts](/src/game/scenes/LeaderboardScene.ts)

## How It Fits Together

```
GameScene ──death──▶ EndScene ──"Leaderboard"──▶ LeaderboardScene ──fetch──▶ /api/arena/leaderboard ──▶ MongoDB
```

- `WaveDirector` counts `kills` - wave foes that died while the run was on. Summons and hand-placed foes aren't counted.
- `GameScene.onPlayerDeath()` takes `{ wave, kills }` the moment the player falls, before the run is stopped, and only on `RANKED_LEVEL` once the first wave has landed.
- `EndScene` sums the run up under the headline and adds a **Leaderboard** option between retry and the main menu.
- `LeaderboardScene` shows the top ten and a name box. Once submitted, the run's `rank` and `name` are set on the run object itself, so going back and in again doesn't offer a second submit. The row the run landed on is highlighted.
- **Back** reopens the end screen exactly as it was.

## The Name Box

Phaser has no text input, and a canvas can't raise a phone's keyboard, so `NameEntry` is a real HTML `<form>` laid over a gap the scene leaves for it. It's positioned in viewport pixels off the canvas's bounding box and `scale.displayScale`, and re-placed on every resize.

Two details worth knowing:

- **Fullscreen** moves the canvas into a wrapper `<div>` Phaser creates, so the form re-parents itself into `canvas.parentElement` on every layout - otherwise it'd be left outside the fullscreen element.
- **Keys**: Phaser listens on `window` and swallows keys the game binds (space, WASD, arrows). The form stops `keydown`/`keyup` propagating, so those can be typed, and Enter submits the form rather than leaving the scene.

The last name used is remembered in `localStorage`.

## The API

One Vercel function, `api/arena/leaderboard.ts`, using web-standard `GET`/`POST` handlers.

| Request | Response |
| --- | --- |
| `GET /api/arena/leaderboard` | `200 { entries: [{ name, wave, kills }] }` - top `LEADERBOARD_SIZE`, best first |
| `POST /api/arena/leaderboard` with `{ name, wave, kills }` | `201 { rank }` - ties share a rank |
| Anything that fails a check | `400 { error }` - a message the game shows as-is |
| Database down or misconfigured | `500 { error: "Leaderboard unavailable" }` |

Scores live in the `arenaScores` collection as `{ name, wave, kills, createdAt }`, with a `ranking` index on `{ wave: -1, kills: -1, createdAt: 1 }` created on first use. The Mongo client is cached per warm function instance (`api/_lib/mongo.ts`) so requests reuse a pool rather than opening a connection each.

`api/` has its own `tsconfig.json`: Vercel compiles functions as CommonJS, which the root config's `moduleResolution: "bundler"` refuses. Check it with `npm run typecheck:api`.

## Sanity Checks

`checkArenaScore()` in `src/game/data/leaderboard.ts` is shared - the game uses its name rules before sending, and the API imports the same file to check what arrives. It has no Phaser in it, and neither does `waves.ts`, which it reads.

- **Name**: trimmed and whitespace-folded, 1-16 characters, letters and digits in any script plus space `.` `_` `'` `-`, starting with a letter or digit.
- **Wave**: an integer from 1 to `MAX_RANKED_WAVE`.
- **Kills**: must fall in `killRange(wave)`. A wave only begins once the one before is cleared, so a run that ended on wave *N* killed every foe of waves 1..*N*-1, plus anywhere from none to all of wave *N*. The counts come from `foesInWave(ARENA_WAVES, w)` - the same `countFor` the `WaveDirector` plans waves with - so the check can't drift from the game.

This turns away anything the game couldn't have produced. It doesn't stop someone posting a plausible made-up run with `curl`; that would need server-side verification of the run itself. There's no rate limiting or profanity filter either.

> Changing `ARENA_WAVES` changes what counts as a possible run. Deploy the game and the API together - they're one Vercel project, so a normal deploy does that.

## Setup

1. **MongoDB**: create a cluster (Atlas M0 is free) and a database user. Under Network Access, allow `0.0.0.0/0` - Vercel functions don't come from fixed IPs.
2. **Vercel**: import the repo. `vercel.json` sets the build to `npm run build` into `dist/`, and everything in `api/` becomes a function.
3. **Environment variables** (Project → Settings → Environment Variables): `MONGODB_URI`, and optionally `MONGODB_DB` (defaults to `everwood`). See `.env.example`.

### Local Development

`npm run dev` serves only the game - there's no `/api` on Vite's server, so the board says "Leaderboard unavailable". To run both:

```
npm i -g vercel
vercel link
vercel env pull .env.local
vercel dev
```

To point the game at an API somewhere else, set `VITE_LEADERBOARD_URL` at build time.
