import * as Phaser from 'phaser';
/** Global event bus, used for between scene communication on health change */
export const EventBus = new Phaser.Events.EventEmitter()