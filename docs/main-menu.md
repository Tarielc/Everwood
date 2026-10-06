# Main Menu

`MainMenuScene` offers **ranked**, **platformer**, and **leaderboard** buttons. Ranked starts the arena's endless waves; platformer starts the Nether and leads to the final boss. The leaderboard opens over the paused menu and returns to it on Back.

The **About game modes** link below the buttons opens `ModeInfoPopup`, a native HTML `<dialog>` that compares the two modes. It explains arena survival, ranking by wave and kills, score submission after defeat, and the platformer's checkpoints and boss victory without leaderboard scoring. The **Controls** link alongside it opens `ControlsPopup`, with keyboard and touch bindings for movement, sprinting, jumping, attacks, weapon selection, and pausing. It also explains the second jump, variable jump height, and landing reset.

Both pop-ups share `MenuPopup`, which keeps keyboard focus inside and stops keyboard, mouse, pointer, touch, and wheel events from reaching Phaser's global listeners. This prevents clicks or taps on a dialog or its backdrop from activating menu buttons underneath, including when dismissing it. Native HTML button actions and scrolling still work. Dismiss either pop-up with **Got it**, **Escape**, or a click or tap outside it. On narrow screens the content columns stack; on short screens the dialog scrolls with touch gestures enabled.

Both dialogs follow `canvas.parentElement` on resize so they also work in Phaser's fullscreen wrapper. They are removed when the menu scene shuts down. The links use white text that turns yellow on hover, participate in the menu's existing scaled layout, and are hidden with the rest of the content while the leaderboard is open.
