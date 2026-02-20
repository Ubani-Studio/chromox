import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { ProviderRequest, ProviderResponse, SingingProvider } from './base.js';
import { loadVoiceProfile } from '../voiceAnalysis.js';
import { ElevenLabsProviderEnhanced } from './elevenLabsProviderEnhanced.js';

const execAsync = promisify(exec);

const RVC_SERVICE_URL = process.env.RVC_SERVICE_URL || 'http://localhost:5012';

/**
 * RVC (Retrieval-based Voice Conversion) Provider
 *
 * Calls the local RVC FastAPI service at localhost:5012 for real voice conversion.
 * Falls back to ElevenLabs Enhanced when the RVC service is unavailable.
 */
export class RVCProvider implements SingingProvider {
  id = 'rvc';
  label = 'RVC Voice Clone';

  private fallbackProvider: ElevenLabsProviderEnhanced;

  constructor() {
    this.fallbackProvider = new ElevenLabsProviderEnhanced();
  }

  async synthesize(request: ProviderRequest): Promise<ProviderResponse> {
    console.log(`[RVC] Synthesizing with voice model: ${request.voiceModel}`);

    // Extract persona ID from voice model key
    const personaId = request.voiceModel.replace('cloned_', '');

    // Load voice profile
    const voiceProfile = loadVoiceProfile(personaId);
    if (!voiceProfile) {
      throw new Error(`Voice profile not found for model: ${request.voiceModel}`);
    }

    // Check if RVC service is running
    const available = await this.isRVCAvailable();
    if (!available) {
      console.warn('[RVC] RVC service not available, falling back to ElevenLabs Enhanced');
      return this.fallbackSynthesize(request);
    }

    try {
      // Step 1: Get base vocals (guide vocal or TTS)
      const baseVocalPath = request.guidePath || (await this.generateBaseTTS(request.lyrics));

      // Step 2: Clean spectral envelope transfer — no vocoder, no neural artifacts
      console.log('[RVC] Using clean STFT spectral transfer (no vocoder)');
      const convertedBuffer = await this.applyCleanConversion(baseVocalPath, voiceProfile, request);

      // Step 3: Apply post-processing style controls
      const finalBuffer = await this.applyStyleControls(convertedBuffer, request.controls);

      // Cleanup temp TTS file if we created one
      if (!request.guidePath && baseVocalPath.includes('temp')) {
        try { fs.unlinkSync(baseVocalPath); } catch {}
      }

      return {
        audioBuffer: finalBuffer,
        format: 'wav'
      };
    } catch (error) {
      console.error('[RVC] Synthesis failed:', error);
      throw error;
    }
  }

  /**
   * Check if the RVC service is running by hitting /health.
   */
  async isRVCAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${RVC_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
      if (!resp.ok) return false;
      const data = await resp.json() as any;
      return data.status === 'ok' && data.hubert_loaded === true;
    } catch {
      return false;
    }
  }


  /**
   * Clean spectral envelope transfer — no vocoder involved.
   * Warps the guide's spectral envelope toward the persona's in STFT domain,
   * keeping original phases intact. Zero resynthesis artifacts.
   */
  private async applyCleanConversion(
    inputPath: string,
    voiceProfile: any,
    request: ProviderRequest
  ): Promise<Buffer> {
    const audioBytes = fs.readFileSync(inputPath);
    const blob = new Blob([audioBytes], { type: 'audio/wav' });

    const personaWavPath = voiceProfile.samplePath;
    if (!personaWavPath) {
      throw new Error('Voice profile has no samplePath for spectral transfer');
    }

    const formData = new FormData();
    formData.append('audio', blob, 'input.wav');
    formData.append('persona_wav', personaWavPath);
    formData.append('timbre_blend', '0.85');
    formData.append('pitch_shift', String(request.controls?.formant ? Math.round(request.controls.formant * 12) : 0));

    const resp = await fetch(`${RVC_SERVICE_URL}/convert_world`, {
      method: 'POST',
      body: formData,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Clean spectral transfer failed: ${resp.status} ${text}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Generate base TTS vocals using espeak + ffmpeg.
   */
  private async generateBaseTTS(lyrics: string): Promise<string> {
    const tempPath = path.join(process.cwd(), 'temp', `tts_${Date.now()}.wav`);
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });

    // Sanitize lyrics for shell
    const sanitized = lyrics.replace(/["`$\\]/g, '');
    await execAsync(`espeak "${sanitized}" --stdout | ffmpeg -y -i pipe:0 -ar 44100 -ac 1 "${tempPath}"`);

    return tempPath;
  }

  /**
   * Apply style controls (pitch shift, vibrato, brightness, etc.) via ffmpeg.
   */
  private async applyStyleControls(audioBuffer: Buffer, controls: any): Promise<Buffer> {
    if (!controls) return audioBuffer;

    const filters = [];

    // Vibrato
    if (controls.vibratoDepth > 0) {
      const freq = (controls.vibratoRate || 0.5) * 10;
      filters.push(`vibrato=f=${freq}:d=${controls.vibratoDepth}`);
    }

    // Brightness (EQ)
    if (controls.brightness !== undefined && controls.brightness !== 0.5) {
      const gain = (controls.brightness - 0.5) * 12;
      filters.push(`treble=g=${gain}:f=3000`);
    }

    // Stereo width — skip for mono RVC output (stereotools requires 2ch)
    // Stereo width is applied later in the effects chain if needed

    if (filters.length === 0) return audioBuffer;

    const inputPath = path.join(process.cwd(), 'temp', `style_in_${Date.now()}.wav`);
    const outputPath = path.join(process.cwd(), 'temp', `style_out_${Date.now()}.wav`);
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });

    fs.writeFileSync(inputPath, audioBuffer);

    try {
      await execAsync(`ffmpeg -y -i "${inputPath}" -af "${filters.join(',')}" "${outputPath}"`);
      const result = fs.readFileSync(outputPath);
      return result;
    } finally {
      try { fs.unlinkSync(inputPath); } catch {}
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }

  /**
   * Fallback to ElevenLabs Enhanced when RVC service is down.
   */
  private async fallbackSynthesize(request: ProviderRequest): Promise<ProviderResponse> {
    console.log('[RVC] Delegating to ElevenLabs Enhanced fallback');
    try {
      return await this.fallbackProvider.synthesize(request);
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('quota') ||
          msg.includes('insufficient') || msg.includes('limit') || msg.includes('payment')) {
        throw new Error(
          'ElevenLabs quota exceeded or API key invalid. ' +
          'Top up your ElevenLabs account at https://elevenlabs.io/subscription or switch to a different provider.'
        );
      }
      throw error;
    }
  }
}
