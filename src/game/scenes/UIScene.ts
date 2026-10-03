import * as Phaser from 'phaser';
import { UI_SCALE_FACTOR } from '../config/display';
import { hudScale, onResize, safeArea } from '../utils/viewport';
import { UI_BUTTONS, UiButtonConfig } from '../config/ui';
import { AudioController, AudioEvent } from '../systems/audio/AudioController';
import type { AudioBus } from '../config/audio';
import { ATLAS, UI_FRAMES, UiFrame } from '../config/atlas';

/** Buses the sound button mutes together - everything that isn't music */
const SOUND_BUSES: readonly AudioBus[] = ["sfx", "ui", "ambience"]

/**
 * Scene where UI buttons and elements are displayed across different scenes
 *
 * Launches from MainMenuScene. Holds the buttons in the top right corner:
 * fullscreen toggle, mute music and mute sound, laid out right to left - or top
 * to bottom down the right edge when the view is portrait.
 */
export default class UIScene extends Phaser.Scene {

    /** toggle fullscreen button - absent where fullscreen isn't available */
    fullScreenButton?: Phaser.GameObjects.Image

    /** mute music button */
    musicButton: Phaser.GameObjects.Image

    /** mute sound effects, interface and ambience button */
    soundButton: Phaser.GameObjects.Image

    /** buttons in the order they are laid out, from the right edge inwards */
    private buttons: Phaser.GameObjects.Image[] = []

    /** set appropriate enter fullscreen button icon */
    private readonly onEnterFullscreen = () => {
        this.fullScreenButton?.setFrame(UI_FRAMES["fullscreen-exit"])
    }

    /** set appropriate exit fullscreen button icon */
    private readonly onLeaveFullscreen = () => {
        this.fullScreenButton?.setFrame(UI_FRAMES["fullscreen-enter"])
    }

    /** keep the audio icons in step with the mixer, whoever changed it */
    private readonly onMuteChanged = () => this.refreshAudioIcons()

    /**
     * Constructor
     * @param config buttons configuration
     */
    constructor(
        private config:UiButtonConfig = UI_BUTTONS
    ){
        super("UIScene")
    }

    /** Add the fullscreen and audio buttons */
    create() {
        this.buttons = []
        this.addFullScreenButton()
        this.addAudioButtons()

        onResize(this, (width, height) => this.layout(width, height))

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)
    }

    /**
     * Add fullscreen button to the screen.
     * Safari iOS doesn't support toggleFullscreen so we don't display anything at all
     */
    private addFullScreenButton() {
        if(!this.scale.fullscreen.available) return

        this.fullScreenButton = this.addButton("fullscreen-enter", () => {
            AudioController.instance.play("ui-click")
            this.scale.toggleFullscreen()
        })

        this.setButtonTextureToggle()
    }

    /**
     * Add mute music and mute sound buttons. Mutes are saved by the mixer,
     * so the icons start from whatever the player last left
     */
    private addAudioButtons() {
        const audio = AudioController.instance

        this.musicButton = this.addButton("music-on", () => {
            audio.toggleMute("music")
            audio.play("ui-click")
        })

        this.soundButton = this.addButton("volume-on", () => {
            const muted = !SOUND_BUSES.every(bus => audio.isMuted(bus))
            // click before muting, so turning sound off is still heard
            if (muted) audio.play("ui-click")
            for (const bus of SOUND_BUSES) audio.setMuted(bus, muted)
            if (!muted) audio.play("ui-click")
        })

        audio.on(AudioEvent.MuteChanged, this.onMuteChanged)
        this.refreshAudioIcons()
    }

    /**
     * Create an interactive button and add it to the row
     * @param icon - Starting icon
     * @param onClick - What pressing it does
     * @returns The button
     */
    private addButton(icon: UiFrame, onClick: () => void): Phaser.GameObjects.Image {
        // scaled by layout(), since how big it's drawn depends on the screen size
        const button = this.add.image(0, 0, ATLAS, UI_FRAMES[icon])

        const {width, height} = button
        const {hitRadiusScale} = this.config
        button
            .setInteractive(
                // grown evenly around the icon so it is easier to hit
                new Phaser.Geom.Rectangle(
                    -width * (hitRadiusScale - 1) / 2,
                    -height * (hitRadiusScale - 1) / 2,
                    width * hitRadiusScale,
                    height * hitRadiusScale
                ),
                Phaser.Geom.Rectangle.Contains
            )
            // pointerup rather than pointerdown - browsers only grant fullscreen on the release
            .on("pointerup", onClick)

        this.buttons.push(button)
        return button
    }

    /** Show the on or off icon for music and sound, from the mixer's mutes */
    private refreshAudioIcons() {
        const audio = AudioController.instance
        this.musicButton.setFrame(UI_FRAMES[audio.isMuted("music") ? "music-off" : "music-on"])
        this.soundButton.setFrame(UI_FRAMES[SOUND_BUSES.every(bus => audio.isMuted(bus)) ? "volume-off" : "volume-on"])
    }

    /**
     * Button needs to change texture
     * So we add eventlisteners for enter fullscreen and leave fullscreen
     */
    private setButtonTextureToggle(){
        this.scale.on(
            Phaser.Scale.Events.ENTER_FULLSCREEN,
            this.onEnterFullscreen
        )
        this.scale.on(
            Phaser.Scale.Events.LEAVE_FULLSCREEN,
            this.onLeaveFullscreen
        )
    }

    /**
     * Function to run onResize
     * @param width - New width
     * @param height - New height
     */
    private layout(width: number, height: number){
        const {margin} = this.config
        const inset = safeArea(this.scale)

        // the buttons grow and shrink with the view - their size and spacing follow
        const scale = hudScale(UI_SCALE_FACTOR, width, height)
        const ratio = scale / UI_SCALE_FACTOR
        const radius = this.config.radius * ratio
        const gap = this.config.gap * ratio

        const right = width - margin - inset.right - radius / 2
        const top = margin + inset.top + radius / 2
        const step = radius + gap

        // a portrait view has little width to spare - stack the buttons down the
        // right edge instead of along the top
        const portrait = height > width

        this.buttons.forEach((button, i) => button
            .setScale(scale)
            .setPosition(
                portrait ? right : right - i * step,
                portrait ? top + i * step : top,
            ))
    }

    /**
     * Phaser automatically runs `shutdown()` function on scene DESTROY and SHUTDOWN
     */
    shutdown(){
        this.scale.off(
            Phaser.Scale.Events.ENTER_FULLSCREEN,
            this.onEnterFullscreen
        )
        this.scale.off(
            Phaser.Scale.Events.LEAVE_FULLSCREEN,
            this.onLeaveFullscreen
        )
        if (AudioController.isReady) {
            AudioController.instance.off(AudioEvent.MuteChanged, this.onMuteChanged)
        }
    }
}
