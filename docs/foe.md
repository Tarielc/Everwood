# Foe

Every foe type in game is an instance of `Foe` class. Everything that differs between foes are set in `FOES` list in [foes.ts](/src/game/data/foes.ts), including how theyt fight. `Foe` class contains collection of components and is obligated to wire them together.

Source:
[Foe.ts](/src/game/entities/Foe.ts)
[foes.ts](/src/game/data/foes.ts)
[FoeStates.ts](/src/game/systems/state/FoeStates.ts)

## Components

| Component | Responsibility | Config |
| --- | --- | --- |
| `AnimationController` | Plays animations and mirrors the sprite to match facing | `FoeDefinition.anims` |
| `StateMachine` | States and state transitions | `createFoeStates()` |
| `HealthComponent` | Hitpoints, i-frames, regeneration | `FoeDefinition.health` |
| `MeeleAttack` / `RangedAttack` | Attack timing, colldown, and hit area or shot. Foes without an attack only have body contact damage | `FoeDefinition.attack` |

## States

A foe patrols in predefined patrol range and if it sees a taget (player) chases it. If target moves beyong `deAggroRange` it stops chasing - this is larger than `aggroRange` so a target standing near the edge doesn't make the foe switch between chase and idle every frame.

| State | Behavior |
| --- | --- |
| `Idle` | Pauses at the end of a patrol, or has nothing to do |
| `patrol` | Wanders up to `patrolRange` both sides where spawned `homeX` |
| `Chase` | Runs towards the targed once it is within `aggroRange` |
| `Attack` | Stands still while swings or shoots |
| `Hurt` | Flinches and briefly stunned when takes damage, if not fatal |
| `Dead` | Stops colliding and fades out |

## Update Order

`GameScene.update()` calls `Foe.update()`, the order matters:
1. **Health**: ticks i-frames.
2. **Attack**: ticks the cooldown.
3. **State machine**: runs the current state's behavior.

## Health

`bindHealth()` subscribes to health events:

- **Damaged**: flash sprite and knockback enemy. if not fatal, transition to hurt state.
- **Dead**: transition to death state, which calls `collapse()`.

`collapse()` disables the physics body immediately, so a dying foe can't deal contact damage or hinder the player. If the foe has death animation, it plays first. In the end the foe fades out and destroys itself.

## Combat

A foe has three types of damage deal:
- **Contact damage**: `contactDamage` is dealth when the player touches the foe. `0` for foes with other attack type. Example: `Fox`.
- **Meele attack**: a swing with `MeleeAttackConfig` - timing, reach, hitarea.
- **Ranged attack**: fires a projectile. The foe backs off to `standoff` distance. The ranged attack only fires `Shot` event, the scene spawns projectile and decides what it hits and what it does.

## Facing

Each Foe declares which way its spritesheet art is drawn, so the sprite is only mirrored when needed. The hitbox (physics body) isn't centered in the frame, so it is mirrored alongside sprite in `setFacing()`.

## Adding a New Foe

1. Add spritesheet [public/assets/sprites/foes](/public/assets/sprites/foes). `PreloadScene` loads every spritesheet automatically. As long as it's defined in `FOES` list.
2. Define Foe animations at [animations.ts](/src/game/data/animations.ts).
3. Add an entry to `FOES` at [foes.ts](/src/game/data/foes.ts).
4. Place foe in Tiled: add an object of type/class `Foe` to `MAP.objectLayers.enemies`. Set custom propertyt `foeType` to foe's ID.

No code changes are needed in `GameScene`, because `spawnMapFoes()` spawns every foe on the map, sets colliders and sets its target to player.

## Public API

- `setTarget(target)`: sets who the foe hunts. The scene sets this, because foes can't find a target itself.
- `takeDamage(amount, source?)`: If i-frames or death doesn't swallow it, foe takes damage.
- `walk(direction, speed)`, `turnAround()`, `faceTarget()`: movement, used by the states.
- `beginAttack()` / `endAttack()`: start and end the foe's attack. The state decides when to attack, and AttackComponent decides what happens.
- `collapse()`: foe death sequence.
- Getters for every component.