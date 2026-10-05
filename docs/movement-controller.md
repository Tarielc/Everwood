# Movement Controller

`MovementController` moves user-controlled player character. It only touches the physics body velocity, acceleration, and gravity. Facing and animation is handled by `AnimationController`. Whether the owner is allowed to act is the owner's call.

Source:
[MovementController.ts](/src/game/components/MovementController.ts)

Configuration for player movement: `PLAYER_MOVEMENT` in [player.ts](/src/game/data/player.ts)

## Usage

```ts
// owner's constructor
this.movement = new MovementController(this, PLAYER_MOVEMENT)

// owner's update()
this.movement.update(this.controls, delta)
```
Call after `InputState.update()` so it reads this frame's input. And call it before anything that reacts to the resulting velocity, such as state transitions.

To take away control without freezing the body (stun, for example), pass a neutral input. Gravity and deceleration keep running, so a stunned player still falls and slides to a stop:

```ts
this.movement.update(NO_INPUT, delta)
```

## Frame Order

`update(input, dt)` runs these steps in order:

1. **Timers**: clears `jumpedThisFrame`, restores both jumps and refills coyote time when grounded, and drains coyote time in the air. A jump press starts the jump buffer timer, which then drains.
2. **Horizontal**: accelerate toward the held direction, damps velocity when nothing is held, and clamps to maximum walk or sprint speed.
3. **Gravity**: adds extra gravity while falling and caps maximum fall speed.
4. **Jump**: consumes a buffered press if jump is held and a ground/coyote or midair jump remains. Clears extra fall gravity when a jump fires.
5. **Jump cut**: shortens the jump height if jump was released while rising.

## Horizontal Movement

- Holding left or right sets acceleration to `±acceleration`. In the air it is 70% of that, so air control is weaker.
- With no direction held, acceleration is `0` and velocity is multiplied by `0.85` per 60 FPS frame on the ground and `0.95` in the air.
- Velocity is then clamped to `sprintSpeed` if sprint is held, otherwise to `speed`.

The damping factors are authored per frame at 60 FPS and passed through `damping(factor, dt)` ([damping.ts](/src/game/utils/damping.ts)), which stretches them over the real frame time - so deceleration is the same on a 60 Hz and a 120 Hz screen.

## Jumping

The player has a normal ground/coyote jump and one additional midair jump. Both use the same `jumpVelocity`. Release and press jump again to use the midair jump while rising or falling; holding the button does not trigger it automatically.

A jump needs all of the following in the same frame:

- **Jump buffer** active: jump was pressed within the last `jumpBufferMs`. A press slightly before landing still counts.
- Jump is **still held**. A tap released before landing is dropped.
- A jump is **available**: the normal jump during coyote time, or the one midair jump.

**Coyote time** allows the normal jump within `coyoteTimeMs` after walking off a ledge, leaving the extra midair jump available. After coyote time expires, only the midair jump remains, even if no jump has been used yet.

A jump sets vertical velocity to `jumpVelocity`, clears extra fall gravity, and empties both timers, so one press gives one jump. A third press cannot jump until landing; it can still be buffered into a landing jump if held and within `jumpBufferMs`.

Landing restores both jumps. The controller considers the body grounded when `blocked.down` or `touching.down` is set and vertical velocity is nonnegative. Ground flags left over from takeoff cannot refill jumps while the player is rising.

**Jump cut**: releasing jump while moving up multiplies vertical velocity by `jumpCutMultiplier`. A short tap gives a short hop, holding gives the full height. This applies to both jumps.

## Jump Feedback

The read-only `jumpedThisFrame` getter reports whether a jump fired in the latest movement update. It resets at the start of each `update()` and becomes `true` only when a buffered press is consumed. Read it after movement updates.

`PlayerStates` uses this flag for animation and sound. A second jump while already in `Jump` restarts the jump animation and plays the jump sound without a state transition; jumping from `Fall` transitions to `Jump`. During an attack, the jump sound plays while the attack animation keeps its lock. Recovering from an attack or hurt state into `Jump` does not play another jump sound unless a new jump fired, and attack recovery never duplicates a sound already played by the attack state.

## Gravity

The world gravity (`physics.arcade.gravity` in [main.ts](/src/main.ts)) always applies. `MovementController` only adds extra gravity while falling:

- Falling (`velocity.y > 0`): body gravity = `gravity * (fallGravityMultiplier - 1)`
- Rising or still: body gravity = `0`

Falling is faster than rising, which makes jumps feel less floaty. Fall speed is capped at `maxFallSpeed`.

`gravity` in the config is **not** the world gravity. It is only the base for this extra fall gravity.

## `MovementConfig`

Speeds are in px/s, accelerations in px/s², times in ms.

| Field | Description |
| --- | --- |
| `speed` | Max horizontal speed while walking |
| `sprintSpeed` | Max horizontal speed while sprint is held |
| `acceleration` | Horizontal acceleration on the ground. 70% of it applies in the air |
| `drag` | Not used yet. Deceleration uses the fixed per-frame damping above |
| `jumpVelocity` | Vertical velocity set on both jumps. Negative is up |
| `jumpCutMultiplier` | Upward velocity is multiplied by this when jump is released while rising |
| `gravity` | Base for the extra fall gravity |
| `fallGravityMultiplier` | How much heavier falling is. `1` means no extra gravity |
| `coyoteTimeMs` | How long after leaving the ground the normal jump remains available, before only the midair jump remains |
| `jumpBufferMs` | How long a jump press is remembered |
| `maxFallSpeed` | Maximum downward speed |

## Input

These `InputState` fields are read (see [Input System](/docs/input-system.md)):

| Field | Used For |
| --- | --- |
| `moveLeft`, `moveRight` | Horizontal direction |
| `sprintHeld` | Walk or sprint speed cap |
| `jumpJustPressed` | Starts the jump buffer |
| `jumpHeld` | Required for the jump to trigger |
| `jumpJustReleased` | Jump cut |
