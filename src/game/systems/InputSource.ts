
export interface RawInput {
    left: boolean
    right: boolean
    jump: boolean
}

// something like abstract class to be extended for specific types of input controllers
export interface InputSource {
    sample(out: RawInput): void
    destroy(): void
}
