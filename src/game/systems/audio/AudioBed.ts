import * as Phaser from 'phaser';

import { audioKey, AudioBankName, BedDefinition } from '../../data/audio';

/**
 * A sound the mixer can actually work with.
 *
 * `SoundManager.add()` is typed as the base class, which knows nothing about volume or
 * looping - every implementation Phaser hands back does, and this is the three of them
 */
export type GameSound =
    | Phaser.Sound.NoAudioSound
    | Phaser.Sound.HTML5AudioSound
    | Phaser.Sound.WebAudioSound

/**
 * How a bed gets a sound. The controller owns the sound manager and the cache, so it
 * makes them; the bed only ever asks for a key it built itself
 */
export type BedSoundFactory = (key: string, config: Phaser.Types.Sound.SoundConfig) => GameSound | null

/** One track on the bed, with the fade it is in the middle of */
interface BedVoice {
    sound: GameSound
    /** Which entry it belongs to - a track that ends after a swap is not the one that advances the playlist */
    id: string
    /** Where its fade currently sits, `0` silent to `1` fully in */
    level: number
    /** Where the fade is heading - `0` means it is on its way out and will be dropped */
    target: number
    /** How much {@link level} moves per ms */
    speed: number
    /** The definition's own volume, kept per voice so a swap can fade between two different mixes */
    volume: number
}

/**
 * The looping layer underneath everything, of which one plays at a time.
 *
 * Music and ambience are the same machine pointed at different registries: one bed each,
 * swapped by crossfade rather than cut, with an entry of several files played as a
 * playlist that advances when a track ends.
 *
 * It owns no volume of its own. Every frame it asks {@link level} what its channel is
 * currently worth - which is where the player's sliders, the master bus and any ducking
 * in progress are already multiplied together - so a slider moved mid-fade lands on the
 * next frame without the bed knowing anything about it.
 */
export class AudioBed {
    /** Tracks in flight - usually one, two while a swap is crossfading */
    private readonly voices: BedVoice[] = []

    /** Which entry is on the bed, `null` when nothing is */
    private id: string | null = null

    /** What that entry is, kept so a playlist can advance without looking it up again */
    private definition: BedDefinition | null = null

    /** The order the playlist's files are played in - reshuffled each time round */
    private order: number[] = []

    /** How far through {@link order} the bed is */
    private position: number = 0

    /**
     * @param bank - Registry the bed's entries come from, so it can build their cache keys
     * @param defaultFadeMs - Crossfade used by an entry that doesn't name its own
     * @param create - How to make a sound
     * @param level - What this bed's channel is worth right now, `0`-`1`
     */
    constructor(
        private readonly bank: AudioBankName,
        private readonly defaultFadeMs: number,
        private readonly create: BedSoundFactory,
        private readonly level: () => number,
    ) { }

    /** Which entry is playing, `null` when the bed is empty or on its way out */
    get playing(): string | null {
        return this.id
    }

    /**
     * Put an entry on the bed, crossfading out whatever was on it.
     *
     * Asking for what is already playing does nothing, so a scene can say what it wants
     * playing on every create without restarting the track on every level change
     *
     * @param id - Key of the entry in this bed's registry
     * @param definition - The entry itself
     * @param fadeMs - Crossfade, overriding the entry's own
     */
    play(id: string, definition: BedDefinition, fadeMs?: number): void {
        if (this.id === id) return

        const fade = fadeMs ?? definition.fadeMs ?? this.defaultFadeMs

        this.fadeOutAll(fade)

        this.id = id
        this.definition = definition
        this.order = this.buildOrder(definition)
        this.position = 0

        this.startTrack(fade)
    }

    /**
     * Take the bed down
     *
     * @param fadeMs - How long the fade out takes - `0` cuts it
     */
    stop(fadeMs?: number): void {
        this.fadeOutAll(fadeMs ?? this.definition?.fadeMs ?? this.defaultFadeMs)

        this.id = null
        this.definition = null
        this.order = []
        this.position = 0
    }

