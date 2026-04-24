# MMUO — Rebrand from Chromox

*Decided 2026-04-24. On-disk folder and package names migrate gradually; the product identity switches immediately.*

---

## The name

**Mmuo** (m-MUH-oh). Igbo for *spirit* / *masquerade* / *persona embodied*.

The Mmuo tradition across Igbo culture is a masquerade discipline — a performer dons a mask and voice and, through it, embodies an ancestral or spiritual identity. The mask does not replace the performer; it reveals a different face of them. The voice carried through it is treated as both inherited and improvised: inherited because the persona has a lineage; improvised because it answers to the moment.

This is **exactly** what the product does. A voice is captured, given form, and re-animated with new words while remaining unmistakably itself.

### Why Mmuo, not the alternatives

- **Dubplate** (Jamaican sound-system) — too narrowly DJ-coded; undersells the persona-forge dimension.
- **Duppy** (Jamaican patois, *ghost*) — strong metaphor but reads cheeky / jokey for a professional artist-tech surface.
- **Okwu** (Igbo, *word*) — beautiful but leans lyric-first when the product is voice-first.
- **Akala** (Yoruba, *immortal*) — has a specific artist association.

Mmuo fits because: *persona*, *mask*, *voice that carries lineage*, phonetically distinctive in English, no trademark conflicts in the artist-tech space, four letters, extends naturally across the diaspora (Ijaw and broader West African masquerade traditions share the concept).

---

## Immediate identity switch

| Surface | Old | New |
|---|---|---|
| Product name (marketing) | Chromox | Mmuo |
| Tagline | AI persona forge | Persona forge — clone a voice, write new words, same spirit |
| App shell (Tauri window title) | Chromox | Mmuo |
| Package marketing copy | Nebula Tone Network | Mmuo Persona Kernel |
| README top-level heading | CHROMOX | MMUO |
| Studio panel heading | Chromox Studio | Mmuo Studio |

Internal engine names (Chromatic-Core pipeline, Persona Synth Kernel) stay — they're infra, not brand.

---

## Migration plan

### Phase 0 — now
- New product identity live in docs.
- `MMUO.md` (this doc) captures the decision.
- No codebase renames yet — folder `/chromox`, package name `chromox`, Tauri bundle id, etc. stay put.

### Phase 1 — UI-only rebrand (same day)
- `src/App.tsx` top-of-window title + any visible copy → Mmuo.
- `README.md` top header + hero copy rewrite.
- Tauri `tauri.conf.json` window title, product name.
- No route changes, no API changes.

### Phase 2 — module rename (follow-up)
- `package.json` name field → `mmuo`.
- Tauri bundle identifier → `io.violet-sphinx.mmuo`.
- Internal `chromox_*` class / export names untouched unless they surface to the user.

### Phase 3 — full codebase rename (optional, later)
- Directory rename `/home/sphinxy/chromox` → `/home/sphinxy/mmuo`.
- Git history preserved via `git mv`.
- All sibling-app references (Krata, Ibis, Starforge CLAUDE.md ecosystem table) updated.

---

## Ecosystem position

Mmuo sits in the TASTE / Violet Sphinx ecosystem as:

> The persona-voice forge — clone a vocal (your Suno persona, an external acapella, a live stem), then rewrite its lyrics, repitch it, fix a bad take, or generate a whole new song in the same voice.

Dependencies:
- **Ibis** — metered lyric engine (`/api/meter/generate`) for BPM-synced lyric rewriting. Ibis's user-facing surface stays diasporic-tongue focused; only the internal metering endpoint is shared.
- **Suno API** — for persona lock when the original vocal came from Suno.
- **Kits AI / RVC / ElevenLabs / CAMB.AI** — for external-vocal cloning (existing adapters).

---

## The vocal-regen flow (the killer feature)

1. User uploads an acapella or imports a Suno persona.
2. Mmuo detects BPM (Essentia / librosa).
3. Forced alignment (WhisperX / Deepgram — existing transcription ensemble) builds a per-syllable timing grid.
4. Grid is sent to **Ibis's `/api/meter/generate`** with the user's prompt ("rewrite this line about the city at night") and the original lyrics for rhyme-scheme preservation.
5. Ibis returns lyrics that scan to the exact syllable-per-beat budget of the original.
6. **Suno adapter** (`persona_id:<id>[|seed:<n>]`) or one of the voice-clone providers regenerates the audio with the new lyrics.
7. For partial fixes, the `inpaint` path regenerates only the flagged section, preserving everything around it.

Endpoints landed in this commit:
- `POST /api/vocal-regen/rewrite` — full replacement, same persona
- `POST /api/vocal-regen/fix-section` — inpaint a start/end window
- `POST /api/vocal-regen/meter-only` — just the Ibis lyric pass, no audio render

---

## Naming convention for persona voice models

When a user imports a Suno-generated track, Mmuo stores the voice reference as:

```
persona_id:<suno_persona_id>[|seed:<seed>]
```

The `voiceModel` string on every `ProviderRequest` carries this format for Suno personas. Clone-provider voices (Kits / RVC / ElevenLabs) keep their existing opaque id format — the Suno provider parses + rejects non-Suno voice models with a clear error.

---

## What stays

- The Nebula Tone Network DSP stack and every existing provider adapter.
- The Chromox Studio UI layout (sliders, meter, dropzone, lyrics editor).
- The entire backend service graph (persona, render, voice clone, folio, genome, reliquary, photos).
- All of the IBIS public app copy, which never mentions Chromox or Mmuo and stays focused on diasporic-tongue lyric writing.

The masquerade wears the tools. Nothing underneath changes.
