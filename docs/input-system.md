# Input System

`Input Controller` takes `RawData` which is simultanously modified by different input sources on each frame and translates them into commands - `MovementController` and player states only read `InputState`, so they don't need to know from which source the input came from.

Source:
[Input Controller](/src/game/systems/inputs/InputController.ts)
[Input Source](/src/game/systems/inputs/InputSource.ts)
[Keyboard Input](/src/game/systems/inputs/KeyboardSource.ts)
[Touch Device Input](/src/game/systems/inputs/TouchSource.ts)

## How a Frame Is Processed

Call `InputController.update()` once per fram, before anything reads input.

1. **Reset** - every flag of the shared `RawInput` object is set to `false`
2. **Sample** - each source's `sample(out)` runs and sets property to `true` when corresponding button is pressed.
3. **Translate** - the controller turns merged `RawInput` into `InputState`.

## Sources

Currently `InputController` only support keyboard and touch devices. They implement abstract class `InputSource`. It never sets RawData property value to false, because all of the inputs work with the shared `out` RawData varible, which is read by `InputController`.

## Double-Tap Sprint

Pressing movement button in the same direction twice within `DOUBLE_TAP_SPRINT_MS` starts a sprint in that direction. *Note that this is only way to sprint on touch devices.*

## Adding New Input Source

Update `InputControllerOptions` to include the input source you want (e.g. gamepad) and implement an abstract `InputSource` class.

Note that you shouldn't set `out` variable properties to false, only change them if they are true, becase `out` variable is shared across all input sources.

## Adding a New Action

Add the flag to `RawInput` and reset it in `InputController.update()`.

Expose it on `InputState` and set it in `update()`

Report it from each source - a key binding, a touch button, etc.