// state interface - name, enter, exit, update functions
export interface State<TContext = unknown> {
    name: string
    enter?(context: TContext, ...args: any[]): void
    exit?(context: TContext): void
    update?(context: TContext, dt: number): void
}

// StateMachine class that includes set of States and governs states
export class StateMachine<TContext = unknown> {
    private states: Map<string, State<TContext>> = new Map()
    private currentState: State<TContext> | null = null
    private previousStateName: string | null = null

    // how long we've been in a current state
    private elapsed: number = 0

    // is state transitioning? if we can't transition to a new state yet, keep it in the `pending` variable
    private isTransitioning: boolean = false
    private pending: { name: string, args: any[] } | null = null

    constructor(private context: TContext) { }

    // add a single state to the states map
    addState(state: State<TContext>): this {
        this.states.set(state.name, state)
        return this
    }

    // add a set of states to the states map
    addStates(...states: State<TContext>[]): this {
        for (const state of states) {
            this.addState(state)
        }
        return this
    }

    // check states map already has a specific state
    hasState(name: string): boolean {
        return this.states.has(name)
    }

    // start a new/initial state (bypass transition guard)
    start(name: string, ...args: any[]): this {
        this.currentState = null
        this.previousStateName = null
        this.transition(name, ...args)
        return this
    }

    // transition from current state to the next one
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

    // transition to pending state
    private flushPending(): void {
        while (this.pending) {
            const { name, args } = this.pending
            this.pending = null
            this.transition(name, ...args)
        }
    }

    get current(): string | undefined {
        return this.currentState?.name
    }

    get previous(): string | null {
        return this.previousStateName
    }

    get stateTime(): number {
        return this.elapsed
    }

    isCurrentState(name: string): boolean {
        return this.currentState?.name === name
    }

    destroy(): void {
        this.currentState?.exit?.(this.context)
        this.currentState = null
        this.previousStateName = null
        this.pending = null
        this.states.clear()
    }
}
