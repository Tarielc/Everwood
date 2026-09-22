import * as Phaser from 'phaser';

import { AUDIO, AudioBus, AUDIO_BUSES, AudioChannel } from '../../config/audio';
import {
    AMBIENCE,
    AmbienceId,
    AUDIO_BANKS,
    AudioBankName,
    audioKey,
    audioPath,
    MUSIC,
    MusicId,
    SOUNDS,
    SoundDefinition,
    SoundId,
} from '../../data/audio';
import { AudioBed, GameSound } from './AudioBed';

/** What the controller tells the rest of the game about - an options menu follows these rather than polling */
export const AudioEvent = {
    /** The browser let go and sound can actually be heard - fires once, after the first gesture */
    Unlocked: "audio-unlocked",
    /** A bus volume moved - handed the {@link AudioBus} and its new value */
    VolumeChanged: "audio-volume-changed",
    /** A bus was muted or unmuted - handed the {@link AudioBus} and whether it is now muted */
    MuteChanged: "audio-mute-changed",
    /** Music was swapped - handed the new {@link MusicId}, or `null` when it was stopped */
    MusicChanged: "audio-music-changed",
    /** Ambience was swapped - handed the new {@link AmbienceId}, or `null` */
    AmbienceChanged: "audio-ambience-changed",
} as const

/** Keys of {@link AudioEvent} */
export type AudioEventName = typeof AudioEvent[keyof typeof AudioEvent]

/** Whatever a spatial sound is heard from - the player, usually */
export interface AudioListener {
    x: number
    y: number
}

/** What a caller can say about one play, on top of what the bank already says */
export interface SoundPlayOptions {
    /** Multiplied on top of the sound's authored volume - `0.5` is half as loud as the bank has it */
    volume?: number
    /** Playback rate, overriding the entry's own pitch jitter */
    rate?: number
    /** Stereo placement, `-1` hard left to `1` hard right - {@link AudioController.playAt} sets this itself */
    pan?: number
    /** Hold the sound back this many ms before it sounds */
    delayMs?: number
    /** Play it even if the same sound went off a moment ago - for something that must be heard */
    ignoreThrottle?: boolean
    /** Keep playing until something stops it, overriding the entry's own looping */
    loop?: boolean
}

/** What the mixer remembers between sessions */
interface SavedSettings {
    volumes?: Partial<Record<AudioBus, number>>
    mutes?: Partial<Record<AudioBus, boolean>>
}

/**
 * The game's mixer: one of them, owned by the game rather than by a scene.
 *
 * Everything audible goes through here, and nothing anywhere else touches a volume:
 *
 * - **Buses.** Master, music, ambience, sfx and ui each carry a volume and a mute, saved
 *   to `localStorage` and applied live, so an options menu is sliders wired to
 *   {@link setVolume} and nothing more
 * - **A sound bank.** A sound is played by its id from {@link SOUNDS}, which is where its
 *   level, its pitch spread, its variations and its limits are authored - a caller only
 *   says *when*
 * - **Voices.** Each sound is throttled and capped, so a frame that reports four hits
 *   plays one impact rather than four stacked copies of it
 * - **Beds.** One music bed and one ambience bed, crossfaded rather than cut, each able to
 *   play a shuffled playlist
 * - **Space.** {@link playAt} thins a sound out with its distance from the listener and pans
 *   it to the side it happened on, and drops it outright past the falloff's range
 * - **Ducking.** A sound can dip the beds while it plays, so a death or a fanfare is heard
 *   over the music rather than through it
 *
 * It runs on the game's own step, not a scene's, so a level change - which is a scene
 * restart - can't cut a track off mid-fade or strand a timer. Scenes only ever say what
 * they want playing.
 *
 * @example
 * ```ts
 * AudioController.init(this.game)          // once, in BootScene
 * const audio = AudioController.instance   // anywhere after that
 *
 * audio.playMusic("arena")
 * audio.play("ui-click")
 * audio.playAt("warrior-swing", foe.x, foe.y)
 * ```
 */
export class AudioController extends Phaser.Events.EventEmitter {
    /** The one in play - see {@link init} and {@link instance} */
    private static current: AudioController | null = null

    /** Phaser's own sound manager, which is game-wide and outlives every scene */
    private readonly manager: Phaser.Sound.BaseSoundManager

