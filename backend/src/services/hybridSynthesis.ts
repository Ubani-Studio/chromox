/**
 * Hybrid Voice Synthesis Service
 * Blends multiple voice embeddings and routes to optimal provider
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

import { findPersona } from './personaStore';
import { VoiceProfile } from './voiceAnalysis';
import { AccentCategory, VoiceType, detectVoiceCharacteristics } from './voiceDetection';
import { validateVoiceUsage, fetchVoiceLicense, LicensingTerms } from './provenanceService';
import { recordHybridUsage } from './usageTracking';
import { resolveProvider, synthesizeWithWaterfall } from './provider/providerRegistry';
import { ProviderRequest, ProviderResponse } from './provider/base';
import { StyleControls } from '../types';

const execAsync = promisify(exec);

/**
 * Default style controls used when the hybrid request does not override
 * them. Matches the admin-render defaults so blended output does not
 * drift into uncanny territory just because the caller omitted a knob.
 */
const DEFAULT_CONTROLS: StyleControls = {
  brightness: 0.5,
  breathiness: 0.5,
  energy: 0.6,
  formant: 0,
  vibratoDepth: 0.4,
  vibratoRate: 0.5,
  roboticism: 0,
  glitch: 0,
  stereoWidth: 0.5,
};

/**
 * Voice component for hybrid synthesis
 */
export interface VoiceComponent {
  personaId: string;
  o8IdentityId?: string;
  weight: number; // 0-1, all weights must sum to 1
}

/**
 * Hybrid synthesis request
 */
export interface HybridSynthesisRequest {
  voices: VoiceComponent[];
  text: string;
  accentLock?: AccentCategory; // Lock to specific accent
  routingMode: 'auto' | 'rvc' | 'camb-ai' | 'elevenlabs';
  emotion?: string;
  styleHints?: {
    energy?: number;
    clarity?: number;
    warmth?: number;
  };
}

/**
 * Usage breakdown per voice for royalty tracking
 */
export interface VoiceUsageBreakdown {
  personaId: string;
  o8IdentityId?: string;
  weight: number;
  secondsUsed: number;
  ratePerSecondCents: number;
  totalCents: number;
  licensing?: LicensingTerms;
}

/**
 * Hybrid synthesis result
 */
export interface HybridSynthesisResult {
  audioUrl: string;
  audioPath: string;
  durationSeconds: number;
  provider: string;
  usageBreakdown: VoiceUsageBreakdown[];
  totalCostCents: number;
  provenance: {
    hybridFingerprint: string;
    voiceIds: string[];
    weights: number[];
  };
}

/**
 * Blended voice profile from multiple sources
 */
interface BlendedVoiceProfile {
  embedding: number[];
  characteristics: {
    pitchRange: { min: number; max: number; mean: number };
    brightness: number;
    breathiness: number;
    vibratoRate: number;
  };
  dominantAccent?: AccentCategory;
  dominantVoiceType: VoiceType;
  sourceProfiles: Array<{
    personaId: string;
    weight: number;
    profile: VoiceProfile;
  }>;
}

/**
 * Validates all voices in the hybrid request have proper licensing
 */
