import fetch from 'node-fetch';
import { ProviderRequest, ProviderResponse, SingingProvider } from './base';

/**
 * Suno Persona Provider
 *
 * Integrates Suno's public API (platform.suno.com) for persona-locked
 * vocal regeneration. Unlike the voice-clone providers (Kits, RVC,
 * ElevenLabs, CAMB), Suno does NOT let you clone an arbitrary external
 * vocal for consent reasons - it only reproduces voices that were
 * originally generated on Suno.
 *
 * Therefore:
 *   - If the user's acapella was produced on Suno, Chromox stores the
 *     persona_id (+ optional seed) when it's imported, and this provider
 *     is the right choice for regeneration. Same voice, same character,
 *     new lyrics, optional BPM lock.
 *   - If the acapella is external, Chromox should route to the
 *     voice-clone providers instead.
 *
 * Voice-model convention for Suno tracks inside Chromox:
 *   "persona_id:<suno_persona_id>[|seed:<seed>]"
 *
 *   - persona_id: stable Suno Personas API id
 *   - seed: optional; pins deterministic generation across re-renders
 *
 * Config:
 *   SUNO_API_KEY         - bearer token from platform.suno.com
 *   SUNO_BASE_URL        - override for staging; defaults to v1 endpoint
 *   SUNO_POLL_TIMEOUT_MS - how long we wait for async job completion
 */
export class SunoProvider implements SingingProvider {
  id = 'suno';
  label = 'Suno Persona';

  private baseUrl: string;
  private apiKey: string;
  private pollTimeoutMs: number;

  constructor() {
    this.apiKey = process.env.SUNO_API_KEY || '';
    this.baseUrl = process.env.SUNO_BASE_URL || 'https://api.suno.com/v1';
    this.pollTimeoutMs = Number(process.env.SUNO_POLL_TIMEOUT_MS || 180_000);
  }

  async synthesize(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey || this.apiKey === 'demo-key') {
      // Fallback tone so the pipeline still completes when the provider
      // isn't configured - mirrors Kits' behaviour for local dev.
      return { audioBuffer: this.mockBuffer(), format: 'wav' };
    }

    const { personaId, seed } = this.parseVoiceModel(request.voiceModel);
    if (!personaId) {
      throw new Error(
        'Suno provider: voiceModel must be "persona_id:<id>[|seed:<n>]". ' +
          'For external (non-Suno) acapellas, use a voice-clone provider instead.'
      );
    }

    const payload: Record<string, unknown> = {
      persona_id: personaId,
      prompt: request.lyrics,
      mode: 'persona', // use saved voice persona, do not re-randomise
      style: this.styleFromControls(request.controls, request.accentType),
      tempo: request.beatGrid?.bpm ?? undefined,
      instrumental: false,
    };
    if (seed !== null) payload.seed = seed;

    // Suno generation is async; submit then poll.
    const submit = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!submit.ok) {
      const body = await submit.text().catch(() => '');
      throw new Error(`Suno submit failed (${submit.status}): ${body.slice(0, 200)}`);
    }
    const submitJson = (await submit.json()) as { id?: string; audio_url?: string };
    if (submitJson.audio_url) {
      // Some Suno endpoints return a completed URL synchronously.
      return this.fetchAudio(submitJson.audio_url);
    }
    const jobId = submitJson.id;
    if (!jobId) throw new Error('Suno submit: missing job id');

    // Poll with 2s backoff up to the configured timeout.
    const deadline = Date.now() + this.pollTimeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(`${this.baseUrl}/generate/${jobId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!poll.ok) continue;
      const pollJson = (await poll.json()) as {
        status?: string;
        audio_url?: string;
        error?: string;
      };
      if (pollJson.status === 'failed') {
        throw new Error(`Suno job failed: ${pollJson.error || 'unknown'}`);
      }
      if (pollJson.audio_url) return this.fetchAudio(pollJson.audio_url);
    }
    throw new Error(`Suno job timed out after ${this.pollTimeoutMs}ms`);
  }

  /**
   * Inpaint: regenerate only the segment between startSec and endSec of
   * an existing Suno track, with new lyrics in the SAME persona. Used by
   * the Chromox vocal-regen flow for "fix this word" / "rewrite this
   * line" operations without re-rendering the whole take.
   */
  async inpaint(args: {
    personaId: string;
    seed?: number | null;
    sourceTrackId: string;
    startSec: number;
    endSec: number;
    newLyrics: string;
    bpm?: number;
  }): Promise<ProviderResponse> {
    if (!this.apiKey) return { audioBuffer: this.mockBuffer(), format: 'wav' };
    const res = await fetch(`${this.baseUrl}/inpaint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        track_id: args.sourceTrackId,
        persona_id: args.personaId,
        seed: args.seed ?? undefined,
        start: args.startSec,
        end: args.endSec,
        lyrics: args.newLyrics,
        tempo: args.bpm,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Suno inpaint failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const j = (await res.json()) as { audio_url?: string };
    if (!j.audio_url) throw new Error('Suno inpaint returned no audio_url');
    return this.fetchAudio(j.audio_url);
  }

  private async fetchAudio(url: string): Promise<ProviderResponse> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Suno audio download ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const fmt = url.endsWith('.mp3') ? 'mp3' : 'wav';
    return { audioBuffer: buf, format: fmt };
  }

  private parseVoiceModel(vm: string): { personaId: string | null; seed: number | null } {
    if (!vm) return { personaId: null, seed: null };
    const personaMatch = vm.match(/persona_id:([^|]+)/i);
    const seedMatch = vm.match(/seed:(-?\d+)/i);
    return {
      personaId: personaMatch ? personaMatch[1].trim() : null,
      seed: seedMatch ? Number(seedMatch[1]) : null,
    };
  }

  private styleFromControls(
    controls: ProviderRequest['controls'],
    accentType?: string
  ): string {
    // Map Chromox's slider grid into a compact Suno style prompt.
    const parts: string[] = [];
    if (accentType) parts.push(accentType.replace(/_/g, ' '));
    if (controls && typeof controls === 'object') {
      const c = controls as Record<string, number | string | undefined>;
      if (typeof c.grit === 'number' && c.grit > 0.6) parts.push('gritty');
      if (typeof c.air === 'number' && c.air > 0.6) parts.push('airy');
      if (typeof c.warmth === 'number' && c.warmth > 0.6) parts.push('warm');
      if (typeof c.emotion === 'string' && c.emotion) parts.push(String(c.emotion));
    }
    return parts.join(', ') || 'neutral';
  }

  private mockBuffer() {
    const sampleRate = 44100;
    const samples = sampleRate;
    const buffer = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
      const value = Math.sin((i / sampleRate) * Math.PI * 2 * 440);
      buffer.writeInt16LE(value * 32767, i * 2);
    }
    return buffer;
  }
}