    /** Where each bus currently sits, `0`-`1` */
    private readonly volumes: Record<AudioBus, number>

    /** Which buses are muted - a muted bus is silent whatever its volume says */
    private readonly mutes: Record<AudioBus, boolean>

    /** The music bed and the ambience bed - one entry each, crossfaded when swapped */
    private readonly musicBed: AudioBed
    private readonly ambienceBed: AudioBed

    /** Sounds currently playing, per id, so one of them can't crowd the mix out */
    private readonly voices: Map<SoundId, GameSound[]> = new Map()

    /**
     * What each live sound is worth before its bus is applied - its authored level times
     * whatever the caller asked for. Kept so a slider moved under a playing loop lands on
     * it without losing the rest of the mix it was started with
     */
    private readonly gains: WeakMap<GameSound, number> = new WeakMap()

    /** When each sound last started, against {@link now} - what the throttle is measured from */
    private readonly lastPlayed: Map<SoundId, number> = new Map()

    /** Which variation each sound used last, so a two-file sound alternates rather than repeats */
    private readonly lastVariant: Map<SoundId, number> = new Map()

    /** Keys already reported missing, so a sound that failed to load warns once rather than every frame */
    private readonly missing: Set<string> = new Set()

    /** Game time in ms, as of this frame */
    private now: number = 0

    /** Where the beds currently sit under a duck, `1` being undipped */
    private duckLevel: number = 1
    private duckTarget: number = 1
    /** How much {@link duckLevel} moves per ms */
    private duckSpeed: number = 0
    /** How long the current dip is held before it recovers */
    private duckHold: number = 0

    /** What spatial sounds are heard from - nothing plays spatially without one */
    private listener: AudioListener | null = null

    /** What was asked for while the browser still had audio locked, replayed once it lets go */
    private requestedMusic: MusicId | null = null
    private requestedAmbience: AmbienceId | null = null

    /**
     * Use {@link init} - there is one mixer, and it belongs to the game
     *
     * @param game - The running game
     */
    private constructor(private readonly game: Phaser.Game) {
        super()

        this.manager = game.sound
        this.manager.pauseOnBlur = AUDIO.pauseOnBlur

        this.volumes = { ...AUDIO.volumes }
        this.mutes = { master: false, music: false, ambience: false, sfx: false, ui: false }
        this.loadSettings()

        this.musicBed = new AudioBed(
            "music",
            AUDIO.musicFadeMs,
            (key, config) => this.createSound(key, config),
            () => this.bedLevel("music"),
        )

        this.ambienceBed = new AudioBed(
            "ambience",
            AUDIO.ambienceFadeMs,
            (key, config) => this.createSound(key, config),
            () => this.bedLevel("ambience"),
        )

        // the game's own step rather than a scene's, so nothing here is torn down by a
        // level change - which is a scene restart, and takes every scene timer with it
        game.events.on(Phaser.Core.Events.PRE_STEP, this.update, this)
        game.events.once(Phaser.Core.Events.DESTROY, this.destroy, this)

        // a browser gives no audio at all until the page has been clicked on. whatever
        // was asked for before that is remembered and started the moment it does
        if (this.manager.locked) this.manager.once(Phaser.Sound.Events.UNLOCKED, this.onUnlocked, this)
    }

    /**
     * Build the mixer for a game. Call once, from `BootScene` - the sound manager exists
     * as soon as the game has booted, the bank itself loads later
     *
     * @param game - The running game
     * @returns The mixer, which is also reachable through {@link instance}
     */
    static init(game: Phaser.Game): AudioController {
        // a hot reload runs boot again against a game that already has one
        AudioController.current?.destroy()
        AudioController.current = new AudioController(game)

        return AudioController.current
    }

    /** The game's mixer. {@link init} has to have run, which `BootScene` does before anything else */
    static get instance(): AudioController {
        if (!AudioController.current) {
            throw new Error("AudioController.init(game) has not run - nothing can be played yet")
        }

        return AudioController.current
    }

    /** `true` once {@link init} has run - for anything that can sensibly carry on without sound */
    static get isReady(): boolean {
        return AudioController.current !== null
    }

