# Canopy Game Integration Guide

How to drop an exported `.score.js` into a web game and drive its adaptive
behavior. This is the counterpart to `songAuthoringGuide.md` (how songs are
authored) and `dynamicsConvention.md` (the formal v7 reactive contract). It is
written so it can be handed to an LLM or a developer who has never seen the
Canopy studio.

---

## 1. What you get

The studio exports two things (the Phase 5 split — **data** and **engine** are
no longer duplicated per song):

1. **`name.score.js`** — DATA ONLY. Just `export const score = {…}` (the
   schema-versioned song — layers, journey, reactive axes, verses, space,
   custom instruments). No Tone import, no engine, ~the song JSON.
2. **`scoreEngine.js`** — the SHARED engine. One copy per game. It imports Tone
   once, embeds the synth-graph builders, the 16-step sequencer, and the
   reactive-dynamics decision core (spliced verbatim from the studio's shared
   core, guarded by a parity test), and exports a single factory:

   ```js
   import * as Tone from "tone";
   export function createScoreEngine(score) { /* ... */ }
   ```

Wire them together once:

```js
import { score } from "./music/battlefield.score.js";
import { createScoreEngine } from "./scoreEngine.js";   // vendored once per game
const music = createScoreEngine(score);
```

**Dependency:** `tone` (npm) — installed once for the game. `score.js` never
imports it; only `scoreEngine.js` does.

**Public API (stable, consumed by shipped games; live on the runtime instance):**

| Method (on the runtime) | Signature | Purpose |
|---|---|---|
| `music.startScore` | `async () => void` | Unlock audio, build the graph, start looping. Idempotent-ish: safe to call again after `stopScore`. |
| `music.stopScore` | `() => void` | Stop transport and reset to bar 0. Nodes stay alive for a fast restart. |
| `music.setGameAxes` | `(axes: { intensity?, tension?, brightness? } \| null) => void` | Steer the three reactive axes. `null` resets to a neutral default. Eased in at each bar boundary. |
| `music.getRuntimeInfo` | `() => { playing, bar, liveAxes, axisTarget, sectionId }` | Read-only snapshot — bar count, eased live axes, the axis target, current verse id. Additive. |
| `music.disposeScore` | `() => void` | Free everything. Call on scene teardown / permanent unload. |

> **Note:** where the rest of this guide writes `startScore()`,
> `setGameAxes(...)`, etc., read it as `music.startScore()`,
> `music.setGameAxes(...)` — the API lives on the runtime returned by
> `createScoreEngine(score)`.

## 2. Minimal integration

```js
import { score } from "./music/battlefield.score.js";
import { createScoreEngine } from "./scoreEngine.js";

const music = createScoreEngine(score);

// Browsers require a user gesture before audio can start — call this from
// the first click/keypress, or your "press to start" screen.
startButton.addEventListener("click", () => {
  music.startScore(); // async internally; fire-and-forget is fine
});
```

That's all that's required for non-adaptive playback. The score loops its
two-bar phrase forever, follows its own journey curve, rests windows, and
seeded variation without any per-frame input from the game.

## 3. Driving adaptivity

### The state model

The music runs three continuous axes — `intensity`, `tension`, `brightness`
(0..1). **You steer these directly** with `setGameAxes`; there are no built-in
"mood presets" in the engine, and the game owns what a "state" means. At each
bar boundary the live axes ease half the remaining distance toward your target,
so transitions take ~2 bars and never jump mid-chord.

The engine exposes a single low-level control; your game wraps it in whatever
state vocabulary makes sense for it:

```js
// A combat-heavy game defines its own states on top of setGameAxes.
function setMusicState(state) {
  switch (state) {
    case "combat":  music.setGameAxes({ intensity: 1, tension: 1, brightness: 0.35 }); break;
    case "unease":  music.setGameAxes({ intensity: 0.55, tension: 0.5, brightness: 0.55 }); break;
    case "explore": music.setGameAxes({ intensity: 0.3, tension: 0.25, brightness: 0.7 }); break;
  }
}

// A cosy game never needs combat —
function playRomanticMusic() {
  music.setGameAxes({ brightness: 1, intensity: 0.8, tension: 0.15 });
}
```

`setGameAxes` merges a partial object over the current target, so you can steer
one axis at a time (`music.setGameAxes({ tension: 0.9 })`) or all three at once.
Pass `null` to ease back to a neutral default
(`{ intensity: 0.3, tension: 0.25, brightness: 0.7 }`).

**Bar-quantized, by design.** Because changes land at the next bar boundary,
expect up to ~2 bars of latency at slow tempos (at 76 BPM a bar is ≈ 3.2 s).
Don't fight it by calling every frame with rapidly changing values. Instead
smoothe the game's own input into a target and only push when it moves enough:

