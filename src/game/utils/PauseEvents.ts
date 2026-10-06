/** Shared event names for gameplay pause, resume and pause button visibility */
export const PauseEvent = {
    Toggle: "game-pause-toggle",
    Pause: "game-pause",
    Resume: "game-resume",
    Show: "button-show",
    Hide: "button-hide",
} as const

/** Any event name used by the shared pause flow */
export type PauseEventName = typeof PauseEvent[keyof typeof PauseEvent]