    /**
     * Queue every file in the bank onto a loader.
     *
     * Driven off the registries, so a new sound is an entry in `data/audio.ts` and
     * nothing else
     *
     * @param load - Loader to queue against, from a scene's `preload()`
     */
    static load(load: Phaser.Loader.LoaderPlugin): void {
        const banks = Object.entries(AUDIO_BANKS) as [AudioBankName, Record<string, { files: readonly string[] }>][]

        for (const [bank, entries] of banks) {
            for (const [id, entry] of Object.entries(entries)) {
                entry.files.forEach((file, index) => {
                    load.audio(audioKey(bank, id, index), audioPath(file))
                })
            }
        }
    }

    // sound effects ----------------------------------------------------------

    /**
     * Play a sound from the bank.
     *
     * Silently does nothing when the sound is throttled, its bus is muted or its file
     * never loaded - a caller is telling the mixer what happened in the game, and
     * whether that is worth hearing is the mixer's business
     *
     * @param id - Which sound, from {@link SOUNDS}
     * @param options - Anything to say about this one play
     * @returns The sound, or `null` when nothing was played
     */
    play(id: SoundId, options: SoundPlayOptions = {}): GameSound | null {
        const definition: SoundDefinition = SOUNDS[id]
        const level = this.level(definition.channel)

        // muted or turned all the way down - not worth a voice, let alone a decode
        if (level <= 0) return null

        const throttleMs = options.ignoreThrottle ? 0 : definition.throttleMs ?? AUDIO.throttleMs
        const last = this.lastPlayed.get(id)
        if (last !== undefined && this.now - last < throttleMs) return null

        this.makeRoom(id, definition)

        const gain = definition.volume * (options.volume ?? 1)

        const sound = this.createSound(audioKey("sound", id, this.pickVariant(id, definition)), {
            volume: gain * level,
            rate: options.rate ?? jitter(definition.rateJitter),
            pan: options.pan ?? 0,
            loop: options.loop ?? definition.loop ?? false,
            delay: (options.delayMs ?? 0) / 1000,
        })
        if (!sound) return null

        this.gains.set(sound, gain)
        this.lastPlayed.set(id, this.now)
        this.track(id, sound)

        // a sound that refuses to start would otherwise sit in the voice list forever,
        // holding a slot against everything that comes after it
        if (!sound.play()) {
            this.release(id, sound)
            return null
        }

        if (definition.duck) this.duckFor(sound, definition.duck)

        return sound
    }

    /**
     * Play a sound where it happened.
     *
     * Thinned out by how far it is from the listener and panned to the side it is on,
     * both from `AUDIO.spatial`. Anything past the falloff's range is dropped rather
     * than played at nothing, and with no listener set it is played flat
     *
     * @param id - Which sound, from {@link SOUNDS}
     * @param x - Where it happened, in world pixels
     * @param y - The same
     * @param options - Anything to say about this one play - its `volume` multiplies with the distance
     * @returns The sound, or `null` when nothing was played
     */
    playAt(id: SoundId, x: number, y: number, options: SoundPlayOptions = {}): GameSound | null {
        if (!this.listener) return this.play(id, options)

        const { refDistance, maxDistance, panDistance, maxPan } = AUDIO.spatial

        const dx = x - this.listener.x
        const distance = Math.hypot(dx, y - this.listener.y)

        // off in the distance somewhere - it would be inaudible anyway, and this way it
        // doesn't cost a voice that something on screen could have used
        if (distance >= maxDistance) return null

        const falloff = 1 - Phaser.Math.Clamp((distance - refDistance) / (maxDistance - refDistance), 0, 1)

        return this.play(id, {
            ...options,
            volume: (options.volume ?? 1) * falloff,
            pan: options.pan ?? Phaser.Math.Clamp(dx / panDistance, -1, 1) * maxPan,
        })
    }

    /**
     * Stop every copy of one sound - for a loop that was started with `loop: true`
     *
     * @param id - Which sound, from {@link SOUNDS}
     */
    stop(id: SoundId): void {
        for (const sound of this.voices.get(id)?.slice() ?? []) sound.stop()
    }

    /** What spatial sounds are heard from - the player, set by `GameScene` as it spawns them */
    setListener(listener: AudioListener | null): void {
        this.listener = listener
    }

    // beds -------------------------------------------------------------------

