/**
 * Single state interface
 * 
 * @typeParam TContext - The object the state machine belongs to
*/
export interface State<TContext = unknown> {
    /** State name */
    name: string
    /**
     * Runs once when the machine switches into this state
     * 
     * @param context - The object the state machine belongs to  
     * @param args - optional arguments for the state to work with
     */
    enter?(context: TContext, ...args: any[]): void
    /**
     * Runs once when the machine leaves this state, or gets destroyed
     * 
     * @param context - The object the state machine belongs to
     */
    exit?(context: TContext): void
    /**
     * Runs every every time statemachine.update() for this state
     * @param context - The object the state machine belongs to
     * @param dt - delta, time passed since the last update
     */
    update?(context: TContext, dt: number): void
}

/**
 * StateMachine class that governs set of state for different object types.
 * 
 * State Machine has a single state at a time for a single object.
 * 
 * Every foe and player has their own StateMachine, they call `start()` once and `update()` every frame.
 * 
 * Transitions aren't applied straight away - they are queued and applied as soon as current state finishes.
 * 
 * @typeParam TContect - The object the state machine belongs to
 */
export class StateMachine<TContext = unknown> {
    /** List of states of current object */
    private states: Map<string, State<TContext>> = new Map()
    /** Current state an object is in */
    private currentState: State<TContext> | null = null
    /** previous state name an object was in */
    private previousStateName: string | null = null

    /** Timer of how long we have been in current state */
    private elapsed: number = 0

    /** If state is transitioning, we can't transition to a new state yet */
    private isTransitioning: boolean = false
    /** Keep pending transitions in this variable and change state after transitioning is complete*/
    private pending: { name: string, args: any[] } | null = null

    /**
     * Empty construcor, only providing new class property
     * for Object we are tracking states for
     * 
     * @param context - The object the state machine belongs to
     */
    constructor(private context: TContext) { }

    /**
     * Register a single state to the states map
     * 
     * @param state - state we want to add
     * @returns this StateMachine to allow chaining
     */
    addState(state: State<TContext>): this {
        this.states.set(state.name, state)
        return this
    }

    /**
     * Register multiple states to state machine
     * e.g `createFoeStates()`
     * 
     * @param states - States to register 
     * @returns this StateMachine to allow chaining
     */
    addStates(...states: State<TContext>[]): this {
        for (const state of states) {
            this.addState(state)
        }
        return this
    }

    /**
     * Chjeck if specified state is already registered.
     * 
     * @param name - state name to check for
     * @returns `true` if state already in states map,
     *  `false` otherwise.
     */
    hasState(name: string): boolean {
        return this.states.has(name)
    }

    /**
     * Start a new/initial state (bypass transition guard)
     * 
     * @param name - state name to start
     * @param args - optional arguments for state to work with
     * @returns this StateMachine to allow chaining
     */
    start(name: string, ...args: any[]): this {
        this.currentState = null
        this.previousStateName = null
        this.transition(name, ...args)
        return this
    }

    /**
     * Transition from current state to the next one
     * 
     * Does nothing if specified state doesn't exists or if we already are in specified state.
     * Queues of new state if current state is transitioning.
     * 
     * @param name - state to transition to
     * @param args - optional arguments for a new state
     */
    transition(name: string, ...args: any[]): void {
        if (!this.states.has(name)) {
            console.warn(`State ${name} doesn't exists`)
            return
        }

        // if new state is the current state, do nothing
        if (this.currentState?.name === name) return

        // if we are in a transition phase, store state in `pending`
        if (this.isTransitioning) {
            this.pending = { name, args }
            return
        }

        // transition phase started
        this.isTransitioning = true
        try {
            this.currentState?.exit?.(this.context)
            this.previousStateName = this.currentState?.name ?? null
            this.currentState = this.states.get(name)!
            this.elapsed = 0
            this.currentState.enter?.(this.context, ...args)
        } finally {
            // transition phase ended
            this.isTransitioning = false
        }

        // transition to pending state
        this.flushPending()
    }

    /**
     * Update states every frame
     * 
     * Update elapsed timer of current state
     * 
     * Transition to current states `update()` method,
     * renew the current state
     * 
     * @param dt - delta, time since last update
     */
    update(dt: number): void {
        if (!this.currentState) return
        // increase current state timer
        this.elapsed += dt

        // transition phase started (state -> state.update())
        this.isTransitioning = true
        try {
            // if current state has an update() method, call it
            this.currentState.update?.(this.context, dt)
        } finally {
            // transition phase ended
            this.isTransitioning = false
        }

        // transition to pending state
        this.flushPending()
    }

    /** Transition to queued/pending state */
    private flushPending(): void {
        while (this.pending) {
            const { name, args } = this.pending
            this.pending = null
            this.transition(name, ...args)
        }
    }

    /** If present, get current state name as string, `undefined` otherwise */
    get current(): string | undefined {
        return this.currentState?.name
    }

    /** if exists, get previous state name, `null` otherwise */
    get previous(): string | null {
        return this.previousStateName
    }

    /** return elapsed timer of current state */
    get stateTime(): number {
        return this.elapsed
    }

    /**
     * Compare current state to provided state
     * 
     * @param name - state to compare against 
     * @returns `true` if current state is specified param,
     *  `false` otherwise
     */
    isCurrentState(name: string): boolean {
        return this.currentState?.name === name
    }

    /**
     * Destructor and cleanup state machine
     * 
     * Drop every queues transition and "unregister" every state
     * 
     * Call this from owners destructor
     */
    destroy(): void {
        this.currentState?.exit?.(this.context)
        this.currentState = null
        this.previousStateName = null
        this.pending = null
        this.states.clear()
    }
}
