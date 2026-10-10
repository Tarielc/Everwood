# Foe

Every foe type in game is an instance of `Foe` class. Everything that differs between foes is set in `FOES` list in [foes.ts](/src/game/data/foes.ts), including how they fight. `Foe` class contains collection of components and is obligated to wire them together.

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
| `MeleeAttack` / `RangedAttack` | Attack timing, cooldown, and hit area or shot. Foes without an attack only have body contact damage | `FoeDefinition.attack` |

## States

A foe patrols in predefined patrol range and if it sees a target (player) chases it. If target moves beyond `deAggroRange` it stops chasing - this is larger than `aggroRange` so a target standing near the edge doesn't make the foe switch between chase and idle every frame.

Sight is horizontal range *and* `verticalReach` - a target far enough above or below is out of sight however close it stands. An **infinite** range is the exception: it skips the geometry outright, reach included, so a foe given one never loses the target to a jump. `LevelDefinition.foesAlwaysHunt` gives every foe in a level exactly that (see [Wave Director](/docs/wave-director.md)); the attack ranges are left finite, so what a foe can *reach* is unchanged.

| State | Behavior |
| --- | --- |
| `Idle` | Pauses at the end of a patrol, or has nothing to do |
| `patrol` | Wanders up to `patrolRange` both sides where spawned `homeX` |
| `Chase` | Runs towards the target once it is within `aggroRange` |
| `Attack` | Stands still while swings or shoots |
| `Hurt` | Flinches and briefly stunned when a hit breaks its poise, if not fatal |
| `Dead` | Stops colliding and fades out |

## Flying Movement

Flying foes chase the target's body center, offset upward by `hoverHeight` when configured. When a solid tile or world bound blocks the chase, they slide along that surface and keep leaning into it until they pass its edge. The detour continues for 250 ms after contact ends so the body has time to clear the obstacle.

If another surface blocks the detour, the foe reverses along the surface only when the opposite direction is open, then keeps that direction for the rest of the detour. If both directions along that axis are blocked, it keeps its current direction. This prevents the Infernal Skull and other flying foes from repeatedly flipping direction against the same obstacle.

## Update Order

`GameScene.update()` calls `Foe.update()`, the order matters:
1. **Health**: ticks i-frames, then poise and flinch immunity.
2. **Attack**: ticks the cooldown.
3. **State machine**: runs the current state's behavior.

## Health

`bindHealth()` subscribes to health events:

- **Damaged**: flash sprite. If not fatal and the hit breaks its poise, knockback enemy and transition to hurt state. A boss mid-attack skips the knockback and flinch entirely, so cuts can't cancel every swing and hold it in a flinch until it dies.
- **Dead**: transition to death state, which calls `collapse()`.

### Poise

Damage and flinching are separate, so spamming attacks can't stunlock a foe:

- `FoeDefinition.poise` is damage a foe shrugs off before a hit flinches it. Hits below it still hurt and flash, but don't knock it back or cancel what it's doing. Left out, every hit flinches.
- Mid-attack, only `ATTACK_POISE_SHARE` of a hit's damage counts - a committed swing is harder to interrupt.
- Poise refills once the foe goes `POISE_RESET_MS` without being hit, or right after it breaks.
- A flinch grants `FLINCH_IMMUNITY_MS` during which no hit can flinch it again - it outlasts the stun, so the foe always gets its turn to fight back.

`collapse()` disables the physics body immediately, so a dying foe can't deal contact damage or hinder the player. If the foe has death animation, it plays first. In the end the foe fades out and destroys itself.

## Combat

A foe has three types of damage:
- **Contact damage**: `contactDamage` is dealt when the player touches the foe. `0` for foes with other attack type. Example: `Fox`.
- **Melee attack**: a swing with `MeleeAttackConfig` - timing, reach, hit area.
- **Ranged attack**: fires a projectile. The foe backs off to `standoff` distance. The ranged attack only fires `Shot` event, the scene spawns projectile and decides what it hits and what it does.

## Facing

Each Foe declares which way its spritesheet art is drawn, so the sprite is only mirrored when needed. The hitbox (physics body) isn't centered in the frame, so it is mirrored alongside sprite in `setFacing()`.

## Adding a New Foe

1. Add spritesheet [public/assets/sprites/foes](/public/assets/sprites/foes). `PreloadScene` loads every spritesheet automatically. As long as it's defined in `FOES` list.
2. Define Foe animations at [animations.ts](/src/game/data/animations.ts).
3. Add an entry to `FOES` at [foes.ts](/src/game/data/foes.ts).
4. Place foe in Tiled: add an object of type/class `Foe` to `MAP.objectLayers.enemies`. Set custom property `foeType` to foe's ID.

No code changes are needed in `GameScene`, because `spawnMapFoes()` spawns every foe on the map, sets colliders and sets its target to player.

## Public API

- `setTarget(target)`: sets who the foe hunts. The scene sets this, because foes can't find a target itself.
- `takeDamage(amount, source?)`: If i-frames or death doesn't swallow it, foe takes damage.
- `walk(direction, speed)`, `turnAround()`, `faceTarget()`: movement, used by the states.
- `beginAttack()` / `endAttack()`: start and end the foe's attack. The state decides when to attack, and AttackComponent decides what happens.
- `collapse()`: foe death sequence.
- Getters for every component.
