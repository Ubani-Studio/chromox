import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { ProviderRequest, ProviderResponse, SingingProvider } from './base.js';
import { loadVoiceProfile } from '../voiceAnalysis.js';

const execAsync = promisify(exec);

/**
 * Local FFmpeg Fallback Provider
 *
 * When ALL API providers fail (no keys, quota exceeded, service down),
 * this provider transforms the guide audio using ffmpeg filters to
 * approximate the persona's voice characteristics.
 *
 * It's not a real voice clone — it's a pitch/formant-shifted version
 * of the guide vocal so the user gets *something* instead of a 500 error.
 */
export class LocalFallbackProvider implements SingingProvider {
  id = 'local-fallback';
  label = 'Local FFmpeg Transform (Fallback)';

  async synthesize(request: ProviderRequest): Promise<ProviderResponse> {
    console.log('[LocalFallback] All API providers failed — using ffmpeg voice transform');

    if (!request.guidePath) {
      throw new Error(
        'Local fallback requires a guide vocal. No guide audio was provided and all API providers are unavailable. ' +
        'Configure a valid API key for at least one provider (ElevenLabs, OpenAI, Fish Audio, CAMB.AI, or MiniMax).'
      );
    }

    if (!fs.existsSync(request.guidePath)) {
      throw new Error(`Guide audio file not found: ${request.guidePath}`);
    }

    // Load voice profile to get target characteristics
    const personaId = request.voiceModel.replace('cloned_', '');
    const voiceProfile = loadVoiceProfile(personaId);

    // Build ffmpeg filter chain based on voice profile
    const filters = this.buildFilterChain(voiceProfile?.characteristics, request.controls);

    const tempDir = path.join(process.cwd(), 'temp');
    fs.mkdirSync(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, `fallback_${Date.now()}.wav`);

    try {
      const filterStr = filters.join(',');
      const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${request.guidePath}" -af "${filterStr}" -ar 44100 -ac 1 "${outputPath}"`;
      console.log(`[LocalFallback] Running: ${cmd}`);
      await execAsync(cmd, { timeout: 60000 });

      const audioBuffer = fs.readFileSync(outputPath);

      console.log('[LocalFallback] Transform complete. Output is an approximation — not a real voice clone.');

      return {
        audioBuffer,
        format: 'wav'
      };
    } finally {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }

  private buildFilterChain(
    characteristics: { pitchRange?: { min: number; max: number; mean: number }; brightness?: number; breathiness?: number } | undefined | null,
    controls: any
  ): string[] {
    const filters: string[] = [];

    // 1. Pitch shift via asetrate + aresample (formant-preserving-ish)
    //    Use persona's pitch range to determine shift direction
    let pitchFactor = 1.0;
    if (characteristics?.pitchRange) {
      const targetMean = characteristics.pitchRange.mean;
      // Typical male mean ~120Hz, female ~220Hz
      // Shift guide pitch toward persona target, but gently (max ±15%)
      if (targetMean > 200) {
        pitchFactor = Math.min(1.15, 1.0 + (targetMean - 180) / 800);
      } else if (targetMean < 150) {
        pitchFactor = Math.max(0.85, 1.0 - (150 - targetMean) / 400);
      }
    }

    // Apply formant control override if present
    if (controls?.formant && Math.abs(controls.formant) > 0.05) {
      pitchFactor *= (1.0 + controls.formant * 0.15);
    }

    if (Math.abs(pitchFactor - 1.0) > 0.01) {
      const sampleRate = 44100;
      const shifted = Math.round(sampleRate * pitchFactor);
      filters.push(`asetrate=${shifted}`);
      filters.push(`aresample=${sampleRate}`);
    }

    // 2. Brightness EQ — boost or cut highs based on persona
    const brightness = controls?.brightness ?? characteristics?.brightness ?? 0.5;
    if (Math.abs(brightness - 0.5) > 0.05) {
      const gain = (brightness - 0.5) * 16; // ±8dB range
      filters.push(`treble=g=${gain.toFixed(1)}:f=3500`);
    }

    // 3. Breathiness — add subtle air via high-shelf
    const breathiness = controls?.breathiness ?? characteristics?.breathiness ?? 0.4;
    if (breathiness > 0.5) {
      const airGain = (breathiness - 0.5) * 8;
      filters.push(`highshelf=g=${airGain.toFixed(1)}:f=6000`);
    }

    // 4. Subtle chorus to differentiate from dry input
    filters.push('chorus=0.5:0.9:50:0.4:0.25:2');

    // 5. Vibrato if requested
    if (controls?.vibratoDepth > 0.1) {
      const freq = (controls.vibratoRate || 0.5) * 8 + 2;
      const depth = Math.min(controls.vibratoDepth * 0.8, 0.8);
      filters.push(`vibrato=f=${freq.toFixed(1)}:d=${depth.toFixed(2)}`);
    }

    // 6. Gentle compression to glue it together
    filters.push('acompressor=threshold=-20dB:ratio=3:attack=5:release=50');

    // 7. Normalize output level
    filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');

    return filters;
  }
}
