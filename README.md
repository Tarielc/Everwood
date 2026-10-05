# Everwood

![Fighting a wave in the arena](/public/screenshot-arena.png)

A 2D action platformer that runs in the browser. Battle enemies, challenge a boss, or test your skills against endless enemy waves and fight your way up the global leaderboard. How long can you last?

**[Play it now](https://everwood.vercel.app/)** - on desktop or on a phone, nothing to install.

**Tech stack:** TypeScript, Phaser 4, Vite, MongoDB Atlas and Vercel.

| | |
| --- | --- |
| ![The opening level](/public/screenshot-intro.png) | ![The boss fight](/public/screenshot-boss-fight.png) |

## Features

- **Two ways to play** - a story path through the wood and the nether, with a final boss fight, or an arena of endless, escalating waves.
- **Global leaderboard** - arena runs are ranked by wave and kills, stored in MongoDB Atlas behind a Vercel function. The same validation code runs in the game and on the server.
- **Combat that lands** - melee swings with wind-up and active frames, knockback, stuns, hitstop and screen shake scaled to how hard a hit was.
- **Varied foes** - warriors, archers, fliers that steer around walls, self-destructing skulls and a boss that summons help, all defined as data rather than subclasses.
- **Power-ups** - timed damage, speed and regeneration boosts dropped by foes.
- **Plays on a phone** - on-screen touch controls, layouts that follow the screen size and orientation, and respect for notches and rounded corners.
- **A real audio mixer** - separate volume buses, crossfaded music playlists, positional sound effects and music that dips under important sounds.
- **Levels built in Tiled** - spawn points, checkpoints, hazards, exits, hints and dialogue are all placed in the map editor, not in code.

## Controls

| Action | Keyboard | Touch screen |
| --- | --- | --- |
| Move | A / D or Left / Right arrows | Left and right buttons |
| Sprint | Hold Shift, or double-tap a direction | Double-tap a direction button |
| Jump | W, Up arrow or Space (hold for a higher jump) | Jump button |
| Attack | F or J | Attack button |
| Swap weapon | 1 (sword), 0 (bare hands) | Not supported |

Release and press jump again in midair for a second jump. Hold either jump for more height. Landing restores both jumps.

## Run Locally

To play the game, clone the repository, install the dependencies and start the dev server:

```
git clone https://github.com/Tarielc/Everwood.git
cd Everwood
npm install
npm run dev
```

The game opens on `http://localhost:8080`.

This doesn't serve the leaderboard, which runs as a Vercel function backed by MongoDB Atlas. To run it too, add your connection string as `MONGODB_URI` in your Vercel project's environment variables (see [.env.example](/.env.example)), then:

```
npm install -g vercel
vercel login
vercel link
vercel env pull .env.local
vercel dev
```

## How It's Built

The game is organised such that adding content meand adding data, not classes:

- **Entities are assembled from components** - `Player` and `Foe` wire together movement, health, attack, animation and status-effect components rather than holding the logic themselves.
- **Behaviour lives in state machines** - one per player and per foe (idle, patrol, chase, attack, hurt, dead).
- **Content is typed data** - foes, weapons, power-ups, levels, waves and sounds are registries in `src/game/data/`, checked at compile time, so a mistyped id is a build error rather than a blank sprite.
- **Scenes only coordinate** - collisions, waves, audio, input and the world map are separate systems in `src/game/systems/`.

## Documentation

Each system has its own page:

- [Responsive Design](/docs/responsive-design.md)
- [World Map](/docs/world-map.md)
- [Collision Manager](/docs/collision-manager.md)
- [Input System](/docs/input-system.md)
- [State Machine](/docs/state-machine.md)
- [Animation Controller](/docs/animation-controller.md)
- [Attack Component](/docs/attack-component.md)
- [Movement Controller](/docs/movement-controller.md)
- [Player](/docs/player.md)
- [Foe](/docs/foe.md)
- [Power-Ups](/docs/power-ups.md)
- [Wave Director](/docs/wave-director.md)
- [Audio Controller](/docs/audio-controller.md)
- [Arena Leaderboard](/docs/leaderboard.md)

## License

The source code is under the [MIT license](/LICENSE). The art, music, sound effects and fonts are third-party assets under their own licenses - see [CREDITS.md](/CREDITS.md).
