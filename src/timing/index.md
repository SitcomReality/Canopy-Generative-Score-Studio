# Timing Engine API Reference

The studio has **one** timing authority: `src/timing/index.js`. Every timed
thing in the app — musical scheduling, UI animation coalescing, one-off waits,
repeating polls — routes through this engine. Never use raw `setTimeout`,
`setInterval`, or `requestAnimationFrame` anywhere outside this module.

The engine is an **audio-clock** scheduler. Musical position is a pure function
of audio time, never a running counter. This is the change that eliminates the
old drift: `audio/audio-engine.js` used to run a shared
`Tone.Transport.scheduleRepeat` step loop with an internal `stepIndex` counter,
and the exported `.score.js` runtime still does. Counter-derived position is a
side effect of control flow; here position is `musicalOrigin + (t - audioOrigin) × rate`.

---

## Two collaborating halves

`index.js` composes `./core.js` (pure arithmetic) and `./timer-service.js`
(task queue) behind one public API.

| Half | Owner | Role |
|---|---|---|
| Pure timing core | `./core.js` | baseline mapping, lookahead windows, due-step selection, pause/tempo/seek/loop re-anchor math, gate evaluation. Tone/DOM-free. |
| Timer service | `./timer-service.js` | absolute-fire-time task queue: id handles, cancel-by-flag, lazy sort, reschedule. Tone/DOM-free. |
| Audio host | `./index.js` | the real `Tone.now()` clock, the one coarse ticker, the public API, the lookahead dispatch loop. |

The engine owns **when** (the audio↔musical baseline, lookahead windows, the
ticker) and **whether** (per-layer gates for mute/solo). The app owns **what**:
one step source (the sequencer) computes and realizes each step; it consults
`isLayerAudible()` at the emission boundary so a muted layer's RNG stream is
still consumed (mute is gate-only, never generation).

---

## Public API

```js
import { getTimingEngine } from "../timing/index.js";
const eng = getTimingEngine(); // app-wide singleton, same one for playback + UI timers
```

### Musical transport

```js
eng.registerStep({ onEvents, onPause }); // the sequencer plugs in here
eng.play();       // cold start from musical origin 0 (call AFTER Tone.start())
eng.pause();      // hold position; revoke the lookahead; release in-flight voices
eng.resume();     // re-anchor on-grid and continue from the held position
eng.stop();       // reset to origin, return to bar 0 — distinct from pause
eng.dispose();    // full teardown, idempotent (tests / track switches)
```

`onPause` is called on both pause and stop so a source can release sustained
voices. The step source is called per due step with
`{ step, bar, when }` where `when` is an **absolute audio-context start time**
(seconds). A throwing step source is caught and logged; other steps and layers
keep going.

### Gates (mute / solo) — gate-only, never timing or RNG

```js
eng.setLayerEnabled(layerId, false); // mute
eng.setLayerSolo(layerId);           // solo: compose effective gate = enabled ∧ ¬otherSoloed
eng.clearSolo();
eng.isLayerAudible(layerId);         // consulted by the step source at the emission boundary
```

A toggle never cancels, restarts, rebuilds, re-anchors, or alters what is
generated. It only filters whether events hand off to voices. Because
generation is unconditional, a muted layer keeps consuming its seeded RNG
share — muting/unmuting one layer never re-rolls any other layer's
humanize/variation draws.

### Tempo / swing / seek

```js
eng.setTempo(bpm);   // deferred; re-anchors at the next half-bar boundary (no mid-chord ramp)
eng.setSwing(ratio); // 0 = straight; delays off-beat 8ths (odd steps)
eng.setPosition(musicalPos); // re-anchor to an arbitrary musical position (no UI yet)
```

A tempo change captures `(t, pos)` at the boundary, sets the new `musicalRate`,
and recomputes `audioOrigin` so position stays continuous. Notes already
emitted in the lookahead past the change keep their old (bounded) timing — that
is the documented choice; position self-heals from the audio clock.

### Queries

```js
eng.position();   // { step: 0..15, bar } from audio time, or the held position while paused
eng.audioNow();   // the audio-context clock, in seconds
eng.tempoNow();   // the current (or deferred) BPM
eng.bpm();        // the last committed BPM
```

