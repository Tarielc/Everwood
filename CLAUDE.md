# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Everwood is a browser 2D action platformer: TypeScript + Phaser 4 + Vite, with one Vercel function (`api/`) backed by MongoDB Atlas for the arena leaderboard. Deployed at https://everwood.vercel.app/.

## Commands

```
npm install
npm run dev-nolog        # Vite dev server on http://localhost:8080
npm run build-nolog      # production build into dist/ (terser-minified)
npx tsc --noEmit         # type-check the game (src/)
npm run typecheck:api    # type-check the Vercel function (api/)
```

- `npm run dev` / `npm run build` are the same as the `-nolog` variants but first run `log.js`, which sends an anonymous ping to the Phaser template's telemetry host (`gryzor.co`). Prefer the `-nolog` scripts.
- **Vite does not type-check.** A build can succeed with type errors, so run both `tsc` commands after changes. They are the only automated checks: there is no test suite and no linter.
- The two type-checks are separate on purpose. `src/` uses `moduleResolution: "bundler"`; `api/` has its own `tsconfig.json` (`node16`) because Vercel compiles functions as CommonJS.
- `npm run dev` serves only the game, so the leaderboard shows "Leaderboard unavailable". To run the API locally: `vercel link`, `vercel env pull .env.local`, `vercel dev` (needs `MONGODB_URI`; see `.env.example`). `VITE_LEADERBOARD_URL` points the game at an API on another origin.
- Vercel builds with `npm run build` into `dist/` (`vercel.json`); everything under `api/` becomes a function. `dist/` is gitignored.

## Architecture

The organising rule: **adding content means adding data, not classes.**

### Layers under `src/game/`

- `data/` - typed registries of content: `FOES`, `LEVELS`, `POWER_UPS`, `SOUNDS`/`MUSIC`/`AMBIENCE`, weapons, projectiles, animations, waves. Ids are union types, so a mistyped id is a compile error.
- `config/` - tuning and constants (display scale, UI layout, input bindings, audio buses, game feel, and `MAP`, the Tiled naming conventions in `config/world.ts`).
- `components/` - per-entity behaviour: movement, health, attack (melee/ranged), animation, equipment, status effects.
- `entities/` - `Player`, `Foe`, `Projectile`, `PowerUp`. They hold no logic of their own; they wire components together. **Every foe type is an instance of the single `Foe` class** configured by a `FoeDefinition`.
- `systems/` - scene-level services: `WorldMap`, `CollisionManager`, `WaveDirector`, `InputController`, `AudioController`, `ImpactController`, `PowerUpDropper`, `StateMachine` (+ `PlayerStates`/`FoeStates`).
- `scenes/` - coordinate only. `ui/` - HUD pieces.

### GameScene is the wiring hub

Components and systems never reach for each other; they emit events or take callbacks, and `GameScene` connects them:

- An attack component knows *when* it attacks, never *what* it hits. `MeleeAttack` exposes a hit rectangle; `RangedAttack` only emits `Shot`. The scene and `CollisionManager` decide who is hit and spawn projectiles.
- `WaveDirector` and `PowerUpDropper` spawn nothing themselves. They are handed `GameScene.spawnFoe()` / `spawnPowerUp()`, so wave foes get identical wiring to hand-placed ones.
- Per-frame order in `GameScene.update()` matters: hitstop check (skips the whole frame) -> input sampled once -> player -> foes -> projectiles -> power-ups -> collisions last.

### A level change is a scene restart

`GameScene` restarts itself with `{ level }`. Consequences:

- The same scene instance is reused, so `init()` must reset every field held between frames. New state on the scene needs a reset there.
- Only `Progress` (health + weapon) survives, via the Phaser registry. Power-up effects do not carry over.
- `HealthBar` runs as a separate parallel scene that is *not* torn down by a level change. It hears the player's health over the global `EventBus`.
- `AudioController` is a game-level singleton (`AudioController.instance`, created in `BootScene`) precisely so a restart cannot cut a track. All sound goes through it; nothing else sets a volume. Music and ambience are fetched and decoded on demand, not preloaded.

### Levels come from Tiled

`WorldMap` builds a level from a Tiled JSON export in `public/assets/map/`. Spawn points, exits, checkpoints, hazards, foes, wave spawn markers, hints and dialogue are all objects in the map, matched by the names in `MAP` (`config/world.ts`). Object layer names must match `MAP.objectLayers` exactly. Tileset and backdrop images are queued by reading the map JSON, never listed by hand. `LEVELS` (`data/levels.ts`) adds only what the map cannot say: music, waves, gravity, `deathReturnsTo`, `foesAlwaysHunt`, `winWhenCleared`.

### Sprites are one atlas

Every character, foe, weapon, projectile, pickup and HUD image is a frame in `public/assets/atlas/sprites.png` / `sprites.json`. Animations reference atlas frame-name prefixes (`data/animations.ts`). No atlas-packing script lives in this repo, so new art has to be packed into the atlas externally. Each animation needs a unique `key`; a reused key is silently skipped at registration.

### Responsive sizing

The game uses `Scale.NONE` and sizes itself through `fitToParent()` (`utils/viewport.ts`), keeping view height within 704-736 game pixels. Position anything screen-relative from the live size inside an `onResize()` callback, not from the 1280x720 in the game config. Use `safeArea()` for HUD edges and `hudScale()` for HUD sizes.

### Leaderboard: code shared between game and server

`api/arena/leaderboard.ts` imports `src/game/data/leaderboard.ts`, which imports `data/waves.ts`. **Those two files must stay free of Phaser and DOM imports**, since they run on the server. The API validates a submitted run's kill count against `foesInWave(ARENA_WAVES, …)`, so changing `ARENA_WAVES` changes which scores are accepted; the game and API deploy together as one Vercel project. The profanity filter (`api/_lib/profanity.ts`) is server-only by design.

## Docs

`docs/` has one page per system, linked from the README, each with an "Adding a new X" recipe. Read the relevant page before changing a system, and update it when behaviour changes. Some pages lag the code; where they disagree, the code is right. Known drift:

- Links to `src/game/utils/constants.ts` are dead. `MAP` is in `config/world.ts`, `LEVELS` in `data/levels.ts`.
- `LevelId` is a hand-written union, not derived from `LEVELS`. A new level needs both.
- References to per-foe spritesheets under `public/assets/sprites/` predate the atlas.
- `docs/wave-director.md` says dying in the arena returns to `everwood`; the arena's `deathReturnsTo` is `arena`.

## Conventions

- 4-space indent. Game code under `src/game/` mostly omits semicolons.
- Heavily commented: JSDoc on exported types, fields and methods, and inline comments that explain *why*. Match that density when adding code.
- Failures in content (unknown foe on a map, missing animation, missing sound file) warn and continue rather than throw.
