# Canopy — Generative Score Studio

A browser-based generative/adaptive music studio for game developers who are
not musicians. Compose a two-bar score constrained to a key + scale, preview
it live, simulate adaptive game states (`explore` / `unease` / `combat` plus
a one-shot victory flourish), and export three ways:

- `.canopy.json` — editable project (re-importable)
- `.score.js` — standalone Tone.js runtime module to drop into a web game
- `.mid` — MIDI sketch for a DAW

## Stack

Plain JavaScript, CSS, and HTML. No framework, no bundler, no npm.
Tone.js and @tonejs/midi are vendored as UMD globals in `vendor/`.

## Run it

Serve the project root with any static server — e.g. the VSCodium **Live
Server** plugin — and open `index.html`.

If you edit markup, keep `index.html` fresh: it is generated from
`index.template.html` plus the partials in `src/partials/`.

```bash
python3 dev/scripts/build.py           # stitch once
python3 dev/scripts/build.py --watch   # re-stitch on every edit
```

## Checks

```bash
python3 dev/scripts/check_imports.py   # import resolution + symbol + boundary check
```

Exit code is non-zero if any relative import fails to resolve or any named
import refers to a missing export. The layer-boundary report is informational.

See `dev/docs/systemArchitecture.md` for the layout, layer rules, and
invariants (harmony guard, bar-boundary transitions, schema stability).
