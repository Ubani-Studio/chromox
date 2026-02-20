import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { EffectSettings, RenderPayload, BeatGrid } from '../types.js';
import { extractPitchAndTiming, extractVocalStem, transcribeLyrics } from './dsp.js';
import { promptToControls } from './llm.js';
import { SingingProvider } from './provider/base.js';
import { synthesizeWithWaterfall } from './provider/providerRegistry.js';
import { applyAdvancedEffects, defaultEffectSettings, restoreVocal } from './effectsProcessor.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Global render progress emitter. SSE endpoint listens on this. */
export const renderProgress = new EventEmitter();
renderProgress.setMaxListeners(20);

function emitProgress(stage: string, percent: number, detail?: string) {
  renderProgress.emit('progress', { stage, percent, detail, ts: Date.now() });
}

export class ChromaticCorePipeline {
  constructor(private provider: SingingProvider) {}

  async run(payload: RenderPayload) {
    emitProgress('stem_extract', 5, 'Extracting vocal stem...');
    let guideData = payload.guideFilePath ? await extractVocalStem(payload.guideFilePath) : undefined;

    // Trim guide audio if start/end times specified
    if (guideData && (payload.guideStartTime !== undefined || payload.guideEndTime !== undefined)) {
      guideData = await trimGuideAudio(guideData.stemPath, payload.guideStartTime, payload.guideEndTime);
    }

    emitProgress('pitch_analysis', 15, 'Analyzing pitch & timing...');
    const pitchData = guideData ? await extractPitchAndTiming(guideData.stemPath) : undefined;

    emitProgress('transcribe', 25, 'Transcribing lyrics...');
    const lyricsData = await transcribeLyrics(guideData?.stemPath ?? '');

    const accentFragment =
      payload.accentLocked && payload.accent ? ` accent:${payload.accent}` : '';
    const guideFragment =
      payload.guideMatchIntensity !== undefined
        ? ` guideMatch:${Math.round(payload.guideMatchIntensity * 100)}%`
        : '';
    const stylePromptWithAccent = `${payload.stylePrompt} ${accentFragment}${guideFragment}`.trim();

    let baseLyrics = payload.lyrics;
    if (payload.guideUseLyrics && guideData?.stemPath) {
      const guideTranscript = await transcribeLyrics(guideData.stemPath);
      if (guideTranscript.transcript.trim()) {
        baseLyrics = guideTranscript.transcript;
      }
    }
    const finalLyrics = baseLyrics;

    emitProgress('style_parse', 30, 'Parsing style controls...');
    const promptControls = await promptToControls(stylePromptWithAccent);
    const mergedControls = {
      ...promptControls,
      ...payload.controls
    };

    emitProgress('synthesis', 35, `Synthesizing vocal (${this.provider.label})...`);
    const synthesisRequest = {
      voiceModel: payload.voiceModelKey,
      lyrics: finalLyrics ?? lyricsData.transcript,
      controls: mergedControls,
      guidePath: pitchData?.stemPath,
      guideAccentBlend: payload.guideAccentBlend,
      // Enhanced accent/phonetic support (fixes mechanical/alien sound)
      pronunciationHints: payload.pronunciationHints,
      phoneticLyrics: payload.phoneticLyrics,
      accentType: payload.detectedAccent,
      prosodyHints: payload.prosodyHints,
      // Beat grid for rhythm-aware synthesis
      beatGrid: pitchData?.beatGrid
    };

    const result = await synthesizeWithWaterfall(synthesisRequest, this.provider);
    emitProgress('synthesis_done', 65, 'Vocal synthesized.');

    const outDir = path.join(process.cwd(), 'renders');
    fs.mkdirSync(outDir, { recursive: true });
    const timestamp = Date.now();
    const rawPath = path.join(outDir, `render-${timestamp}.${result.format}`);
    fs.writeFileSync(rawPath, result.audioBuffer);

    // Vocal restoration: denoise + HF recovery on raw SVC output
    emitProgress('restore', 68, 'Restoring vocal (denoise + HF recovery)...');
    const restoredPath = await restoreVocal(rawPath);

    emitProgress('effects', 75, 'Applying effects & mastering...');
    const effects = payload.effects ?? { ...defaultEffectSettings };
    const processedPath = await applyAdvancedEffects(restoredPath, effects, payload.previewSeconds);

    // Calculate tempo ratio: if targetBpm specified, compute from detected BPM
    let tempoRatio = payload.guideTempo;
    if (payload.targetBpm && pitchData?.beatGrid?.bpm) {
      const detectedBpm = pitchData.beatGrid.bpm;
      tempoRatio = payload.targetBpm / detectedBpm;
      console.log(`[RenderPipeline] BPM adjustment: ${detectedBpm} → ${payload.targetBpm} (ratio: ${tempoRatio.toFixed(3)})`);
    }

    emitProgress('tempo', 80, 'Adjusting tempo...');
    const tempoAdjustedPath = await applyTempo(processedPath, tempoRatio);

    emitProgress('layers', 88, 'Applying preset layers...');
    const layeredPath = await applyPresetLayers(tempoAdjustedPath, effects.preset);

    // Trim output to match guide duration if specified
    let finalPath = layeredPath;
    if (payload.guideStartTime !== undefined || payload.guideEndTime !== undefined) {
      const duration = payload.guideEndTime && payload.guideStartTime !== undefined
        ? payload.guideEndTime - payload.guideStartTime
        : payload.guideEndTime;
      if (duration) {
        finalPath = await trimOutputToLength(layeredPath, duration);
      }
    }

    emitProgress('finalize', 95, 'Finalizing output...');
    if (payload.previewSeconds) {
      const previewPath = await createPreviewSnippet(finalPath, payload.previewSeconds);
      emitProgress('done', 100, 'Preview ready.');
      return previewPath;
    }

    emitProgress('done', 100, 'Render complete.');
    return finalPath;
  }
}