    /**
     * Put a music bed on, crossfading out whatever was playing.
     *
     * Asking for what is already playing does nothing, so a scene can say what it wants
     * on every `create()` without restarting the track every time it is restarted
     *
     * @param id - Which bed, from {@link MUSIC} - `null` stops the music
     * @param fadeMs - Crossfade, overriding the bed's own
     */
    playMusic(id: MusicId | null, fadeMs?: number): void {
        this.requestedMusic = id

        if (!id) {
            this.musicBed.stop(fadeMs)
        } else {
            this.musicBed.play(id, MUSIC[id], fadeMs)
        }

        this.emit(AudioEvent.MusicChanged, id)
    }

    /**
     * The room tone under the music - the same machine, on its own bus and its own bed
     *
     * @param id - Which bed, from {@link AMBIENCE} - `null` stops it
     * @param fadeMs - Crossfade, overriding the bed's own
     */
    playAmbience(id: AmbienceId | null, fadeMs?: number): void {
        this.requestedAmbience = id

        if (!id) {
            this.ambienceBed.stop(fadeMs)
        } else {
            this.ambienceBed.play(id, AMBIENCE[id], fadeMs)
        }

        this.emit(AudioEvent.AmbienceChanged, id)
    }

    /** Which music bed is playing, `null` when none is */
    get music(): string | null {
        return this.musicBed.playing
    }

    /** Which ambience bed is playing, `null` when none is */
    get ambience(): string | null {
        return this.ambienceBed.playing
    }

    /**
     * Dip music and ambience, so something else can be heard over them.
     *
     * Overlapping ducks take the deepest of them and the longest hold, so a fanfare
     * during a death doesn't lift the music back up halfway through
     *
     * @param amount - What the beds are multiplied down to, `0`-`1`
     * @param holdMs - How long the dip is held before it recovers
     */
    duck(amount: number = AUDIO.duckVolume, holdMs: number = AUDIO.duckHoldMs): void {
        this.duckTarget = Math.min(this.duckTarget, Phaser.Math.Clamp(amount, 0, 1))
        this.duckSpeed = AUDIO.duckFadeMs > 0 ? 1 / AUDIO.duckFadeMs : 0
        this.duckHold = Math.max(this.duckHold, holdMs)
    }

    // mixer ------------------------------------------------------------------

    /**
     * Move a bus. Applies to everything already playing, and is remembered for next time
     *
     * @param bus - Which bus, `"master"` included
     * @param volume - Its new value, `0`-`1`
     */
    setVolume(bus: AudioBus, volume: number): void {
        const next = Phaser.Math.Clamp(volume, 0, 1)
        if (this.volumes[bus] === next) return

        this.volumes[bus] = next
        this.applyMix()
        this.saveSettings()

        this.emit(AudioEvent.VolumeChanged, bus, next)
    }

    /**
     * Where a bus sits
     *
     * @param bus - Which bus
     * @returns Its volume, `0`-`1`, whatever its mute says
     */
    getVolume(bus: AudioBus): number {
        return this.volumes[bus]
    }

    /**
     * Mute or unmute a bus. A muted bus keeps its volume, so unmuting puts it back
     * where the player left it
     *
     * @param bus - Which bus, `"master"` included
     * @param muted - `true` to silence it
     */
    setMuted(bus: AudioBus, muted: boolean): void {
        if (this.mutes[bus] === muted) return

        this.mutes[bus] = muted
        this.applyMix()
        this.saveSettings()

        this.emit(AudioEvent.MuteChanged, bus, muted)
    }

    /**
     * Whether a bus is muted
     *
     * @param bus - Which bus
     */
    isMuted(bus: AudioBus): boolean {
        return this.mutes[bus]
    }

    /**
     * Flip a bus's mute - what a speaker button on the HUD does
     *
     * @param bus - Which bus, the master by default
     * @returns Whether it is now muted
     */
    toggleMute(bus: AudioBus = "master"): boolean {
        this.setMuted(bus, !this.mutes[bus])
        return this.mutes[bus]
    }

    /** `true` once the browser has let go and sound can be heard */
    get isUnlocked(): boolean {
        return !this.manager.locked
    }

    /** Stop everything - every bed, and every sound still ringing out */
    stopAll(): void {
        this.musicBed.stop(0)
        this.ambienceBed.stop(0)

        for (const sounds of [...this.voices.values()]) {
            for (const sound of sounds.slice()) sound.stop()
        }

        this.voices.clear()
        this.requestedMusic = null
        this.requestedAmbience = null
    }

