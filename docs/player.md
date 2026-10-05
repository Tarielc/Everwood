# Player

`Player` is the player-controlled character. It is collection of components and is obliged to wire them together. Components are built based on predefined player configurations in [player.ts](/src/game/data/player.ts).

Source:
[Player.ts](/src/game/entities/Player.ts)
[player.ts](/src/game/data/player.ts)
[PlayerStates.ts](/src/game/systems/state/PlayerStates.ts)

## Components
| Component | Responsibility | Config |
| --- | --- | --- |
| `MovementController` | Walking, Sprinting, Double jumping, Gravity | `PLAYER_MOVEMENT` |
| `AnimationController` | Plays animations and mirrors the sprite to match facing | `PLAYER_ANIMS` |
| `StateMachine` | States and state transitions | `createPlayerStates()` |
| `HealthComponent` | Hitpoints, i-frames, regeneration | `PLAYER_HEALTH` |
| `EquipmentComponent` | Held item, drawn as an overlay on the sprite | None |
| `MeleeAttack` | swing timing and hit area | `ITEM.swing` or `PLAYER_UNARMED_ATTACK` |

## Update Order

`GameScene.update()` calls `Player.update()`. The order matters:
1. **Health**: ticks i-frames and regeneration.
2. **Control**: depends on the player's condition
    - *Dead*: horizontal acceleration is cleared, so the body still falls but no longer steers.
    - *Stunned* (hurt state): movement runs with empty input, so gravity and drag still apply.
    - *Otherwise*: queue an attack, update facing, start a swing if possible, and apply movement.
3. **Attack**: ticks the cooldown and moves the hit area along with the player, so hit area during movement is generated in front of a player.
4. **Invulnerability blink** and **state machine** update.
5. **Equipment**: runs last, so the item copies the pose the sprite settled on this frame.

## Jumping

The player can jump from the ground or during coyote time, then jump once more in midair. Both jumps use the existing jump control and strength; release and press again to trigger the second jump. Landing restores both jumps, and leaving a ledge after coyote time expires leaves only one midair jump. Buffering and variable jump height apply to both jumps; see [Movement Controller](/docs/movement-controller.md).

Movement runs before the state machine. `PlayerStates` reads `player.getMovement.jumpedThisFrame` to play jump feedback, including restarting the jump animation when a second jump happens while already rising. Upward velocity overrides ground-contact flags left over from takeoff. Jumps during attacks play their sound without interrupting the locked attack animation; recovery does not replay that sound. Stunned players receive neutral input and cannot jump.

Animation states and attack foot drag use `MovementController.isGrounded`, which requires solid ground contact (`blocked.down`) and nonnegative vertical velocity. Checkpoint and other trigger overlaps can set `touching.down` while the player is falling; those overlaps do not select walk/idle animations or restore jumps.

## Health

Health events are driven by event listeners `bindHealth()`:

- **Damaged**: flashes the sprite and enters `Hurt` state.
- **Died**: enters `Dead` state.
- **Revived**: player respawn fires `Revived` event, after which we enter `Idle` state.
- **Invulnerability End**: safety lock - sprite's opacity is set to `1`.

Health events are also sent to global `EventBus` with `PLAYER_HEALTH_BUS` prefix. HUD for HP bar listens to those events and reflects player health on screen.

After a hit player is stunned for `PLAYER_HURT_STUN_MS`. This is kept shorter than `PLAYER_HEALTH.invulnerabilityMs` so player has time to act.

## Combat

An attack press is queued even if player can't act on it. This stores presses near the previous swings, too. During swing facing is locked and player velocityX is slowed by `SWING_FOOT_DRAG`. The swing config is received from `ITEM.swing` or falls back to `PLAYER_UNARMED_ATTACK`. Who a swing hits is registered and managed by the scene and collision manager.

*Currently player only has melee attack*.

## Facing

`player.png` is drawn facing left, so moving right mirrors the sprite. Player hitbox (physics body) isn't symmetrical, so we also use `applyBodyOffset()` to mirror physics body.

## Public API

- `equip(id)` / `unequip()`: put or remove item from player's hand.
- `takeDamage(amount, source?)`: player takes damage if i-frames or death doesn't swallow it.
- `heal(amount, source?)`: heal player - clamped at max health.
- `respawn(x, y, current?)`:  respawn player to specified coordinates with specified health.
- Getter for every component.

## Cleanup

`Player` and all of its components are destroyed when the scene shuts down - Phaser destroys every game object on the display list then, which runs `Player.destroy()`. 
