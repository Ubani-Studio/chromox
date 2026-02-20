import fs from 'fs';
import path from 'path';
import { ProviderRequest, ProviderResponse, SingingProvider } from './base.js';
import { loadVoiceProfile } from '../voiceAnalysis.js';

const SOVITS_SERVICE_URL = process.env.SOVITS_SERVICE_URL || 'http://localhost:5014';

/**
 * So-VITS-SVC 4.1 Provider
 *
 * Calls the local So-VITS-SVC FastAPI service at localhost:5014 for voice conversion.
 * Uses VITS vocoder for best voice similarity among SVC methods.
 */
export class SoVitsProvider implements SingingProvider {
  id = 'so-vits';
  label = 'So-VITS-SVC Voice Clone';

  async synthesize(request: ProviderRequest): Promise<ProviderResponse> {
    console.log(`[So-VITS] Synthesizing with voice model: ${request.voiceModel}`);

    const personaId = request.voiceModel.replace('cloned_', '');
    const voiceProfile = loadVoiceProfile(personaId);
    if (!voiceProfile) {
      throw new Error(`Voice profile not found for model: ${request.voiceModel}`);
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error('So-VITS-SVC service not available at ' + SOVITS_SERVICE_URL);
    }

    // Get guide vocal path
    const guidePath = request.guidePath;
    if (!guidePath) {
      throw new Error('So-VITS-SVC requires a guide vocal (guidePath). TTS input not supported.');
    }

    const audioBytes = fs.readFileSync(guidePath);
    const blob = new Blob([audioBytes], { type: 'audio/wav' });

    const formData = new FormData();
    formData.append('audio', blob, 'guide.wav');
    formData.append('pitch_shift', String(
      request.controls?.formant ? Math.round(request.controls.formant * 12) : 0
    ));
    formData.append('spk', '');  // Use default speaker
    formData.append('slice_db', '-40');
    formData.append('noise_scale', '0.4');
    formData.append('f0_predictor', 'rmvpe');
    formData.append('pad_seconds', '0.5');

    console.log('[So-VITS] Sending to So-VITS-SVC service...');
    const resp = await fetch(`${SOVITS_SERVICE_URL}/convert`, {
      method: 'POST',
      body: formData,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`So-VITS-SVC conversion failed: ${resp.status} ${text}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    console.log(`[So-VITS] Conversion complete: ${(audioBuffer.length / 1024).toFixed(0)}KB`);

    return {
      audioBuffer,
      format: 'wav',
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${SOVITS_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!resp.ok) return false;
      const data = (await resp.json()) as any;
      return data.status === 'ok' && data.model_loaded === true;
    } catch {
      return false;
    }
  }
}