    /** Destructor - runs itself when the game goes down */
    destroy(): void {
        this.game.events.off(Phaser.Core.Events.PRE_STEP, this.update, this)
        this.manager.off(Phaser.Sound.Events.UNLOCKED, this.onUnlocked, this)

        this.stopAll()
        this.musicBed.destroy()
        this.ambienceBed.destroy()

        this.voices.clear()
        this.lastPlayed.clear()
        this.lastVariant.clear()

        if (AudioController.current === this) AudioController.current = null

        super.destroy()
    }

    // internals --------------------------------------------------------------

    /**
     * Run every frame, off the game's step
     *
     * @param time - Game time in ms
     * @param delta - Time since the last frame, in ms
     */
    private update(time: number, delta: number): void {
        this.now = time

        this.updateDuck(delta)
        this.musicBed.update(delta)
        this.ambienceBed.update(delta)
    }

    /**
     * Walk the duck toward where it is heading, and let it back up once its hold is out
     *
     * @param dt - Time since the last frame, in ms
     */
    private updateDuck(dt: number): void {
        if (this.duckHold > 0) {
            this.duckHold = Math.max(0, this.duckHold - dt)
            if (this.duckHold === 0) this.duckTarget = 1
        }

        if (this.duckLevel === this.duckTarget) return

        const step = this.duckSpeed > 0 ? this.duckSpeed * dt : 1

        this.duckLevel = this.duckTarget > this.duckLevel
            ? Math.min(this.duckTarget, this.duckLevel + step)
            : Math.max(this.duckTarget, this.duckLevel - step)

        // the beds read the new level on their own update, which is the next line along -
        // this is only for anything that is between fades and would otherwise sit still
        this.musicBed.refresh()
        this.ambienceBed.refresh()
    }

    /**
     * What a channel is worth right now - the bus, the master, and both of their mutes
     *
     * @param channel - Which channel
     * @returns A multiplier, `0`-`1`
     */
    private level(channel: AudioChannel): number {
        if (this.mutes.master || this.mutes[channel]) return 0
        return this.volumes.master * this.volumes[channel]
    }

    /**
     * The same, with whatever ducking is in progress - what the beds are worth
     *
     * @param channel - Which channel
     * @returns A multiplier, `0`-`1`
     */
    private bedLevel(channel: AudioChannel): number {
        return this.level(channel) * this.duckLevel
    }

    /** Put every live sound back in line with the buses, after one of them moved */
    private applyMix(): void {
        this.musicBed.refresh()
        this.ambienceBed.refresh()

        // a one-shot is over in a moment, but a loop started through play() is not -
        // it would otherwise keep the volume the bus had when it started
        for (const [id, sounds] of this.voices) {
            const level = this.level(SOUNDS[id].channel)

            for (const sound of sounds) {
                if (sound.loop) sound.setVolume((this.gains.get(sound) ?? SOUNDS[id].volume) * level)
            }
        }
    }

    /**
     * Make a sound, or say why it can't be made
     *
     * @param key - Cache key, from {@link audioKey}
     * @param config - How it is to be played
     * @returns The sound, or `null` when its file isn't in the cache
     */
    private createSound(key: string, config: Phaser.Types.Sound.SoundConfig): GameSound | null {
        if (!this.game.cache.audio.exists(key)) {
            // once per key - a missing file would otherwise warn on every swing
            if (!this.missing.has(key)) {
                this.missing.add(key)
                console.warn(`AudioController: "${key}" isn't loaded - was AudioController.load() run?`)
            }

            return null
        }

        return this.manager.add(key, config) as GameSound
    }

    /**
     * Keep track of a sound until it stops, so it can be counted and let go of
     *
     * @param id - Which sound it is
     * @param sound - The sound itself
     */
    private track(id: SoundId, sound: GameSound): void {
        const sounds = this.voices.get(id)
        if (sounds) sounds.push(sound)
        else this.voices.set(id, [sound])

        // either end of it - a one-shot that played out, or a loop something stopped
        const release = () => this.release(id, sound)
        sound.once(Phaser.Sound.Events.COMPLETE, release)
        sound.once(Phaser.Sound.Events.STOP, release)
    }