async function createPreviewSnippet(filePath: string, seconds: number): Promise<string> {
  const previewPath = filePath.replace(/(\.[a-z0-9]+)$/i, '-preview$1');
  const safeSeconds = Math.max(2, Math.min(seconds, 30));
  try {
    await execAsync(
      `ffmpeg -y -hide_banner -loglevel error -i "${filePath}" -t ${safeSeconds} -c copy "${previewPath}"`
    );
    return previewPath;
  } catch (error) {
    console.error('[RenderPipeline] Failed to trim preview, returning full file.', error);
    return filePath;
  }
}

async function applyTempo(filePath: string, tempo?: number | null): Promise<string> {
  if (!tempo || Math.abs(tempo - 1) < 0.01) {
    return filePath;
  }

  const safeTempo = Math.max(0.5, Math.min(6, tempo));
  const tempoFilters: string[] = [];
  let remaining = safeTempo;

  while (remaining > 2) {
    tempoFilters.push('atempo=2');
    remaining /= 2;
  }
  while (remaining < 0.5) {
    tempoFilters.push('atempo=0.5');
    remaining *= 2;
  }
  tempoFilters.push(`atempo=${remaining.toFixed(3)}`);

  const outPath = filePath.replace(/(\.[a-z0-9]+)$/i, '-tempo$1');
  try {
    await execAsync(
      `ffmpeg -y -hide_banner -loglevel error -i "${filePath}" -filter:a "${tempoFilters.join(
        ','
      )}" "${outPath}"`
    );
    return outPath;
  } catch (error) {
    console.error('[RenderPipeline] Tempo adjustment failed, returning original.', error);
    return filePath;
  }
}

async function applyPresetLayers(filePath: string, preset?: EffectSettings['preset']): Promise<string> {
  if (preset === 'harmonic-orbit') {
    return applyHarmonicOrbitLayer(filePath);
  }
  if (preset === 'choir-cloud') {
    return applyChoirCloudLayer(filePath);
  }
  return filePath;
}

