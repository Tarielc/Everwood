import type { AudioChannel } from "../config/audio"

/**
 * Where every audio file lives, under `public/`. A bank entry names its file from here
 * down, so moving the folder is one edit rather than thirty
 */
export const AUDIO_ROOT: string = "assets/audio"

/**
 * The one audio sprite every sound effect is cut from - a single file, so the whole sfx
 * bank is one request and one decode rather than twenty
 */
export const SFX_SPRITE = {
    /** Cache key the sprite and its spritemap are both loaded under */
    key: "sfx",
    /** The spritemap, under {@link AUDIO_ROOT} - its marker names are what {@link SOUNDS} plays */
    json: "sfx/sfx.json",
    /** The audio, under {@link AUDIO_ROOT}, in the order the browser should try them */
    audio: ["sfx/sfx.ogg", "sfx/sfx.mp3"],
} as const

/** What every bank entry has, whatever bank it is in */
interface AudioEntry {
    /** How loud the sound itself is mixed, before the bus and before anything the caller asks for */
    volume: number,
}

/** A sound effect: a one-shot, or a short loop something else starts and stops */
export interface SoundDefinition extends AudioEntry {
    /**
     * The markers this sound is played from, in the {@link SFX_SPRITE} spritemap.
     *
     * One marker is one sound. Several are variations of the same sound - picked at
     * random, never the same one twice in a row
     */
    markers: readonly string[],
    /** Which bus it is played on - what a settings slider moves it with */
    channel: Extract<AudioChannel, "sfx" | "ui">,
    /**
     * Pitch spread, as a fraction either side of normal speed. `0.1` plays each copy
     * somewhere between 0.9x and 1.1x, which is what keeps a footstep or a swing from
     * sounding like the same sample over and over
     */
    rateJitter?: number,
    /** Minimum gap between two plays of this sound - defaults to `AUDIO.throttleMs` */
    throttleMs?: number,
    /** How many copies may overlap before the oldest is stolen - defaults to `AUDIO.maxVoices` */
    maxVoices?: number,
    /** Keep playing until something stops it, for a loop rather than a one-shot */
    loop?: boolean,
    /**
     * Dip music and ambience while this plays, so a death or a fanfare has the mix to
     * itself. `true` ducks by `AUDIO.duckVolume`, a number ducks to that fraction
     */
    duck?: boolean | number,
}

/**
 * A bed: the looping layer underneath everything, of which there is one per channel at
 * a time. Music and ambience are both beds - they are swapped with a crossfade, never
 * cut, and a bed with several files plays them as a playlist rather than as variations
 */
export interface BedDefinition extends AudioEntry {
    /**
     * The files this bed is played from, under {@link AUDIO_ROOT}. Several are a playlist,
     * played back to back
     */
    files: readonly string[],
    /** Deal the playlist out in a random order, reshuffled each time round */
    shuffle?: boolean,
    /** How long this bed takes to fade in and out - defaults to its channel's fade */
    fadeMs?: number,
}

/**
 * Every sound effect in the game.
 *
 * An entry is authored at the level it should sit at in the mix; the bus volume the
 * player controls and anything a caller asks for multiply on top of it
 */
export const SOUNDS = {
    // player -----------------------------------------------------------------
    "player-swing": {
        markers: ["player-attack-barehand2"],
        channel: "sfx",
        volume: 0.45,
        rateJitter: 0.1,
    },
    "player-swing-sword": {
        markers: ["player-attack-sword"],
        channel: "sfx",
        volume: 0.5,
        rateJitter: 0.08,
    },
    "player-swing-axe": {
        markers: ["player-attack-axe"],
        channel: "sfx",
        volume: 0.5,
        rateJitter: 0.08,
    },
    // two takes of the same grunt, so a run of hits doesn't repeat itself
    "player-hurt": {
        markers: ["player-hurt"],
        channel: "sfx",
        volume: 0.6,
        rateJitter: 0.06,
        // i-frames already stop a second hit landing, this is only for a shared frame
        throttleMs: 200,
        maxVoices: 2,
    },
    "player-death": {
        markers: ["player-death"],
        channel: "sfx",
        volume: 0.8,
        duck: true,
    },
    "player-jump": {
        markers: ["player-jump"],
        channel: "sfx",
        volume: 0.3,
        rateJitter: 0.12,
    },
    "player-land": {
        markers: ["player-landing"],
        channel: "sfx",
        volume: 0.25,
        rateJitter: 0.1,
        // a landing that lands twice in three frames is one landing
        throttleMs: 150,
        maxVoices: 2,
    },
    "player-heal": {
        markers: ["player-heal"],
        channel: "sfx",
        volume: 0.55,
    },
    // the warning that goes with a nearly empty bar - long throttle, it is a warning
    // rather than a readout
    "player-low-health": {
        markers: ["player-low-health"],
        channel: "sfx",
        volume: 0.6,
        throttleMs: 8000,
        maxVoices: 1,
    },

    // foes -------------------------------------------------------------------
    "warrior-swing": {
        markers: ["warrior-attack"],
        channel: "sfx",
        volume: 0.65,
        rateJitter: 0.1,
    },
    "foe-hurt": {
        markers: ["foe-hurt"],
        channel: "sfx",
        volume: 0.3,
        rateJitter: 0.02,
    },
    "foe-death": {
        markers: ["foe-death"],
        channel: "sfx",
        volume: 0.35,
        rateJitter: 0.02,
    },
    "archer-draw": {
        markers: ["archer-bow-tension"],
        channel: "sfx",
        volume: 0.4,
        rateJitter: 0.08,
    },
    "archer-loose": {
        markers: ["archer-arrow-loose"],
        channel: "sfx",
        volume: 0.45,
        rateJitter: 0.1,
    },
    "arrow-impact": {
        markers: ["archer-arrow-Impact-1", "archer-arrow-Impact-2"],
        channel: "sfx",
        volume: 0.4,
        rateJitter: 0.12,
        maxVoices: 3,
    },

    // events -----------------------------------------------------------------
    "wave-start": {
        markers: ["arena-wave-start"],
        channel: "sfx",
        volume: 0.7,
        duck: true,
    },
    "wave-cleared": {
        markers: ["arena-wave-vistory"],
        channel: "sfx",
        volume: 0.7,
        duck: true,
    },
    "reward": {
        markers: ["positive-ring"],
        channel: "sfx",
        volume: 0.5,
    },

    // interface --------------------------------------------------------------
    "ui-click": {
        markers: ["click-button"],
        channel: "ui",
        volume: 0.5,
    },
    "ui-confirm": {
        markers: ["positive-button"],
        channel: "ui",
        volume: 0.6,
    },
    "ui-cancel": {
        markers: ["negative-button"],
        channel: "ui",
        volume: 0.6,
    },
} as const satisfies Record<string, SoundDefinition>

