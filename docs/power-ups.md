# Power Ups

Every blow the player lands on a foe has a small chance of dropping a power up. It hops out of the foe, lands, and bobs on the floor until it's walked over or runs out of time. Picking one up puts a timed effect on the player - more damage, more speed, or fast regeneration.

[Config: powerUps.ts](/src/game/data/powerUps.ts)
[Source: StatusEffectComponent.ts](/src/game/components/StatusEffectComponent.ts)
[Source: PowerUp.ts](/src/game/entities/PowerUp.ts)
[Source: PowerUpDropper.ts](/src/game/systems/loot/PowerUpDropper.ts)
[Source: PowerUpTray.ts](/src/game/ui/PowerUpTray.ts)

## The Pieces

Each part does one job and knows nothing about the others. `GameScene` connects them, the same way it does for foes and projectiles.

- **`POWER_UPS`** - the data. Each entry has a texture, a duration, a drop weight, and a list of stat modifiers. Adding an entry is enough for it to drop and get loaded.
- **`PowerUpDropper`** - decides *whether* and *what*. It rolls once per landed hit against `POWER_UP_DROP.chance`, picks a power up weighted by `dropWeight`, and never lets more than `maxAlive` sit on the floor at once. Like `WaveDirector`, it doesn't spawn anything itself - the scene passes it a spawn callback.
- **`PowerUp`** - the pickup lying in the world. It hops, lands, bobs, starts blinking `warnMs` before its `lifetimeMs` runs out, and pops when collected.
- **`CollisionManager.addPickup()`** - makes pickups land on the level and runs the collect callback once, when a living player overlaps one.
- **`StatusEffectComponent`** - the timed effects on the player. It owns the timers and the math. It doesn't know what the stats mean.
- **`PowerUpTray`** - the HUD row under the health bar. It shows one icon per running effect, with a bar that drains as time runs out and a blink over the last `warnMs`.

## What Counts as a Hit

Only damage whose `source` is the player rolls for a drop. So a bomber blowing itself up, or anything else that hurts a foe, never drops loot. A swing absorbed by i-frames doesn't fire `Damaged`, so it doesn't roll either.

## Stats and Modifiers

A modifier names a `stat` (`damage`, `speed` or `regen`), an `op`, and a `value`. For each stat, every `add` is summed onto the base first, then the total is multiplied by every `multiply` - so pickup order never changes the result.

Here is how the player uses each stat:

- **damage** - read when the swing lands, through `Player.attackDamage`, which applies the effects on top of the equipped weapon's damage.
- **speed** - pushed into `MovementController.speedMultiplier` on every `Changed` event. It scales walk speed, sprint speed and acceleration. Jumping is left alone, so a boost can't make a platform reachable that wasn't before.
- **regen** - pushed into `HealthComponent.setBonusRegen()`. Unlike the config's own regen, it doesn't wait out the delay after a hit, and it heals with `REGEN_SOURCE`, so it gets no glow or heal outline on each tick.

## Stacking

Picking up a power up that's already running starts its timer over instead of adding a second copy. Two damage boosts make a longer boost, not a bigger one. Different kinds run side by side.

Effects are cleared on death, so a respawn starts clean. They don't carry over to the next level - the player is rebuilt there, and only health and weapon are saved in `Progress`.

## Tuning

Everything is in `data/powerUps.ts`:

| Power up | Effect | Duration |
|---|---|---|
| Damage Up | x1.5 damage | 10s |
| Speed Up | x1.35 speed | 10s |
| Regeneration | +6 hp/s | 8s |

`POWER_UP_DROP` controls the 6% drop chance, the cap of 3 on the floor, the 12s lifetime and the hop.

## Adding a Power Up

1. Put a 16x16 image in `public/assets/sprites/`.
2. Add an entry to `POWER_UPS` with that texture and its modifiers.

A new *stat* also needs its name added to `Stat` in `StatusEffectComponent.ts`, plus whatever reads it on the player.

## Tests

Run `npm run test:run -- src/game/components/StatusEffectComponent.test.ts` for the power-up math tests. They cover additive and multiplicative bonuses, pickup order, stat isolation, current power-up tuning, refresh duration and replacement, and recalculation after expiry, removal or clearing. The tests run in Node using Phaser's underlying event emitter without starting a game.

Run `npm run test:run -- src/game/config/feel.test.ts` for impact scaling. It covers the reference health share, proportional and fractional hits, either sign of health change, both clamp boundaries, and nonpositive maximum health.

## Sound

The pickup plays `power-up-pickup`, which reuses the heal chime's marker for now. To give it a sound of its own, add a marker to the SFX spritemap and point the entry in `SOUNDS` at it.
