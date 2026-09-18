# Attack Component

`AttackComponent` holds what every attack has in commong: the timer, whether an attack is allowed to start, and which way the attack is facing. The base class owns *when* an attack happens; a subclass owns *what* happens — a meele hit area that is open for a short window, or anouncing projectile shot. Neither of them knows what it hits; scene is the only place that decides who a hit lands on.

Source:
[AttackComponent.ts](/src/game/components/attack/AttackComponent.ts)
[MeeleAttack.ts](/src/game/components/attack/MeleeAttack.ts)
[RangedAttack.ts](/src/game/components/attack/RangedAttack.ts)

## Subclasses

| Class | Description | Used By |
| --- | --- | --- |
| `MeleeAttack` | Opens a hit rectangle in front of the owner for a short window and remembers who it already hit | Playe, melee foes (e.g. warrior) |
| `RangedAttack | Announces one projectiles at a release moment. Scene spawns it. | Ranged foes (e.g. archer) |

## Lifecycle

`queue()` → `start(facing)` → `update(dt)` every frame → `end()`

1. **`queue()`**: remembers buttons press for `butfferMs` so a press sligthly earl still lands. Only used by button-driven owners (the player). For anything else `bufferMs` is equal to `0`.
2. **`start(facing)`**: begins the attack and locks `facing` until the attack ends, so turning around can't drag the reacr or shot projectile to the other side. *This doesn't check `isReady` - that is the caller's job.
3. **`update(dt)`**: ticks the cooldown and queued press, then advances to run attack. Caleed from owner's `update()`.
4. **`end()`** - stops the attack and starts the cooldown. Does nothing if not attack is running.

The owner decides when the attack ends; usually after animation finishes or after `durationMs` if there's no animation to wait for.

Subclasses hook in through three optional methos and override only the ones they need: `onStart()`, `advanve(dt)`, `onEnd()`.

## Events

`AttackComponent` extends `Phaseer.Events.EventEmitter`. Listen with `attack.on(AttackEvent.X, ...)`.

| Event | Emitted By | Payload | Meaning |
| --- | --- | --- | --- |
| `Started` | Both | - | An attack has begun |
| `Ended` | Both | - | The attack is over, not matter how it ended. Cooldown starts |
| `Hit` | `MeleeAttack` | target | The swing connected to the target it hadn's already connected yet |
| `Shot` | `RangedAttack` | `Shot` | A projectile has left and needs to be put in the world |

## Melee Swing

`MeleeAttack` owns the reach and the bookkeeping that stops one swing from hitting the same target twice. The base class decides *when* it swings.

It has no physics body. The hit area is a plain rectangle that only exists during the active window, so the component never needs to know what a foe is. The scene tests the rectangle against whatever it considers hittable — which is why the player and the warrior can both use this same class.

How swing is resolved:
1. The scene reads `hitArea` — `null` outside the active window.
2. It checks candidates against the rectangle.
3. For each overlap it calls `registerHit(target)`. This returns `true` only the first time a target is hit during the swing, and emits `Hit`.
4. The caller deals damage.

The hit area is repositioned every frame so it stays in front of the owner's body, measured from the body's edge.

`setConfig()` is used to change weapons it gives `MeleeAttack` a new meele attack configuration.

### `MeleeAttackConfig`

| Field | Description |
| --- | --- |
| `windupMs` | Delay from the start of the swing until the hit area opens |
| `activeMs` | How long the hit area stays open |
| `cooldownMs` | Wait after the swing ends before the next one is allowed |
| `bufferMs` | How early a press still counts |
| `width`, `height` | Hit area size in world pixels (not scaled with the sprite) |
| `offsetX` | Distance from the edge of the owner's body, mirrored with facing |
| `offsetY` | Vertical offset from the body's center; negative is higher |

`durationMs` = `windupMs + activeMs`.

## Ranged Attack

`RangedAttack` fires one projectile at the release moment of the draw. The base class decides *when* the attack starts.

It never puts anything in the world itself. It only emits `Shot`, and the scene builds the projectile and decides what it can hit — the same way it decides who a swing lands on:

```ts
foe.rangedAttack?.on(AttackEvent.Shot, (shot: Shot) => this.spawnProjectile(shot))
```

Each attack fires at most one shot. If the attack ends before `windupMs`, the shot is cancelled.

### `RangedAttackConfig`

| Field | Description |
| --- | --- |
| `projectile` | The `ProjectileDefinition` to fire |
| `damage` | Damage the shot carries with it |
| `windupMs` | Delay from the start of the attack until the shot leaves |
| `cooldownMs` | Wait after the attack ends before the next one is allowed |
| `muzzleX` | Horizontal offset from the body's center, mirrored with facing |
| `muzzleY` | Vertical offset from the body's center, not mirrored |

`durationMs` = `windupMs`. After the shot leaves, the rest is recovery, and the caller may end the attack there.

### `Shot` payload

| Field | Description |
| --- | --- |
| `x`, `y` | Spawn position (muzzle) |
| `direction` | `-1` or `1`, the facing locked at `start()` |
| `damage` | Damage the projectile carries |
| `projectile` | Projectile definition |
| `shooter` | The sprite that fired; used for knockback direction |