/** Keys of {@link SOUNDS} - a typo is a compile error, not a silent sound */
export type SoundId = keyof typeof SOUNDS

/** Every music bed, one of which plays at a time */
export const MUSIC = {
    /** The menu's own track, so the game has a voice before a level is even loaded */
    menu: {
        files: ["music/Ambient 2.mp3"],
        volume: 0.5,
    },
    /** Out in the wood - the three ambient tracks, shuffled and played back to back */
    wood: {
        files: ["music/Ambient 1.mp3", "music/Ambient 2.mp3", "music/Ambient 3.mp3"],
        volume: 0.45,
        shuffle: true,
    },
    /** The arena, where the fight never stops and neither does the drumming */
    arena: {
        files: ["music/Action 1.mp3", "music/Action 2.mp3", "music/Action 3.mp3"],
        volume: 0.5,
        shuffle: true,
    },
} as const satisfies Record<string, BedDefinition>

/** Keys of {@link MUSIC} */
export type MusicId = keyof typeof MUSIC

/** Every ambience bed - the room tone under the music, one per level */
export const AMBIENCE = {
    forest: {
        files: ["background-ambience/forest-background-animals.ogg"],
        volume: 0.5,
    },
    "arena-crowd": {
        files: ["background-ambience/crowd-arena-background-noise.mp3"],
        volume: 0.45,
    },
    town: {
        files: ["background-ambience/crowd-town-background-noise.mp3"],
        volume: 0.4,
    },
} as const satisfies Record<string, BedDefinition>

/** Keys of {@link AMBIENCE} */
export type AmbienceId = keyof typeof AMBIENCE

/**
 * The bed registries the loader walks, file by file, keyed by {@link AudioBankName}.
 * {@link SOUNDS} isn't one of them - it is played out of {@link SFX_SPRITE}
 */
export const AUDIO_BANKS = {
    music: MUSIC,
    ambience: AMBIENCE,
} as const

/** Which registry an entry came out of - part of its cache key, so ids can't collide across banks */
export type AudioBankName = keyof typeof AUDIO_BANKS

/**
 * The cache key one file of a bank entry is loaded under.
 *
 * The loader and the controller both build it through here, so renaming a sound can't
 * quietly leave the game playing nothing
 *
 * @param bank - Which registry the entry is in
 * @param id - The entry's key in that registry
 * @param index - Which of the entry's files, counting from 0
 * @returns The cache key, e.g. `"music:wood:1"`
 */
export function audioKey(bank: AudioBankName, id: string, index: number): string {
    return `${bank}:${id}:${index}`
}

/**
 * The URL a bank file is loaded from.
 *
 * Encoded, because a couple of the music tracks are named with spaces in them
 *
 * @param file - The file, as it is written in the bank or in {@link SFX_SPRITE}
 * @returns Path under `public/`, ready for the loader
 */
export function audioPath(file: string): string {
    return encodeURI(`${AUDIO_ROOT}/${file}`)
}

/** The sounds a foe makes, named on its {@link FoeDefinition} */
export interface FoeSounds {
    /** As it commits to an attack - a swing starting, or a bow being drawn */
    attack?: SoundId,
    /** `RangedAttack` only: the moment the shot leaves */
    shoot?: SoundId,
    /** When a hit lands on it */
    hurt?: SoundId,
    /** When it goes down */
    death?: SoundId,
}

/** What the player's swing sounds like with nothing in hand - an item names its own */
export const UNARMED_SWING_SOUND: SoundId = "player-swing"

/** The player's own sounds, which follow from their state rather than from their gear */
export const PLAYER_SOUNDS = {
    hurt: "player-hurt",
    death: "player-death",
    jump: "player-jump",
    land: "player-land",
    heal: "player-heal",
    lowHealth: "player-low-health",
} as const satisfies Record<string, SoundId>