### Timer service (app-wide timers)

```js
const id = eng.setTimeout(fn, ms);
eng.clearTimeout(id);
const id2 = eng.setInterval(fn, ms);
eng.clearInterval(id2);
await eng.wait(ms);
const stop = eng.onFrame(fn); // rAF-backed frame ticker; stop() deregisters
```

Registering any timer starts the shared ticker lazily, so UI timers run even
before playback begins. The ticker's periodic pass drains the timer service
**first** (always), then runs musical lookahead dispatch (only while playing and
the AudioContext is running).

---

## Rules

1. **No raw browser timers** anywhere outside `src/timing/index.js`. The ticker
   uses `window.setInterval`/`window.requestAnimationFrame` and is the one
   allowed dispenser. Grep for `setTimeout|setInterval|requestAnimationFrame`
   — they must appear only here (and in the recording worklet, below).
2. **The time base is the audio clock** (`Tone.now()` / `AudioContext.currentTime`),
   never `performance.now()`, `Date.now()`, rAF frames, or accumulated interval
   counts.
3. **Musical position is a pure function of audio time.** The baseline is the
   tuple `{ audioOrigin, musicalOrigin, musicalRate }` (`musicalRate =
   bpm/60`); it is never just `(start, start)`. No counter advances the beat.
4. **Mute/solo/enable is a gating operation only.** It filters realization at
   the emission boundary; it never cancels, restarts, rebuilds, re-anchors, or
   alters generation.
5. **Errors never stop the clock.** A throwing step source or timer task is
   caught, logged, and skipped; all other due work in the same pass still runs.
6. **Pause revokes the lookahead.** Stop ticking musical dispatch, release
   in-flight voices, then re-anchor on resume so the musical position is exact
   and no event double-triggers.
7. **Tempo changes apply at a bar boundary** (step 0 or 8) via re-anchor —
   never a mid-playback ramp.
8. **The loop point is engine-level.** `positionFrame()` re-anchors by modulo
   (16 steps); layer adapters never special-case the wrap.
9. **`dispose()` is idempotent and thorough** — stops the ticker, revokes the
   lookahead, clears queues, frees voices, clears gates. Safe even if a previous
   dispose was interrupted or raced an in-flight `triggerAttackRelease`.
10. **Never read or schedule from `AudioContext.currentTime` while suspended.**
    `play()` is called after `Tone.start()`; `clockReady()` gates musical
    dispatch on the context being `running`.

## Intentional exception

The MP3/WAV recording path (`src/audio/recorder.js` and its inline
AudioWorklet) captures PCM on the **audio thread** and is intentionally **not**
folded into the engine's timer authority. It declares no JS timers. It is the
one documented exception to Rule 1 and is left functioning untouched.

## Out of scope (deferred)

The emitted `.score.js` runtime (`src/music/runtime-module/parts/transport-api.js`)
still uses its own `Transport.scheduleRepeat` step loop and a step counter. It is
a separate runtime consumed by games, and will be rebuilt on the engine when the
pure-data export format lands. It is the sole remaining raw-timer site in the
repo.

---

## The engine's own tests

`dev/tests/timing-engine.test.js` (pure core) and `dev/tests/timing-host.test.js`
(real host vs. injected clock) map the brief's edge cases:

| §5 case | Test |
|---|---|
| 1 toggle storms / RNG-neutral mute | `gate-only emission`, `computeStepFrame is RNG-neutral to muted` |
| 2 play-head re-entry / stop≠pause | `snappedPosition`, `pause holds position … stop resets` |
| 3 tempo change continuity | `retempoAt`, `tempo change re-anchors at a boundary` |
| 4 stall / self-heal | `dueSteps … after a long stall` |
| 5 looping wrap | `positionFrame re-anchors via modulo` |
| 6 dispose / throwing | `a throwing step source is isolated`, `dispose is idempotent` |

`dev/tests/score-timing.test.js` (the per-voice ordering guard) and
`dev/tests/dynamics-parity.test.js` (the spliced decision core matches the
source) remain untouched and green.
