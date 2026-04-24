import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { SunoProvider } from '../services/provider/sunoProvider';

/**
 * Vocal regeneration orchestrator (Chromox's "rewrite this bit, same voice")
 *
 * Three moves the user can make against a persona-locked vocal:
 *
 *   1. POST /api/vocal-regen/rewrite
 *        Replace the whole vocal with new lyrics in the same persona
 *        voice. Body: { personaVoiceModel, sourceAudioPath, prompt,
 *        language?, bpm?, preserveRhyme? }
 *        Returns: { audioPath, newLyrics }
 *
 *   2. POST /api/vocal-regen/fix-section
 *        Inpaint a segment (start/end in seconds) with new lyrics.
 *        Used for "fix this word" / "fix this bad take". Body:
 *        { personaVoiceModel, sourceTrackId, startSec, endSec, prompt,
 *          originalLyrics, bpm }
 *        Returns: { audioPath, newLyrics }
 *
 *   3. POST /api/vocal-regen/meter-only
 *        Just the lyric side - pulls Ibis's metered lyric generator.
 *        Useful when the user wants to see the new lyrics before
 *        committing to the synth render. Body: { meterGrid, prompt,
 *          language?, bpm?, preserveRhyme? }
 *        Returns: { lyrics, raw_text, in_spec }
 *
 * Persona selection convention:
 *   - Suno-origin tracks: voiceModel = "persona_id:<id>[|seed:<n>]"
 *     → routes to SunoProvider.
 *   - External (non-Suno) acapellas: voiceModel identifies a Kits /
 *     RVC / ElevenLabs clone.  Those flows already exist; this route
 *     is Suno-specialised. A follow-up can unify.
 */

const router = Router();
const suno = new SunoProvider();

const IBIS_URL = process.env.IBIS_URL || 'http://localhost:3040';
const IBIS_INTERNAL_KEY = process.env.IBIS_INTERNAL_KEY || '';

interface MeterSlot {
  beat: number;
  syllables: number;
  word?: string;
}

interface IbisResponse {
  lyrics: { beat: number; word: string; syllables: number }[];
  raw_text: string;
  grid_syllables: number;
  output_syllables: number;
  in_spec: boolean;
  error?: string;
}

