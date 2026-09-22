# Audio Controller

`AudioController` is the game's mixer. Everything audible goes through it, and nothing anywhere else touches a volume: a scene says *what happened*, and the controller decides what that is worth hearing at.

[Source: AudioController.ts](/src/game/systems/audio/AudioController.ts)
[Source: AudioBed.ts](/src/game/systems/audio/AudioBed.ts)
[Bank: audio.ts](/src/game/data/audio.ts)
[Config: audio.ts](/src/game/config/audio.ts)

## One Mixer, Owned by the Game

`BootScene.preload()` calls `AudioController.init(this.game)` once, and everything after reaches it through `AudioController.instance`. It is deliberately not a scene and not a component:

- it runs on `Phaser.Core.Events.PRE_STEP`, the game's own step, so a level change - which is a scene restart - can't cut a track off mid-fade or strand a timer
- Phaser's sound manager is game-wide already, so the sounds outlive a scene whether or not anything is managing them
- the player's volumes belong to the player, not to whichever level they happen to be standing in

`AudioController.load(this.load)` in `PreloadScene` queues the whole bank off the registries, the same way the foe and item sheets are queued off theirs.

## The Bank

`data/audio.ts` is where a sound is *authored*; a caller only ever says when to play it.

- `SOUNDS` - every effect, keyed by `SoundId`. An entry names its files, its level in the mix, its channel, and its limits
- `MUSIC` - music beds, keyed by `MusicId`
- `AMBIENCE` - ambience beds, keyed by `AmbienceId`

An entry with several files means two different things by design: for a sound, they are **variations** - picked at random and never the same one twice in a row, which is what keeps two takes of a grunt from sounding like one; for a bed, they are a **playlist**, optionally shuffled, played one after another.

`audioKey()` builds the cache key (`sound:player-hurt:1`) and `audioPath()` the URL, both from the entry. The loader and the controller go through the same two functions, so renaming a sound can't quietly leave the game playing nothing - and `audioPath()` encodes, which is what makes `music/Action 1.mp3` load.

Adding a sound is an entry in `SOUNDS` and a call to `play()`. Nothing else.

## Buses

Five of them: `master`, `music`, `ambience`, `sfx`, `ui`. Each carries a volume and a mute, and what a sound actually plays at is

```
entry volume  ×  what the caller asked for  ×  bus  ×  master  ×  (beds only) duck
```

`setVolume()`, `setMuted()` and `toggleMute()` apply to everything already playing and save to `localStorage` under `AUDIO.storageKey` - so an options menu is sliders wired to those three calls and nothing more. A muted bus keeps its volume, so unmuting puts it back where the player left it. `AudioEvent.VolumeChanged` and `AudioEvent.MuteChanged` let a menu follow along rather than poll.

Saving and reading back both swallow their own errors: private browsing is not a reason to stop the game.

## Sound Effects

`play(id, options?)` plays one. It does nothing at all - deliberately, silently - when:

- the sound is inside its **throttle** window (`throttleMs`, defaulting to `AUDIO.throttleMs`). A frame that reports four hits plays one impact, not four stacked copies of it
- its bus is muted or at zero, which saves the voice and the decode
- its file never loaded, which warns once per key rather than on every swing

**Voices** are capped per sound (`maxVoices`), and the oldest is stolen when a new one won't fit - the oldest being the one furthest through, and so the least missed. **Pitch jitter** (`rateJitter`) plays each copy a little either side of normal speed.

`playAt(id, x, y, options?)` is the same thing placed in the world: thinned out by its distance from the listener, panned to the side it happened on, and **dropped outright** past `spatial.maxDistance` rather than played at nothing. `GameScene` sets the listener to the player, so the arena is heard from where the player is standing. With no listener set, everything plays flat.

## Beds

A bed is the looping layer underneath everything, and there are two: music and ambience. `AudioBed` is one class pointed at two registries.

- `playMusic(id)` / `playAmbience(id)` swap what is on the bed, **crossfading** rather than cutting
- asking for what is already playing does nothing, so a scene can say what it wants on every `create()` without restarting the track every time the level restarts
- a single-file bed loops on itself; a playlist runs each track once, drops it, and moves on to the next, reshuffling when it comes round
- `null` stops the bed

A bed owns no volume of its own. Every frame it asks the controller what its channel is currently worth, so a slider moved mid-fade lands on the very next frame.

Levels name their own beds - `LevelDefinition.music` and `.ambience` - and `GameScene.startLevelAudio()` asks for them on create. The wood gets the ambient tracks and birdsong, the arena gets the drums and a crowd.

## Ducking

A `SOUNDS` entry with `duck` dips music and ambience while it plays, so a death or a wave fanfare is heard *over* the music rather than through it. The dip lasts the sound's own length plus `AUDIO.duckHoldMs`, and overlapping ducks take the deepest of them and the longest hold - a fanfare during a death can't lift the music back up halfway through. `duck(amount, holdMs)` does the same by hand.

## Being Locked Out

A browser gives no audio at all until the page has been clicked on. The menu asks for its music well before that, so the controller remembers what was asked for and puts it on the moment `Phaser.Sound.Events.UNLOCKED` arrives - which, in practice, is usually the press of the start button.

One-shots fired before that first gesture are simply dropped. There are none.

## What Currently Makes a Noise

| Where | What |
| --- | --- |
| `PlayerStates` | the swing (whichever item is in hand), the jump, the landing, the flinch, the death |
| `Player` | the low-health warning, on crossing `LOW_HEALTH_RATIO` rather than on every hit below it |
| `Foe` | whatever its definition's `sounds` names - the warrior's swing, the archer's draw and loose - played at the foe |
| `Projectile` | the impact its definition names, played where it landed |
| `GameScene` | the wave landing, the wave cleared, the heal between waves |
| `MainMenuScene` / `UIScene` | the menu's music and town ambience, and the button clicks |

A foe, an item or a projectile makes a noise by naming one in its data entry. Nothing in those classes needs touching to give a new foe a voice.

## Adding Sound to Something New

1. Drop the file under `public/assets/audio/`
2. Add an entry to `SOUNDS` - its files, its channel, how loud it sits, and any jitter or limits it needs
3. Call `AudioController.instance.play("your-id")`, or `playAt()` if it happens somewhere in particular

For a new bed, the same, but in `MUSIC` or `AMBIENCE`, and name it on the level that should be played under it.

## Ownership and Cleanup

The controller registers itself against the game's `DESTROY` event and unhooks its step listener, its beds and every tracked voice when that fires. A finished one-shot is released and destroyed by its own `COMPLETE`, which is exactly what Phaser's own `sound.play()` does - nothing accumulates in the sound manager.

`AudioController.init()` destroys a previous instance before building a new one, so a hot reload doesn't leave two mixers fighting over the same tracks.
