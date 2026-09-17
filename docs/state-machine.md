# State Machine

`StateMachine` governs states of different objects. Single instance of object might only have a single state at a time. Every Foe and Player owns one. The owner registers its states, calls `start()` and then `update()` every frame. `transition()` between states doesn't happen straight away, if StateMachine is in transition process, new state is queued and called after transition process ends.

Source:
[StateMachine.ts](/src/game/systems/state/StateMachine.ts)
[PlayerStates.ts](/src/game/systems/state/PlayerStates.ts)
[FoeStates.ts](/src/game/systems/state/FoeStates.ts)

## Lifecycle

The owner sets the state machine up in its constructor:

```ts
this.stateMachine = new StateMachine<Foe>(this)
    .addStates(...createFoeStates())
    .start(FoeState.Idle)
```

Then it calls `this.stateMachine.update(delta)` once per frame, and `thisstateMachine.destroy()` from its own destructor.

## States

A state is an object implementing `State<TContect>`, where `TContext` is the owner. It has unique `name` and three optional hooks.

- `enter(contect, ...args)` - runs once when state starts. `args` are optional arguments.
- `update(contect, dt)` - runs every frame as long as state is active.
- `exit(context)` - runs once when the state ends. Including when machine is destroyed.

## Transition

`transition(name, ...args)` calls `exit()` on the current state, and then `enter()` on new state. It does nothing is state isn't registered, or new state is already current.

Transitions requested from inside a hook are **queued** if state machine is in transitioning phase; states aren't applied straight away, they are queued and run after current state transition ends. *Only the latest queed state is kept.*

## Adding a New State

### Already Existing Object

For example, a new foe state:
1. Add its name to `FoeState` in `FoeStates.ts`
2. Add states object to the states array returned by `createFoeStates()`, implementing only the hooks it needs.
3. Put helper functions in `FoeStates.ts` next to existing ones.

### States For New Object

For a new class, e.g. `Example`:

1. Create `ExampleStates.ts` with and `ExampleState` object holding the state names, and a `createExampleStates()` function, returning array of example states: `State<Example>[]`
2. In `Example`'s constructor, create the machine, add the states and `start()` default state.
3. Use `get states()` so states can call `example.states.transition()`.
4. Call `states.update(dt)` from `Example.update()` and `states.destroy()` from `Example.destroy()`.