async function applyHarmonicOrbitLayer(filePath: string): Promise<string> {
  const outPath = filePath.replace(/(\.[a-z0-9]+)$/i, '-orbit$1');
  const filter =
    '[0:a]asplit=3[a][b][c];' +
    '[a]asetrate=48000*1.03,aresample=48000,pan=stereo|c0=0.85*c0|c1=0.35*c1[a1];' +
    '[b]asetrate=48000*0.97,aresample=48000,pan=stereo|c0=0.35*c0|c1=0.85*c1[a2];' +
    '[c]aphaser=0.6:0.66:2:0.6:0.5:0.1,volume=0.6[a3];' +
    '[a1][a2][a3]amix=3,volume=1[out]';
  return runFilterComplex(filePath, outPath, filter);
}

async function applyChoirCloudLayer(filePath: string): Promise<string> {
  const outPath = filePath.replace(/(\.[a-z0-9]+)$/i, '-choir$1');
  const filter =
    '[0:a]asplit=4[a][b][c][d];' +
    '[a]asetrate=48000*1.06,aresample=48000,pan=stereo|c0=0.7*c0|c1=0.3*c1[a1];' +
    '[b]asetrate=48000*0.94,aresample=48000,pan=stereo|c0=0.3*c0|c1=0.7*c1[b1];' +
    '[c]areverb=60:60:100,volume=0.5[c1];' +
    '[d]adelay=50|50,volume=0.4[d1];' +
    '[a1][b1][c1][d1]amix=4,volume=1[out]';
  return runFilterComplex(filePath, outPath, filter);
}

async function runFilterComplex(filePath: string, outPath: string, filter: string): Promise<string> {
  try {
    await execAsync(
      `ffmpeg -y -hide_banner -loglevel error -i "${filePath}" -filter_complex "${filter}" -map "[out]" "${outPath}"`
    );
    return outPath;
  } catch (error) {
    console.error('[RenderPipeline] Layered effect failed, returning base render.', error);
    return filePath;
  }
}

async function trimGuideAudio(
  filePath: string,
  startTime?: number,
  endTime?: number
): Promise<{ stemPath: string; quality: number }> {
  if (startTime === undefined && endTime === undefined) {
    return { stemPath: filePath, quality: 1.0 };
  }

  const trimmedPath = filePath.replace(/(\.[a-z0-9]+)$/i, '-trimmed$1');
  const start = startTime ?? 0;
  const duration = endTime && endTime > start ? endTime - start : undefined;

  try {
    let cmd = `ffmpeg -y -hide_banner -loglevel error -ss ${start}`;
    if (duration) {
      cmd += ` -t ${duration}`;
    }
    cmd += ` -i "${filePath}" -c copy "${trimmedPath}"`;

    await execAsync(cmd);
    console.log(`[RenderPipeline] Trimmed guide audio: ${start}s to ${endTime ?? 'end'}s`);
    return { stemPath: trimmedPath, quality: 1.0 };
  } catch (error) {
    console.error('[RenderPipeline] Failed to trim guide audio, using original:', error);
    return { stemPath: filePath, quality: 1.0 };
  }
}

async function trimOutputToLength(filePath: string, durationSeconds: number): Promise<string> {
  const trimmedPath = filePath.replace(/(\.[a-z0-9]+)$/i, '-final$1');

  try {
    // Trim from start to exact duration, re-encode for clean cut
    const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${filePath}" -t ${durationSeconds} -acodec copy "${trimmedPath}"`;
    await execAsync(cmd);
    console.log(`[RenderPipeline] Trimmed output to ${durationSeconds}s`);
    return trimmedPath;
  } catch (error) {
    console.error('[RenderPipeline] Failed to trim output, using full length:', error);
    return filePath;
  }
}
