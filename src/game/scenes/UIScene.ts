import * as Phaser from 'phaser';
import { UI_SCALE_FACTOR } from '../config/display';
import { onResize, safeArea } from '../utils/viewport';
import { UI_BUTTONS, UiButtonConfig } from '../config/ui';

export default class UIScene extends Phaser.Scene {

    fullScreenButton: Phaser.GameObjects.Image

    private readonly onEnterFullscreen = () => {
        this.fullScreenButton.setTexture("fullscreen-exit")
    }

    private readonly onLeaveFullscreen = () => {
        this.fullScreenButton.setTexture("fullscreen-enter")
    }

    constructor(
        private config:UiButtonConfig = UI_BUTTONS
    ){
        super("UIScene")
    }

    /** Only functionality for this scene is to add fullscreen button */
    create() {
        this.addFullScreenButton()
    }
    
    /**
     * Add fullscreen button to the screen.
     * Safari iOS doesn't support toggleFullscreen so we don't display anything at all
     */
    private addFullScreenButton() {
        if(!this.scale.fullscreen.available) return
        this.fullScreenButton = this.add.image(0, 0, "fullscreen-enter").setScale(UI_SCALE_FACTOR)
        console.log("Done")

        const {width, height} = this.fullScreenButton
        this.fullScreenButton
            .setInteractive(
                new Phaser.Geom.Rectangle(
                    0,
                    0,
                    width * this.config.hitRadiusScale,
                    height * this.config.hitRadiusScale
                ),
                Phaser.Geom.Rectangle.Contains
            )
            .on("pointerup", ()=> {
                this.scale.toggleFullscreen()
            })

        this.setButtonTextureToggle()

        onResize(this, (witdth, height) => this.layout(witdth, height))
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
        const {radius, margin} = this.config
        const inset = safeArea(this.scale)

        const right = width - margin - inset.right - radius / 2
        const top = margin + inset.top + radius / 2
        
        this.fullScreenButton.setPosition(right, top)

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
    }
}