    /**
     * Advance every fade in flight and apply the result.
     *
     * Called from the controller's own tick rather than from a scene, so a level change
     * can't leave a track stuck halfway through a crossfade
     *
     * @param dt - Time since the last frame, in ms
     */
    update(dt: number): void {
        const channel = this.level()

        // backwards - a voice that finishes fading out drops out of the list here
        for (let i = this.voices.length - 1; i >= 0; i--) {
            const voice = this.voices[i]

            // walk the envelope toward wherever its fade is heading
            if (voice.level !== voice.target) {
                const step = voice.speed * dt

                voice.level = voice.target > voice.level
                    ? Math.min(voice.target, voice.level + step)
                    : Math.max(voice.target, voice.level - step)
            }

            // all the way out - whatever swapped it off the bed is finished with it
            if (voice.level <= 0 && voice.target === 0) {
                this.retire(i)
                continue
            }

            voice.sound.setVolume(voice.volume * voice.level * channel)
        }
    }

    /** Re-apply every volume, for a slider moved or a duck that just changed the mix */
    refresh(): void {
        const channel = this.level()
        for (const voice of this.voices) {
            voice.sound.setVolume(voice.volume * voice.level * channel)
        }
    }

    /** Destructor - drops every track on the bed, fade or no fade */
    destroy(): void {
        for (let i = this.voices.length - 1; i >= 0; i--) this.retire(i)

        this.id = null
        this.definition = null
        this.order = []
    }

    /**
     * Start the track {@link position} points at, fading it in
     *
     * @param fadeMs - How long it takes to come up
     */
    private startTrack(fadeMs: number): void {
        const definition = this.definition
        if (!definition || this.order.length === 0) return

        const index = this.order[this.position % this.order.length]
        // a single file loops on itself; a playlist runs each track once and is moved
        // on by COMPLETE, which never fires on a looping sound
        const loop = definition.files.length === 1

        const id = this.id!
        const sound = this.create(audioKey(this.bank, id, index), { loop, volume: 0 })
        if (!sound) return

        // the track that just ended is dropped before the next one starts, so a long
        // playlist doesn't leave a voice behind on every hand-over
        if (!loop) sound.once(Phaser.Sound.Events.COMPLETE, () => this.finish(sound, id))

        sound.play()

        this.voices.push({
            sound,
            id,
            // no fade means it is simply already up, rather than heading there at no speed
            level: fadeMs > 0 ? 0 : 1,
            target: 1,
            speed: fadeMs > 0 ? 1 / fadeMs : 0,
            volume: definition.volume,
        })
    }

    /**
     * A track played out. Let go of it, and put the next one on if this bed is still
     * playing the playlist that track came from
     *
     * @param sound - The track that ended
     * @param id - The entry it belonged to
     */
    private finish(sound: GameSound, id: string): void {
        const index = this.voices.findIndex(voice => voice.sound === sound)
        if (index >= 0) this.retire(index)

        // swapped out from under it while it played - the bed has moved on
        if (this.id !== id) return

        this.advance()
    }

    /** The playlist ended a track - on to the next one, reshuffling when it comes round */
    private advance(): void {
        const definition = this.definition
        if (!definition) return

        this.position += 1

        if (this.position >= this.order.length) {
            this.position = 0
            this.order = this.buildOrder(definition)
        }

        this.startTrack(definition.fadeMs ?? this.defaultFadeMs)
    }

    /**
     * Send everything currently on the bed on its way out
     *
     * @param fadeMs - How long they take to go - `0` stops them where they are
     */
    private fadeOutAll(fadeMs: number): void {
        for (let i = this.voices.length - 1; i >= 0; i--) {
            const voice = this.voices[i]

            if (fadeMs <= 0) {
                this.retire(i)
                continue
            }

            voice.target = 0
            voice.speed = voice.level / fadeMs
        }
    }

    /**
     * Stop a voice and let go of it
     *
     * @param index - Where it sits in {@link voices}
     */
    private retire(index: number): void {
        const [voice] = this.voices.splice(index, 1)
        voice.sound.stop()
        voice.sound.destroy()
    }

    /**
     * The order an entry's files are played in
     *
     * @param definition - Entry being played
     * @returns One index per file, shuffled if the entry asks for it
     */
    private buildOrder(definition: BedDefinition): number[] {
        const order = definition.files.map((_, index) => index)
        return definition.shuffle ? Phaser.Utils.Array.Shuffle(order) : order
    }
}
