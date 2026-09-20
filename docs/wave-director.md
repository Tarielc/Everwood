# Wave Director

`WaveDirector` runs endless escalating foe waves for a level. It plans each wave from config rather than from the map, deals the foes out across the map's spawn markers, counts them down as they die, and sends in the next - larger and tougher - wave once the floor is clear.

[Source: WaveDirector.ts](/src/game/systems/waves/WaveDirector.ts)
[Config: waves.ts](/src/game/data/waves.ts)

## Which Levels Fight Waves

A level fights waves when two things line up:

- its entry in `LEVELS` carries a `waves` config
- its map has at least one `FoeSpawnPoint` on the enemies object layer

`GameScene.startWaves()` checks both and warns rather than throwing if a level asks for waves with nowhere to put them. Every other level is untouched - it still spawns the foes its map places by hand, through `spawnMapFoes()`.

The spawn marker is matched on either the object's **type** or its **name** (`MAP.foeSpawnPoint`), so it can be authored in Tiled as a class of its own or dropped in as a named object on the ordinary `Foe` type. `spawnMapFoes()` skips those markers, so a wave door is never mistaken for a foe standing on the spot.

## How a Wave Gets Harder

Each wave is planned from `WaveConfig`, and gets harder in two independent ways.

**More of them.** Every `WaveFoeRule` in the roster names a foe, the wave it first turns up in, how many arrive then, and how much the count grows per wave after. The total is floored and clamped to `maxCount`, so `countPerWave: 0.35` means one more warrior every third wave, and no arena ever fills up past its ceiling.

**Tougher ones.** `healthGrowth` and `damageGrowth` are fractions added per wave, capped at `statCeiling`. A scaled foe is a copy of its `FOES` entry with only its max health, contact damage and attack damage moved - same sheet, same reach, same pace. Wave one is the definition itself, uncopied.

With the arena's numbers that lands at 2 foes on wave 1, 5 by wave 3, 15 by wave 10, and a count ceiling of 16 - past which the run keeps climbing on stats alone.

## The Run

- `start()` opens the run; the first wave lands after `openingDelayMs`
- foes of a wave arrive `spawnIntervalMs` apart, dealt round the spawn points in turn off a shuffled plan, so neither the arrival order nor the side they come from repeats
- a foe is counted out on its `Died` event rather than when the corpse finishes fading, so the breather starts the moment the last one goes down
- `breakMs` later, the next wave begins

The director makes no foes itself. The scene hands it a `SpawnFoe` callback, which is the same `GameScene.spawnFoe()` a hand-placed foe goes through - so a wave foe gets the same collisions, the same target and the same projectile wiring as any other.

## Events

`WaveDirector` is an `EventEmitter`. `GameScene` listens and drives the announcement banner; anything else that wants to follow a run can listen too, without polling it.

- `WaveEvent.Started` - handed the wave number (counting from 1) and how many foes are in it
- `WaveEvent.Cleared` - handed the number of the wave just cleared

## Nowhere to Hide

`LevelDefinition.foesAlwaysHunt` gives every foe in the level an unbounded `aggroRange` and `deAggroRange`, applied in `GameScene.spawnFoe()` - so it covers wave foes and hand-placed ones alike. The arena sets it.

Both ranges have to go: the wider `deAggroRange` is what the `Chase` state re-checks every frame, so lifting only `aggroRange` would have a foe acquire the player from across the map and drop the chase again on the very next frame, forever. `canSee()` treats an infinite range as "always", vertical reach included, so a jump doesn't break line of sight either.

Attack ranges are untouched and still vertically gated - a foe hunts you from anywhere, but can only hit what it could always hit.

## Dying in a Wave Level

An arena has no exit of its own; the way out is dying. `LevelDefinition.deathReturnsTo` names where that puts the player - the arena names `everwood`.

On the player's death `GameScene.onPlayerDeath()` stops the run so nothing else arrives, waits out `RESPAWN_DELAY_MS`, then travels to that level with full health, gear intact. A level without `deathReturnsTo` is unchanged: the player gets back up where they fell.

## Adding Waves to a Level

1. In Tiled, drop one or more objects named (or typed) `FoeSpawnPoint` on the enemies object layer, standing on the floor
2. Add a `WaveConfig` to `data/waves.ts`
3. Point the level's `LEVELS` entry at it, and give it a `deathReturnsTo` if it is a level you can only be thrown out of

## Ownership and Cleanup

The constructor registers a one-time `SHUTDOWN` listener, so a level change takes the run with it. `stop()` cancels every timer in flight and empties the count; foes already on the floor are left alone - they belong to the scene.
