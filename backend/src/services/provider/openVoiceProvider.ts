/**
 * OpenVoice V2 provider — scaffold.
 *
 * Talks to the local openvoice-service (python, FastAPI) which provides
 * true speaker-embedding fusion: /blend_synthesize linearly interpolates
 * N tone-color tensors before the decoder runs, producing a single fused
 * speaker rather than the audio-level chorus we get from mixing per-voice
 * RVC outputs.
 *
 * Phase 2 heavy step is still gated — model weights and python deps are
 * not installed yet, so both single-voice synth and blend synth will hit
 * a service that reports scaffold mode or is simply unreachable. In that
 * case this provider throws and the waterfall falls through to RVC +
 * elevenlabs as usual.
 */
import { ProviderRequest, ProviderResponse, SingingProvider } from './base.js';
import { loadVoiceProfile } from '../voiceAnalysis.js';

const OPENVOICE_SERVICE_URL =
  process.env.OPENVOICE_SERVICE_URL || 'http://localhost:5013';

export interface ToneColorWeight {
  toneColorPath: string;
  weight: number;
}

export class OpenVoiceProvider implements SingingProvider {
  id = 'openvoice';
  label = 'OpenVoice V2 (embedding fusion)';

  async synthesize(request: ProviderRequest): Promise<ProviderResponse> {
    if (!(await this.isAvailable())) {
      throw new Error(
        'OpenVoice service unavailable. Scaffold is in place but the python ' +
          'service is not running. See openvoice-service/README.md for the ' +
          'Phase 2 heavy step.',
      );
    }

    const personaId = request.voiceModel.replace('cloned_', '');
    const voiceProfile = loadVoiceProfile(personaId);
    if (!voiceProfile) {
      throw new Error(`Voice profile not found for model: ${request.voiceModel}`);
    }

    const toneColorPath = await this.ensureToneColor(voiceProfile.samplePath);

    const resp = await fetch(`${OPENVOICE_SERVICE_URL}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: request.lyrics,
        base_speaker_id: 'en-default',
        tone_color_path: toneColorPath,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`OpenVoice /synthesize failed: ${resp.status} ${text}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    return {
      audioBuffer: Buffer.from(arrayBuffer),
      format: 'wav',
    };
  }

  /**
   * Blend many voices into one fused output in a single decoder pass.
   * This is the whole point of this provider — the reason it exists
   * rather than going through the per-voice-then-mix path.
   */
  async synthesizeBlend(
    text: string,
    components: ToneColorWeight[],
  ): Promise<ProviderResponse> {
    if (!(await this.isAvailable())) {
      throw new Error(
        'OpenVoice service unavailable. Blend synthesis requires the python service to be running.',
      );
    }

    const resp = await fetch(`${OPENVOICE_SERVICE_URL}/blend_synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        base_speaker_id: 'en-default',
        tone_colors: components.map((c) => ({
          tone_color_path: c.toneColorPath,
          weight: c.weight,
        })),
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`OpenVoice /blend_synthesize failed: ${resp.status} ${body}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    return {
      audioBuffer: Buffer.from(arrayBuffer),
      format: 'wav',
    };
  }

  /**
   * Encode a sample wav into a cached tone-color tensor on the python
   * service. The service caches by sha256 so repeat calls are cheap.
   */
  async ensureToneColor(samplePath: string): Promise<string> {
    const fs = await import('fs');
    if (!fs.existsSync(samplePath)) {
      throw new Error(`Voice sample not found at ${samplePath}`);
    }
    const bytes = fs.readFileSync(samplePath);
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const form = new FormData();
    form.append('audio', blob, 'sample.wav');

    const resp = await fetch(`${OPENVOICE_SERVICE_URL}/encode_tone_color`, {
      method: 'POST',
      body: form,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`OpenVoice /encode_tone_color failed: ${resp.status} ${text}`);
    }
    const data = (await resp.json()) as { tone_color_path?: string };
    if (!data.tone_color_path) {
      throw new Error('OpenVoice /encode_tone_color returned no tone_color_path');
    }
    return data.tone_color_path;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${OPENVOICE_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!resp.ok) return false;
      const data = (await resp.json()) as { status?: string; model_loaded?: boolean };
      return data.status === 'ok' && data.model_loaded === true;
    } catch {
      return false;
    }
  }
}