```js
// Per frame (or on change): feed a smoothed 0..1 value, then steer an axis.
// Add hysteresis so lingering near a threshold doesn't thrash.
function updateMusic(dt, playerHealth, enemiesNearby) {
  const target = Math.min(1, enemiesNearby * 0.25 + (1 - playerHealth) * 0.4);
  smoothedThreat += (target - smoothedThreat) * Math.min(1, dt * 2);
  const band = smoothedThreat > 0.75 ? 1 : smoothedThreat > 0.35 ? 0.5 : 0;
  if (band !== lastBand) {
    lastBand = band;
    music.setGameAxes({ intensity: band, tension: band * 0.9 });
  }
}
```

### SFX and one-shots

The engine does not play one-shot "music events" (flourishes were removed).
Games should trigger their own, more timely SFX when a milestone lands. Tie
the music to the same moment with an axis nudge if you want the score to react:

```js
function onVictory() {
  myVictoryFanfare.play();          // your own, sample-accurate SFX
  music.setGameAxes({ brightness: 1, intensity: 0.9 }); // lift the score
}
```

## 4. Lifecycle

- **Scene start:** `await startScore()` (or fire-and-forget after a gesture).
  Reuses the existing graph after a `stopScore`, rebuilds only after
  `disposeScore`.
- **Pause menu:** there is no dedicated pause API, but the underlying
  transport is reachable: `Tone.getTransport().pause()` suspends playback and
  `.start()` resumes it **mid-loop** (the runtime keeps its own step counter
  frozen while paused). If you'd rather restart predictably from the top of
  the loop, use `stopScore()` + `startScore()` instead — deterministic when
  the song has a non-zero seed.
- **Scene teardown / level unload:** always `disposeScore()` to release Web
  Audio nodes. Starting a different song: `disposeScore()` the old module's
  score, then dynamically `import()` the next `.score.js` and `startScore()`.
- **Tab visibility:** the transport keeps scheduling while backgrounded;
  browsers may throttle timers, which manifests as rhythmic stutter, not
  breakage. Consider pausing on `document.visibilitychange` if you care.

## 5. Mixing with game audio

The score manages its own internal gain staging (per-layer volumes, glue
compression, limiter at −1 dBFS) and outputs straight to the destination.
To balance against SFX, wrap it:

```js
import * as Tone from "tone";
Tone.Destination.volume.value = -6; // affects ALL audio incl. SFX if shared
```

If SFX run through their own (non-Tone) audio pipeline, put Tone's output on
its own bus by setting `Tone.Destination.volume` for ducking under dialogue
(e.g. ramp to −12 dB during voiceover, back afterward). Duck smoothly with
`Tone.Destination.volume.rampTo(-12, 0.3)`.

## 6. Determinism & testing

- If the song's `variationSeed` is > 0, every playthrough of a session is
  identical given the same sequence of `setGameAxes` calls — useful for
  golden-path QA recordings and rhythm-sensitive sections.
- Seed 0 means each playthrough varies. Both are valid; competitive/roguelike
  games often prefer seeded.
- Because transitions are bar-quantized, automated tests should advance time
  in whole bars (or stub `Tone.getTransport()`) when asserting axis changes.

## 7. Known limits (as of schema v7)

- Axes are not a per-frame fader: `setGameAxes` eases in at bar boundaries.
  Steer a target, not a per-tick value.
- Tempo never changes during playback (v5 removed tempo modulation). If your
  old v4 song sped up with intensity, re-export it: intensity now expresses
  itself through loudness, density, percussion and the shared atmosphere.
- There is no one-shot flourish API anymore (removed in v7) — play your own SFX.
- One score instance per page is the supported shape (module-level state).
- No pause/resume in the public API (see §4 for workarounds).
- The runtime cannot load external samples; all sounds are synthesized, so
  first `startScore()` has a short graph-build cost (a few ms) plus Tone
  Reverb impulse generation (~100 ms). Pre-warm during a loading screen by
  calling `startScore()` immediately followed by `stopScore()` if you need
  sample-accurate first notes.

---

## Quick reference card

```js
import { score } from "./your-song.score.js";
import { createScoreEngine } from "./scoreEngine.js";
const music = createScoreEngine(score);

// loading screen (pre-warm)
await music.startScore(); music.stopScore();

// gameplay start (after user gesture)
await music.startScore();

// adaptive steering (your own states -> axes, eased in at bar boundaries)
music.setGameAxes({ intensity: 0.3, tension: 0.25, brightness: 0.7 }); // calm
music.setGameAxes({ tension: 0.9 });                                  // spike tension only
music.setGameAxes(null);                                              // reset to neutral

// read live state (HUDs, logging)
const info = music.getRuntimeInfo(); // { playing, bar, liveAxes, axisTarget, sectionId }

// teardown
music.disposeScore();
```
