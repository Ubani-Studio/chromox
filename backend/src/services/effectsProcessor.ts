import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { EffectSettings } from '../types';
import { processWithAdvancedEngine } from './effectsEngineClient';

const execAsync = promisify(exec);

export const defaultEffectSettings: EffectSettings = {
  engine: 'clean',
  preset: 'clean',
  clarity: 0.7,
  air: 0.4,
  drive: 0.15,
  width: 0.5,
  noiseReduction: 0.4,
  space: 'studio',
  dynamics: 0.6,
  orbitSpeed: 0.5,
  orbitDepth: 0.8,
  orbitTilt: 0.5,
  bypassEffects: false
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function buildFilterChain(settings: EffectSettings) {
  const width = clamp(settings.width);
  const noise = clamp(settings.noiseReduction);

  // Minimal, transparent processing — avoid anything that adds metallic coloration
  const gateThreshold = (-60 + noise * 25).toFixed(0);

  const filters = [
    `aresample=48000`,
    `aformat=channel_layouts=stereo`,
    // Clean up sub-bass rumble only
    `highpass=f=65`,
    // Gentle gate to reduce noise in silent parts
    `agate=threshold=${gateThreshold}dB:ratio=2:attack=5:release=80`,
    // Light transparent compression — just tame peaks, no coloration
    `acompressor=threshold=-18dB:ratio=2.5:attack=12:release=200:makeup=2dB`,
  ];

  // Stereo widening via Haas effect
  if (Math.abs(width - 0.5) > 0.05 && width > 0.5) {
    const delayMs = Math.round((width - 0.5) * 16); // 1-8ms
    filters.push(`adelay=${delayMs}|0`);
  }

  // Normalize output to prevent volume drops
  filters.push(`loudnorm=I=-14:TP=-1:LRA=11`);

  return filters.join(',');
}

function applyPreset(settings: EffectSettings): EffectSettings {
  switch (settings.preset) {
    case 'lush':
      return {
        ...settings,
        clarity: 0.65,        // Smooth clarity
        air: 0.75,            // Lots of air for openness
        drive: 0.1,           // Minimal drive
        width: 0.85,          // Wide stereo image
        noiseReduction: 0.5,  // Clean but not over-processed
        space: 'studio',      // Studio reverb for depth
        dynamics: 0.55        // Moderate compression
      };
    case 'vintage':
      return {
        ...settings,
        clarity: 0.4,
        air: 0.3,
        drive: 0.35,
        width: 0.45,
        noiseReduction: 0.2,
        space: 'hall',
        dynamics: 0.5
      };
    case 'raw':
      return {
        ...settings,
        clarity: 0.35,
        air: 0.2,
        drive: 0.1,
        width: 0.5,
        noiseReduction: 0.1,
        space: 'dry',
        dynamics: 0.4
      };
    case 'clean':
    default:
      return settings;
  }
}

export async function applyAdvancedEffects(
  inputPath: string,
  settings: EffectSettings,
  previewSeconds?: number
): Promise<string> {
  if (settings?.bypassEffects) {
    return inputPath;
  }

  const appliedSettings = applyPreset(settings);

  if (settings.engine && settings.engine !== 'clean') {
    try {
      return await processWithAdvancedEngine(inputPath, appliedSettings, previewSeconds);
    } catch (error) {
      console.error('[Effects] External engine failed, falling back to Chromox Labs chain.', error);
    }
  }

  const targetDir = path.dirname(inputPath);
  const fileName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(targetDir, `${fileName}-hq.wav`);

  const filters = buildFilterChain(appliedSettings);
  const command = `ffmpeg -y -hide_banner -loglevel error -i "${inputPath}" -af "${filters}" -ar 48000 -c:a pcm_s24le "${outputPath}"`;

  try {
    await execAsync(command, { timeout: 120_000 });
    return outputPath;
  } catch (error) {
    console.error('[Effects] Advanced processing failed, falling back to raw output.', error);
    // Ensure at least 24-bit conversion happens
    try {
      await execAsync(
        `ffmpeg -y -hide_banner -loglevel error -i "${inputPath}" -c:a pcm_s24le "${outputPath}"`
      );
      return outputPath;
    } catch (conversionError) {
      console.error('[Effects] Conversion fallback failed:', conversionError);
      if (fs.existsSync(outputPath)) {
        return outputPath;
      }
      return inputPath;
    }
  }
}
