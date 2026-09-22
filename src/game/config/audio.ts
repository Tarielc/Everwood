/**
 * Every bus a sound can be routed through, on top of the master everything ends up on.
 *
 * A channel is what a settings slider moves and what ducking dips - a sound names one
 * in its bank entry and never touches a volume itself
 */
export type AudioChannel = "music" | "ambience" | "sfx" | "ui"

/** Master and every channel - what the mixer holds a volume and a mute for */
export type AudioBus = "master" | AudioChannel

/** Every bus, in the order an options menu would list them */
export const AUDIO_BUSES = ["master", "music", "ambience", "sfx", "ui"] as const satisfies readonly AudioBus[]

/** How a sound played at a point in the world is thinned out by distance from the listener */
export interface SpatialConfig {
    /** Anything this close to the listener is at full volume, in world pixels */
    refDistance: number,
    /** And anything this far away is silent - volume falls off linearly between the two */
    maxDistance: number,
    /** How far to one side a sound has to be before it is panned as far as it goes */
    panDistance: number,
    /** The hardest anything is ever panned - a sound stuck in one ear is a distraction, not a cue */
    maxPan: number,
}

/** How the mixer starts up, and how it behaves once it is running */
export interface AudioConfig {
    /** Starting volume of each bus, `0`-`1`, before whatever the player last saved is read back over it */
    volumes: Record<AudioBus, number>,
    /** How long music takes to fade out and the next track to fade in */
    musicFadeMs: number,
    /** The same for the ambience bed, which is longer - a room tone shouldn't announce itself */
    ambienceFadeMs: number,
    /** What the beds are multiplied down to while something is ducking them */
    duckVolume: number,
    /** How long the dip and the recovery each take */
    duckFadeMs: number,
    /** How long the dip is held before it recovers, on top of the sound's own length */
    duckHoldMs: number,
    /** Default gap enforced between two plays of the same sound, so one frame can't stack ten of them */
    throttleMs: number,
    /** Default cap on how many copies of one sound play at once - the oldest is stolen past it */
    maxVoices: number,
    spatial: SpatialConfig,
    /** `localStorage` key the player's volumes and mutes are saved under */
    storageKey: string,
    /** Silence the game while the tab is in the background */
    pauseOnBlur: boolean,
}

/**
 * Default mixer settings.
 *
 * Volumes are deliberately low: every sound in the bank is authored at its own level
 * in {@link SOUNDS}, and the bus is what the player moves on top of that
 */
export const AUDIO: AudioConfig = {
    volumes: {
        master: 0.8,
        music: 0.5,
        ambience: 0.6,
        sfx: 0.9,
        ui: 0.8,
    },
    musicFadeMs: 1200,
    ambienceFadeMs: 2000,
    duckVolume: 0.35,
    duckFadeMs: 250,
    duckHoldMs: 400,
    throttleMs: 60,
    maxVoices: 4,
    spatial: {
        // roughly the width of the view - anything on screen and near the player is
        // at full volume, and the falloff is for what happens off the edges
        refDistance: 320,
        maxDistance: 1400,
        panDistance: 640,
        maxPan: 0.7,
    },
    storageKey: "everwood:audio",
    pauseOnBlur: true,
}

/** How low health has to get before the player hears about it, as a fraction of max */
export const LOW_HEALTH_RATIO: number = 0.25