async function callIbisMeter(args: {
  meterGrid: MeterSlot[];
  prompt: string;
  language?: string;
  bpm?: number;
  preserveRhyme?: boolean;
  originalLyrics?: string;
}): Promise<IbisResponse> {
  const resp = await fetch(`${IBIS_URL.replace(/\/$/, '')}/api/meter/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(IBIS_INTERNAL_KEY ? { 'X-Api-Key': IBIS_INTERNAL_KEY } : {}),
    },
    body: JSON.stringify({
      meter_grid: args.meterGrid,
      prompt: args.prompt,
      language: args.language || 'english',
      bpm: args.bpm,
      preserve_rhyme_scheme: args.preserveRhyme !== false,
      original_lyrics: args.originalLyrics,
    }),
  });
  const data = (await resp.json()) as IbisResponse;
  if (!resp.ok) {
    throw new Error(`Ibis meter failed (${resp.status}): ${data.error || 'unknown'}`);
  }
  return data;
}

/**
 * Forced alignment stub. Chromox already has WhisperX / Deepgram /
 * AssemblyAI / Rev.ai transcription services in backend/src/services/
 * - transcriptionEnsemble.ts is the aggregator. This orchestrator
 * leans on whichever is wired.
 *
 * Expected return: per-syllable timing which we convert to a beat grid
 * using the detected BPM.
 */
async function alignToMeter(
  audioPath: string,
  bpm: number
): Promise<MeterSlot[]> {
  // Call the ensemble endpoint if available, else fall back to a naive
  // implementation that assumes 1 syllable per 0.5 beat.
  try {
    const { transcribeWithAlignment } = await import(
      '../services/transcriptionEnsemble.js'
    );
    const align = await (transcribeWithAlignment as unknown as (
      p: string
    ) => Promise<{
      words: Array<{ word: string; start: number; end: number }>;
    }>)(audioPath);
    const grid: MeterSlot[] = [];
    const beatSec = 60 / bpm;
    for (const w of align.words || []) {
      const beat = Math.round((w.start / beatSec) * 4) / 4; // quarter-beat granularity
      const syllables = Math.max(1, countSyllables(w.word));
      grid.push({ beat, syllables, word: w.word });
    }
    return grid;
  } catch {
    // Fallback: read duration, assume 4 syllables per bar. Good enough
    // for unit testing; the real alignment ensemble is what ships.
    return [];
  }
}

function countSyllables(word: string): number {
  if (!word) return 1;
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1;
  const matches = w.match(/[aeiouy]+/g);
  return Math.max(1, matches ? matches.length : 1);
}

// POST /api/vocal-regen/rewrite -------------------------------------------
router.post('/rewrite', async (req: Request, res: Response) => {
  try {
    const {
      personaVoiceModel,
      sourceAudioPath,
      prompt,
      language,
      bpm,
      preserveRhyme,
      originalLyrics,
    } = req.body as {
      personaVoiceModel: string;
      sourceAudioPath: string;
      prompt: string;
      language?: string;
      bpm?: number;
      preserveRhyme?: boolean;
      originalLyrics?: string;
    };

    if (!personaVoiceModel || !prompt) {
      return res
        .status(400)
        .json({ error: 'personaVoiceModel and prompt required' });
    }

    const tempo = bpm && bpm > 0 ? bpm : 120;
    const meterGrid = sourceAudioPath
      ? await alignToMeter(sourceAudioPath, tempo)
      : [];

    // If alignment returned nothing (no audio or provider missing), we
    // need at least a minimal grid so Ibis has something to work with.
    const fallbackGrid: MeterSlot[] = meterGrid.length > 0
      ? meterGrid
      : Array.from({ length: 16 }, (_, i) => ({
          beat: i * 0.5,
          syllables: 2,
        }));

    const ibis = await callIbisMeter({
      meterGrid: fallbackGrid,
      prompt,
      language,
      bpm: tempo,
      preserveRhyme,
      originalLyrics,
    });

    const newLyricsText = ibis.raw_text;
    const out = await suno.synthesize({
      voiceModel: personaVoiceModel,
      lyrics: newLyricsText,
      controls: {},
      beatGrid: tempo ? { bpm: tempo, beats: [] } : undefined,
    });

    const outPath = path.join(
      '/tmp',
      `chromox-regen-${Date.now()}.${out.format}`
    );
    fs.writeFileSync(outPath, out.audioBuffer);

    res.json({
      audioPath: outPath,
      newLyrics: ibis.lyrics,
      rawText: newLyricsText,
      inSpec: ibis.in_spec,
      bpm: tempo,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'rewrite failed';
    res.status(500).json({ error: msg });
  }
});

// POST /api/vocal-regen/fix-section ---------------------------------------
router.post('/fix-section', async (req: Request, res: Response) => {
  try {
    const {
      personaVoiceModel,
      sourceTrackId,
      startSec,
      endSec,
      prompt,
      originalLyrics,
      bpm,
      language,
      preserveRhyme,
    } = req.body as {
      personaVoiceModel: string;
      sourceTrackId: string;
      startSec: number;
      endSec: number;
      prompt: string;
      originalLyrics?: string;
      bpm?: number;
      language?: string;
      preserveRhyme?: boolean;
    };

    if (!sourceTrackId || !personaVoiceModel) {
      return res
        .status(400)
        .json({ error: 'sourceTrackId and personaVoiceModel required' });
    }
    if (typeof startSec !== 'number' || typeof endSec !== 'number') {
      return res.status(400).json({ error: 'startSec/endSec numeric required' });
    }

    const tempo = bpm && bpm > 0 ? bpm : 120;
    const beatSec = 60 / tempo;
    const startBeat = startSec / beatSec;
    const endBeat = endSec / beatSec;

    // Build a meter grid covering the section only. Naive 2 syllables
    // per half-beat until WhisperX-derived timing can replace this.
    const slots = Math.max(2, Math.round((endBeat - startBeat) * 2));
    const meterGrid: MeterSlot[] = Array.from({ length: slots }, (_, i) => ({
      beat: startBeat + i * 0.5,
      syllables: 2,
    }));

    const ibis = await callIbisMeter({
      meterGrid,
      prompt,
      language,
      bpm: tempo,
      preserveRhyme,
      originalLyrics,
    });

    const parsed = parsePersonaVoiceModel(personaVoiceModel);
    if (!parsed.personaId) {
      return res.status(400).json({
        error:
          'personaVoiceModel must be "persona_id:<id>[|seed:<n>]". Inpaint is Suno-only; use /rewrite for clone-provider flows.',
      });
    }

    const out = await suno.inpaint({
      personaId: parsed.personaId,
      seed: parsed.seed,
      sourceTrackId,
      startSec,
      endSec,
      newLyrics: ibis.raw_text,
      bpm: tempo,
    });

    const outPath = path.join(
      '/tmp',
      `chromox-fix-${Date.now()}.${out.format}`
    );
    fs.writeFileSync(outPath, out.audioBuffer);

    res.json({
      audioPath: outPath,
      newLyrics: ibis.lyrics,
      rawText: ibis.raw_text,
      inSpec: ibis.in_spec,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fix-section failed';
    res.status(500).json({ error: msg });
  }
});

// POST /api/vocal-regen/meter-only ----------------------------------------
router.post('/meter-only', async (req: Request, res: Response) => {
  try {
    const {
      meterGrid,
      prompt,
      language,
      bpm,
      preserveRhyme,
      originalLyrics,
    } = req.body as {
      meterGrid: MeterSlot[];
      prompt: string;
      language?: string;
      bpm?: number;
      preserveRhyme?: boolean;
      originalLyrics?: string;
    };
    const ibis = await callIbisMeter({
      meterGrid,
      prompt,
      language,
      bpm,
      preserveRhyme,
      originalLyrics,
    });
    res.json(ibis);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'meter-only failed';
    res.status(500).json({ error: msg });
  }
});

function parsePersonaVoiceModel(vm: string) {
  const personaMatch = vm.match(/persona_id:([^|]+)/i);
  const seedMatch = vm.match(/seed:(-?\d+)/i);
  return {
    personaId: personaMatch ? personaMatch[1].trim() : null,
    seed: seedMatch ? Number(seedMatch[1]) : null,
  };
}

export default router;
