## Animation Controller

`AnimationController` owns the animations of a single sprite. One objet holds one controller and one animation plays at a time. Every Foe and Player has AnimationControler. The owner creates it in its constructor, calls `setFacing()` when the sprite turns, and lets `StateMachine` do the playing. Animations data lives in [animations.ts](/src/game/data/animations.ts).

Source:
[AnimationController.ts](/src/game/components/AnimationController.ts)
[animations.ts](/src/game/data/animations.ts)

## Lifecycle

The owner builds the controller in its construcor, passing the sprite, animation set, and the texture the frames are cut from.

```ts
this.animations = new AnimationController(this, PLAYER_ANIMS, { texture, facing: 'left' })
```

The constructor registers every animation in the set with the scene's global animation manager - keys that already exist are skipped, so several foes of the same type register once. Starting facing direction is applied. `destroy()` clears the pending completion listener and resets the trackers; the owner calls it from its own destructor.

`facing` is the direction the sprite is drawn in, not where the sprite should look. `player.png` is drawn facing left, so the controller mirrors the frames with `setFlipX` whenever needed. Foe gets it's facing direction in [FoeDefinition](/src/game/data/foes.ts).

## Animation Set

An `AnimSet` is a record of names to `AnimConfig`. Entries are optional, so a sheet can leave out animations it doesn't have. Callers check using `has()` to determine whether animation exists or not and pick a fallback in case requested animation is missing.

Requesting to play animation that doesn't exists, isn't fatal. `Play()` logs warning message and returns `false` to indicate requested animation wasn't played.

## Priority and Locking

Two `AnimConfig` fields decide what can interrupt what.

- `priority` - higher priority animation takes precedence animations conflict.
- `lockUntilComplete` - hold the animation until it finished, so nothing below it's priority can cut it short. *Continously repeating animations can't be locked*.

`PlayOptions` parameter on the `play()` overrides them per call.

While an animation is locked, `play()` rejects anythign whose priority is below or equal to the locked one. Returns `false`.

The lock clears on its own when the animation completes via one-time `ANIMATION_COMPLETE_KEY` listener. Callers watch `isLocked` to know when the pose is over.

`release()` drops the lock early without stopping the frames.

`force: true` on `play()` call ignores the lock entirely, which is how death plays over anything.

## Adding New Animations

### Already Existing Class

For example, a new type of Foe:

0. Create and define new foe type.
1. Extend `FoeAnims` if you need an animation the interface doesn't define yet.
2. Define all of your new foe type animations in [animations.ts](/src/game/data/animations.ts) as `satisfies FoeAnims`.
3. In your FoeDefinition at [foes.ts](/src/game/data/foes.ts), add newly created animations to `anims` property. And set `facing` to the direction spritesheet is drawn in.

### New Class

1. Create the class and give it `AnimationController` instance. Built in its constructor.
2. Expose it with a getter so its states can reach it. Call `destroy()` from the class's destructor.
3. Play animations from the [StateMachine](/docs/state-machine.md), not from the class itself.
