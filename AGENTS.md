# Repository Guidelines

## Project Structure & Module Organization

Everwood is a browser action platformer built with TypeScript, Phaser 4, and Vite, with a MongoDB-backed Vercel leaderboard API.

- `src/main.ts` boots the game. `src/game/` separates scenes, entities, components, systems, UI, typed content registries (`data/`), and tuning constants (`config/`).
- `api/arena/leaderboard.ts` handles scores; `api/_lib/` contains database and profanity helpers.
- `public/assets/` contains the sprite atlas, Tiled maps, audio, and other assets. `docs/` explains individual systems; `vite/` holds build configuration. Generated output goes to ignored `dist/`.

Add content through typed registries and compose entity behavior from components. Keep scenes focused on coordination. Shared `data/leaderboard.ts` and `data/waves.ts` must remain free of Phaser and DOM imports because the API uses them.

Player jump availability and physics belong in `MovementController`; animation and sound feedback belong in `PlayerStates`. Movement updates before states, which read `jumpedThisFrame` for actual jump events. Preserve the normal ground/coyote jump plus one midair jump, landing reset, and attack/hurt animation locks; see `docs/movement-controller.md` and `docs/player.md`.

## Build, Test, and Development Commands

- `npm install` — install dependencies.
- `npm run dev-nolog` — serve the game at `http://localhost:8080`.
- `npm run build-nolog` — create the production bundle in `dist/`.
- `npx tsc --noEmit` — type-check game code.
- `npm run typecheck:api` — type-check server code separately.
- `vercel dev` — run the game with its leaderboard API after Vercel setup and local environment configuration.

Prefer the `-nolog` scripts; `dev` and `build` additionally invoke template telemetry. Vite builds do not perform type checking.

## Coding Style & Naming Conventions

Use four-space indentation and strict TypeScript. Match surrounding quote and semicolon styles; most game logic omits semicolons. Use PascalCase for classes and their files (`WaveDirector.ts`), camelCase for functions and fields, and uppercase names for registry constants (`ARENA_WAVES`). Explain exported APIs with JSDoc and non-obvious decisions with comments. No formatter or linter is configured.

## Testing Guidelines

There is no automated test suite, test naming convention, or coverage threshold. Run both type checks and the production build for code changes. Manually exercise affected gameplay, scene transitions, and desktop/touch layouts; validate leaderboard changes through `vercel dev`.

For movement changes, verify both jumps, third-jump rejection, ledge/coyote behavior, landing reset, held input, buffering/jump cuts, and jump feedback during attacks on keyboard and touch.

## Commit & Pull Request Guidelines

History uses short imperative subjects, such as `Add name filtering for leaderboard`; follow that style. Keep commits focused. PRs should describe behavior changes, list validation performed, link relevant issues, and include screenshots or recordings for visual changes. Update affected system documentation.

## Configuration & Assets

Use `.env.example` to configure `.env.local`; never commit MongoDB credentials. Record third-party asset attribution in `CREDITS.md` and applicable licenses in `licenses/`.