    /**
     * Drop a sound that has finished, the way Phaser's own `play()` does
     *
     * @param id - Which sound it was
     * @param sound - The sound itself
     */
    private release(id: SoundId, sound: GameSound): void {
        const sounds = this.voices.get(id)
        const index = sounds?.indexOf(sound) ?? -1

        if (sounds && index >= 0) sounds.splice(index, 1)
        if (!sound.pendingRemove) sound.destroy()
    }

    /**
     * Free a voice for a sound about to play, by stealing the oldest one if it is at
     * its limit. The oldest is the one furthest through, so it is the least missed
     *
     * @param id - Which sound is about to play
     * @param definition - Its bank entry
     */
    private makeRoom(id: SoundId, definition: SoundDefinition): void {
        const sounds = this.voices.get(id)
        if (!sounds) return

        const max = Math.max(1, definition.maxVoices ?? AUDIO.maxVoices)

        while (sounds.length >= max) {
            const oldest = sounds[0]
            const before = sounds.length

            // stop() lets it go through the listener track() put on it
            oldest.stop()

            // one that never reported stopping - a sound still sitting out its delay -
            // would otherwise leave this looping forever
            if (sounds.length === before) this.release(id, oldest)
        }
    }

    /**
     * Which of a sound's files to play - anything but the one it used last, so a
     * two-take sound alternates instead of repeating
     *
     * @param id - Which sound
     * @param definition - Its bank entry
     * @returns Index into the entry's files
     */
    private pickVariant(id: SoundId, definition: SoundDefinition): number {
        const count = definition.files.length
        if (count === 1) return 0

        const last = this.lastVariant.get(id)
        let index = Phaser.Math.Between(0, count - 1)
        if (index === last) index = (index + 1) % count

        this.lastVariant.set(id, index)
        return index
    }

    /**
     * Dip the beds for as long as a sound is going to take
     *
     * @param sound - The sound that asked for it
     * @param duck - `true` for the default dip, or the level to dip to
     */
    private duckFor(sound: GameSound, duck: boolean | number): void {
        const amount = typeof duck === "number" ? duck : AUDIO.duckVolume
        // totalDuration is in seconds, and is 0 on a build with no audio at all
        const holdMs = sound.totalDuration * 1000 + AUDIO.duckHoldMs

        this.duck(amount, holdMs)
    }

    /** The browser let go - put on whatever was asked for before it did */
    private onUnlocked(): void {
        const music = this.requestedMusic
        const ambience = this.requestedAmbience

        // they were started against a locked context and never actually sounded, so
        // they are dropped and asked for again rather than faded into
        this.musicBed.stop(0)
        this.ambienceBed.stop(0)

        if (music) this.musicBed.play(music, MUSIC[music], 0)
        if (ambience) this.ambienceBed.play(ambience, AMBIENCE[ambience], 0)

        this.emit(AudioEvent.Unlocked)
    }

    /** Read back the volumes and mutes the player last left, if there are any */
    private loadSettings(): void {
        try {
            const raw = window.localStorage.getItem(AUDIO.storageKey)
            if (!raw) return

            const saved = JSON.parse(raw) as SavedSettings

            for (const bus of AUDIO_BUSES) {
                const volume = saved.volumes?.[bus]
                if (typeof volume === "number") this.volumes[bus] = Phaser.Math.Clamp(volume, 0, 1)

                const muted = saved.mutes?.[bus]
                if (typeof muted === "boolean") this.mutes[bus] = muted
            }
        } catch {
            // private browsing, a full disk, or something else's key under ours - the
            // defaults are a perfectly good mix, and sound is no reason to stop the game
        }
    }

    /** Remember the mix for next time */
    private saveSettings(): void {
        try {
            window.localStorage.setItem(AUDIO.storageKey, JSON.stringify({
                volumes: this.volumes,
                mutes: this.mutes,
            } satisfies SavedSettings))
        } catch {
            // as above - nothing here is worth interrupting the game over
        }
    }
}

/**
 * A playback rate somewhere either side of normal, which is what keeps the same sample
 * from sounding like the same sample
 *
 * @param spread - Fraction either side of `1` - `0` or nothing at all plays it straight
 * @returns The rate to play at
 */
function jitter(spread?: number): number {
    if (!spread) return 1
    return 1 + Phaser.Math.FloatBetween(-spread, spread)
}
