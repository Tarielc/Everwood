# Player

`Player` is the player-controller character. It is collection of components and is obliged to wire them together. Components are built based of predefined player configurations in [player.ts](/src/game/data/player.ts).

Source:
[Player.ts](/src/game/entities/Player.ts)
[player.ts](/src/game/data/player.ts)
[PlayerStates.ts](/src/game/systems/state/PlayerStates.ts)

## Components
| Component | Responsibility | Config |
| --- | --- | --- |
| `MovementController` | Walking, Sprinting, Jumping, Gravity | `PLAYER_MOVEMENT` |
| `AnimationController` | Plays animations and mirrors the sprite to match facing | `PLAYER_ANIMS` |
| `StateMachine` | States and state transitions | `createPlayerStates()` |
| `HealthComponent` | Hitpoints, i-frames, regeneration | `PLAYER_HEALTH` |
| `EquipmentComponent` | Held item, drawn as an overlay on the sprite | None |
| `MeeleAttack` | swing timing and hit are | `ITEM.swing` or `PLAYER_UNARMED_ATTACK` |

## Update Order

`GameScene.update()` calls `Player.update()`. The order matters:
1. **Health**: ticks i-frames and regeneration.
2. **Control**: depends on the players condition
    - *Dead*: horizontal acceleration is cleared, so the body still falls but no longer steers.
    - *Stunned* (hurt state): movement runs with empty input, so gravity and drag still apply.
    - *Otherwise*: queue an attack, update facing, start a swing if possinle, and apply movement.
3. **Attack**: ticks the cooldown and moves the hit area along with the player, so hit area during movement is generated in front of a player.
4. **Invulnerability blink** and **state machine** update.
5. **Equipment**: runs last, so the item copies the pose the sprite settled on this frame.

## Health

Health evens are driven by event listeners `bindHealth()`:

- **Damaged**: flashes the sprite and enters `Hurt` state.
- **Died**: enters `Dead` state.
- **Revived**: player respawn fires `Revived` event, after which we enter `Idle` state.
- **Invulnerability End**: safety lock - sprite's opacity is set to `1`.

Health events are also sent to global `EventBus` with `PLAYER_HEALTH_BUS` prefix. HUD for HP bar listens those events and reflects player health on screen.

After a hit player is stunned for `PLAYER_HURT_STUN_MS`. This is kept shorter than `PLAYER_HEALTH.invulnerabilityMs` so player has time to act.

## Combat

An attack press is queued even if player can't act on it. This stores presses near the previous swings, too. During swing facing is locked and player velocityX is slowed by `SWING_FOOT_DRAG`. The swing config is receaved from `ITEM.swing` or falls back to `PLAYER_UNARMED_ATTACK`. Who a swing hits is registered and managed by the scene and collision manager.

*Currently player only has meele attack*.

## Facing

`player.png` is drawn facing left, so moving right mirrors the sprite. Player hitbox (physics body) isn't symetrical, so we also use `appluBodyOffset()` to mirror physics body.

## Public API

- `equip(id)` / `unequip()`: put or remove item from players hand.
- `takeDamage(amount, source?)`: player takes damage if i-frames or death doesn't swallow it.
- `heal(amount, source?)`: heal player - clamped at max health.
- `respawn(x, y, current?)`:  respawn player to specified coordinates with specified health.
- Getter for every component.

## Cleanup

`Player` destroys itself and all of its components when the scene SHUTDOWNs. 