export async function validateHybridLicenses(
  voices: VoiceComponent[]
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (const voice of voices) {
    if (voice.o8IdentityId) {
      const result = await validateVoiceUsage(voice.o8IdentityId, 'create_hybrid');
      if (!result.allowed) {
        errors.push(`Voice ${voice.personaId}: ${result.reason}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Blends multiple voice embeddings with weights
 */
function blendEmbeddings(
  profiles: Array<{ embedding: number[]; weight: number }>
): number[] {
  if (profiles.length === 0) {
    throw new Error('No profiles to blend');
  }

  if (profiles.length === 1) {
    return profiles[0].embedding;
  }

  const embeddingLength = profiles[0].embedding.length;
  const blended = new Array(embeddingLength).fill(0);

  for (const { embedding, weight } of profiles) {
    for (let i = 0; i < embeddingLength; i++) {
      blended[i] += embedding[i] * weight;
    }
  }

  // Normalize the blended embedding
  const magnitude = Math.sqrt(blended.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embeddingLength; i++) {
      blended[i] /= magnitude;
    }
  }

  return blended;
}

/**
 * Blends voice characteristics with weights
 */
function blendCharacteristics(
  profiles: Array<{
    characteristics: VoiceProfile['characteristics'];
    weight: number;
  }>
): BlendedVoiceProfile['characteristics'] {
  let pitchMin = 0, pitchMax = 0, pitchMean = 0;
  let brightness = 0, breathiness = 0, vibratoRate = 0;

  for (const { characteristics, weight } of profiles) {
    pitchMin += characteristics.pitchRange.min * weight;
    pitchMax += characteristics.pitchRange.max * weight;
    pitchMean += characteristics.pitchRange.mean * weight;
    brightness += characteristics.brightness * weight;
    breathiness += characteristics.breathiness * weight;
    vibratoRate += characteristics.vibratoRate * weight;
  }

  return {
    pitchRange: { min: pitchMin, max: pitchMax, mean: pitchMean },
    brightness,
    breathiness,
    vibratoRate,
  };
}

/**
 * Creates a blended voice profile from multiple personas
 */
export async function createBlendedProfile(
  voices: VoiceComponent[],
  accentLock?: AccentCategory
): Promise<BlendedVoiceProfile> {
  // Normalize weights to sum to 1
  const totalWeight = voices.reduce((sum, v) => sum + v.weight, 0);
  const normalizedVoices = voices.map(v => ({
    ...v,
    weight: v.weight / totalWeight,
  }));

  // Fetch all persona profiles
  const sourceProfiles: BlendedVoiceProfile['sourceProfiles'] = [];
  const embeddingProfiles: Array<{ embedding: number[]; weight: number }> = [];
  const characteristicProfiles: Array<{
    characteristics: VoiceProfile['characteristics'];
    weight: number;
  }> = [];

  let dominantAccent: AccentCategory | undefined;
  let dominantWeight = 0;
  let singingWeight = 0;
  let speechWeight = 0;

  for (const voice of normalizedVoices) {
    const persona = findPersona(voice.personaId);
    if (!persona) {
      throw new Error(`Persona not found: ${voice.personaId}`);
    }

    if (!persona.voice_profile) {
      throw new Error(`Persona has no voice profile: ${voice.personaId}`);
    }

    sourceProfiles.push({
      personaId: voice.personaId,
      weight: voice.weight,
      profile: persona.voice_profile,
    });

    embeddingProfiles.push({
      embedding: persona.voice_profile.embedding.embedding,
      weight: voice.weight,
    });

    characteristicProfiles.push({
      characteristics: persona.voice_profile.characteristics,
      weight: voice.weight,
    });

    // Track dominant accent
    const detection = persona.clone_detection;
    if (detection?.accent && voice.weight > dominantWeight) {
      dominantAccent = detection.accent as AccentCategory;
      dominantWeight = voice.weight;
    }

    // Track voice type weights
    if (detection?.voiceType === 'singing') {
      singingWeight += voice.weight;
    } else {
      speechWeight += voice.weight;
    }
  }

  // Use accent lock if specified
  if (accentLock) {
    dominantAccent = accentLock;
  }

  // Determine dominant voice type
  const dominantVoiceType: VoiceType = singingWeight > speechWeight ? 'singing' : 'speech';

  return {
    embedding: blendEmbeddings(embeddingProfiles),
    characteristics: blendCharacteristics(characteristicProfiles),
    dominantAccent,
    dominantVoiceType,
    sourceProfiles,
  };
}

/**
 * Determines optimal provider based on blended profile
 */
export function determineOptimalProvider(
  blendedProfile: BlendedVoiceProfile,
  routingMode: HybridSynthesisRequest['routingMode']
): string {
  if (routingMode !== 'auto') {
    return routingMode;
  }

  // Singing-dominant → RVC for best vocal fidelity
  if (blendedProfile.dominantVoiceType === 'singing') {
    return 'rvc';
  }

  // Diaspora accent → CAMB.AI with accent preservation
  const diasporaAccents: AccentCategory[] = [
    'jamaican-patois',
    'nigerian-pidgin',
    'trinidadian',
    'ghanaian',
    'south-african',
    'british-caribbean',
    'haitian-creole',
    'african-american',
    'other-diaspora',
  ];

  if (blendedProfile.dominantAccent && diasporaAccents.includes(blendedProfile.dominantAccent)) {
    return 'camb-ai';
  }

  // Default to CAMB.AI for general speech
  return 'camb-ai';
}

/**
 * Calculates usage breakdown for royalty tracking
 */
export async function calculateUsageBreakdown(
  voices: VoiceComponent[],
  durationSeconds: number
): Promise<VoiceUsageBreakdown[]> {
  const breakdown: VoiceUsageBreakdown[] = [];

  // Normalize weights
  const totalWeight = voices.reduce((sum, v) => sum + v.weight, 0);

  for (const voice of voices) {
    const normalizedWeight = voice.weight / totalWeight;
    const secondsUsed = durationSeconds * normalizedWeight;

    // Fetch licensing terms if available
    let licensing: LicensingTerms | undefined;
    let ratePerSecondCents = 2; // Default rate: $0.02/second

    if (voice.o8IdentityId) {
      licensing = await fetchVoiceLicense(voice.o8IdentityId) || undefined;
      if (licensing?.rate_per_second_cents) {
        ratePerSecondCents = licensing.rate_per_second_cents;
      }
    }

    breakdown.push({
      personaId: voice.personaId,
      o8IdentityId: voice.o8IdentityId,
      weight: normalizedWeight,
      secondsUsed,
      ratePerSecondCents,
      totalCents: Math.ceil(secondsUsed * ratePerSecondCents),
      licensing,
    });
  }

  return breakdown;
}

/**
 * Generates a fingerprint for the hybrid voice
 */
function generateHybridFingerprint(
  blendedEmbedding: number[],
  voiceIds: string[]
): string {
  const crypto = require('crypto');
  const data = JSON.stringify({ embedding: blendedEmbedding.slice(0, 32), voiceIds });
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 32);
}

/**
 * Build a ProviderRequest for a single voice in the hybrid.
 *
 * Style controls are resolved in layers: per-voice persona defaults,
 * overridden by hybrid-level styleHints (energy/clarity/warmth), with
 * safe fallbacks.
 */
function buildRequestForVoice(
  personaId: string,
  text: string,
  hints: HybridSynthesisRequest['styleHints'],
  emotion: HybridSynthesisRequest['emotion']
): ProviderRequest {
  const persona = findPersona(personaId);
  const base: StyleControls = {
    ...DEFAULT_CONTROLS,
    ...(persona?.default_style_controls ?? {}),
  };
  const controls: StyleControls = {
    ...base,
    energy: hints?.energy ?? base.energy,
    // "clarity" maps onto brightness here; the EQ applied downstream treats
    // higher brightness as more intelligibility, which is what clarity asks
    // for in the hybrid request vocabulary.
    brightness: hints?.clarity ?? base.brightness,
    // "warmth" is the inverse of brightness in intent, but we also expose
    // it directly as breathiness which broadens the lower-mid bloom.
    breathiness: hints?.warmth ?? base.breathiness,
  };

  const voiceModel = persona?.voice_model_key || `cloned_${personaId}`;

  return {
    voiceModel,
    lyrics: text,
    controls,
    emotion: (emotion ?? 'neutral') as ProviderRequest['emotion'],
  };
}

/**
 * Mix N wav/audio buffers together with per-input weights using
 * ffmpeg's amix filter. Returns the path to the mixed wav under renders/.
 *
 * Weights are passed straight through to ffmpeg; amix normalises
 * internally so levels do not clip. We explicitly disable amix's
 * duration=longest vs shortest ambiguity by forcing "longest" so a
 * shorter take from one voice does not truncate the final output.
 */
async function mixWeightedBuffers(
  items: Array<{ buffer: Buffer; format: string; weight: number }>,
  outputPath: string
): Promise<void> {
  const tmpDir = path.join(process.cwd(), 'temp');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (items.length === 1) {
    // Single-voice: just ensure the output is wav-normalised so the
    // downstream /renders/*.wav URL works without special-casing.
    const only = items[0];
    const inPath = path.join(tmpDir, `hybrid_in_${Date.now()}.${only.format || 'wav'}`);
    fs.writeFileSync(inPath, only.buffer);
    try {
      await execAsync(`ffmpeg -y -i "${inPath}" -ar 44100 -ac 1 "${outputPath}"`);
    } finally {
      try { fs.unlinkSync(inPath); } catch {}
    }
    return;
  }

  const inputPaths: string[] = [];
  try {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const p = path.join(tmpDir, `hybrid_in_${Date.now()}_${i}.${it.format || 'wav'}`);
      fs.writeFileSync(p, it.buffer);
      inputPaths.push(p);
    }

    const inputArgs = inputPaths.map((p) => `-i "${p}"`).join(' ');
    const weightsStr = items.map((it) => it.weight.toFixed(4)).join(' ');
    const filter = `amix=inputs=${items.length}:duration=longest:normalize=0:weights=${weightsStr}`;

    const cmd = `ffmpeg -y ${inputArgs} -filter_complex "${filter}" -ar 44100 -ac 1 "${outputPath}"`;
    await execAsync(cmd);
  } finally {
    for (const p of inputPaths) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

/**
 * Measure an audio file's duration in seconds via ffprobe.
 * Falls back to a word-rate estimate on failure so we always return a
 * number.
 */
async function probeDurationSeconds(filePath: string, fallbackSeconds: number): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    const n = Number(stdout.trim());
    return Number.isFinite(n) && n > 0 ? n : fallbackSeconds;
  } catch {
    return fallbackSeconds;
  }
}

/**
 * Synthesizes audio using the hybrid voice profile.
 *
 * Strategy: run the chosen provider once per voice component with each
 * voice's own model, then mix the outputs together at the supplied
 * weights via ffmpeg amix. This is the honest path for spectral-transfer
 * backends like RVC that do not accept a raw speaker embedding as input.
 * The blended embedding still drives the provenance fingerprint so
 * royalty/usage tracking reflects the intended hybrid even though the
 * audio itself is produced by per-voice synthesis + weighted mix.
 */
export async function synthesizeHybrid(
  request: HybridSynthesisRequest
): Promise<HybridSynthesisResult> {
  console.log(`[HybridSynthesis] Starting synthesis with ${request.voices.length} voices`);

  if (request.voices.length === 0) {
    throw new Error('Hybrid request needs at least one voice');
  }

  // Validate licenses
  const licenseValidation = await validateHybridLicenses(request.voices);
  if (!licenseValidation.valid) {
    throw new Error(`License validation failed: ${licenseValidation.errors.join(', ')}`);
  }

  // Create blended profile (provenance + routing)
  const blendedProfile = await createBlendedProfile(request.voices, request.accentLock);

  // Determine provider key, then resolve to a real instance
  const providerKey = determineOptimalProvider(blendedProfile, request.routingMode);
  const preferredProvider = resolveProvider(providerKey);
  console.log(`[HybridSynthesis] Using provider: ${preferredProvider.label}`);

  // Normalise weights to sum to 1 so the mix levels are stable even if
  // the caller forgot to normalise.
  const totalWeight = request.voices.reduce((s, v) => s + v.weight, 0);
  const normalised = request.voices.map((v) => ({
    ...v,
    weight: totalWeight > 0 ? v.weight / totalWeight : 1 / request.voices.length,
  }));

  // Synthesise each voice through the chosen provider. We use the
  // waterfall so a single provider failure does not kill the whole
  // hybrid; the hybrid is only as reliable as its weakest voice
  // otherwise.
  const synthesised: Array<{ buffer: Buffer; format: string; weight: number; provider: string }> = [];
  for (const voice of normalised) {
    const req = buildRequestForVoice(
      voice.personaId,
      request.text,
      request.styleHints,
      request.emotion
    );
    console.log(
      `[HybridSynthesis] Synthesising voice ${voice.personaId} (weight ${voice.weight.toFixed(2)}) via ${preferredProvider.label}`
    );
    const resp: ProviderResponse = await synthesizeWithWaterfall(req, preferredProvider);
    synthesised.push({
      buffer: resp.audioBuffer,
      format: resp.format,
      weight: voice.weight,
      provider: preferredProvider.id,
    });
  }

  // Write weighted mix to the renders directory so it is served by
  // express.static('/renders', ...) like every other rendered output.
  const timestamp = Date.now();
  const outDir = path.join(process.cwd(), 'renders');
  const fileName = `hybrid-${timestamp}.wav`;
  const outPath = path.join(outDir, fileName);

  await mixWeightedBuffers(synthesised, outPath);

  // Probe real duration from the mixed output. Fall back to the
  // text-based word-rate estimate if ffprobe fails.
  const words = request.text.split(/\s+/).filter(Boolean).length;
  const fallbackDuration = Math.max(1, Math.ceil((words / 150) * 60));
  const durationSeconds = await probeDurationSeconds(outPath, fallbackDuration);

  // Calculate usage breakdown against the actual duration.
  const usageBreakdown = await calculateUsageBreakdown(normalised, durationSeconds);
  const totalCostCents = usageBreakdown.reduce((sum, u) => sum + u.totalCents, 0);

  // Provenance uses the blended embedding so the fingerprint is the
  // "intended hybrid identity" not any one voice's audio.
  const voiceIds = normalised.map((v) => v.personaId);
  const weights = normalised.map((v) => v.weight);
  const hybridFingerprint = generateHybridFingerprint(blendedProfile.embedding, voiceIds);

  // Record usage for royalty tracking
  await recordHybridUsage({
    hybridFingerprint,
    provider: preferredProvider.id,
    totalDurationSeconds: durationSeconds,
    voices: usageBreakdown.map((u) => ({
      personaId: u.personaId,
      o8IdentityId: u.o8IdentityId,
      weight: u.weight,
      ratePerSecondCents: u.ratePerSecondCents,
      revenueSplit: u.licensing?.revenue_split,
    })),
    text: request.text,
  });

  console.log(
    `[HybridSynthesis] Complete. Duration: ${durationSeconds.toFixed(2)}s, Cost: ${totalCostCents}¢, out=${fileName}`
  );

  return {
    audioUrl: `/renders/${fileName}`,
    audioPath: outPath,
    durationSeconds,
    provider: preferredProvider.id,
    usageBreakdown,
    totalCostCents,
    provenance: {
      hybridFingerprint,
      voiceIds,
      weights,
    },
  };
}
