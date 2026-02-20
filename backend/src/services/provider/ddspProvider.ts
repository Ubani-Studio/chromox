import fs from 'fs';
import path from 'path';
import { ProviderRequest, ProviderResponse, SingingProvider } from './base.js';
import { loadVoiceProfile } from '../voiceAnalysis.js';

const DDSP_SERVICE_URL = process.env.DDSP_SERVICE_URL || 'http://localhost:5013';

/**
 * DDSP-SVC Provider
 *
 * Calls the local DDSP-SVC FastAPI service at localhost:5013 for voice conversion.
 * Uses Rectified Flow + NSF-HiFiGAN vocoder for high-quality synthesis.
 * Cleanest output among neural voice conversion methods.
 */
export class DDSPProvider implements SingingProvider {
  id = 'ddsp';
  label = 'DDSP-SVC Voice Clone';

  async synthesize(request: ProviderRequest): Promise<ProviderResponse> {
    console.log(`[DDSP] Synthesizing with voice model: ${request.voiceModel}`);

    const personaId = request.voiceModel.replace('cloned_', '');
    const voiceProfile = loadVoiceProfile(personaId);
    if (!voiceProfile) {
      throw new Error(`Voice profile not found for model: ${request.voiceModel}`);
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error('DDSP-SVC service not available at ' + DDSP_SERVICE_URL);
    }

    // Get guide vocal path
    const guidePath = request.guidePath;
    if (!guidePath) {
      throw new Error('DDSP-SVC requires a guide vocal (guidePath). TTS input not supported.');
    }

    const audioBytes = fs.readFileSync(guidePath);
    const blob = new Blob([audioBytes], { type: 'audio/wav' });

    const formData = new FormData();
    formData.append('audio', blob, 'guide.wav');
    formData.append('pitch_shift', String(
      request.controls?.formant ? Math.round(request.controls.formant * 12) : 0
    ));
    formData.append('spk_id', '1');
    formData.append('infer_step', '50');
    formData.append('method', 'euler');
    formData.append('threhold', '-60');

    console.log('[DDSP] Sending to DDSP-SVC service...');
    const resp = await fetch(`${DDSP_SERVICE_URL}/convert`, {
      method: 'POST',
      body: formData,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`DDSP-SVC conversion failed: ${resp.status} ${text}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    console.log(`[DDSP] Conversion complete: ${(audioBuffer.length / 1024).toFixed(0)}KB`);

    return {
      audioBuffer,
      format: 'wav',
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${DDSP_SERVICE_URL}/health`, {
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
