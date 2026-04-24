import { KitsAiProvider } from './kitsAiProvider';
import { RVCProvider } from './rvcProvider';
import { DDSPProvider } from './ddspProvider';
import { SoVitsProvider } from './soVitsProvider';
import { ElevenLabsProviderEnhanced } from './elevenLabsProviderEnhanced';
import { OpenAIVoiceProvider } from './openaiVoiceProvider';
import { FishAudioProvider } from './fishAudioProvider';
import { CambAiProvider } from './cambAiProvider';
import { MiniMaxProvider } from './minimaxProvider';
import { LocalFallbackProvider } from './localFallbackProvider';
import { OpenVoiceProvider } from './openVoiceProvider';
import { SunoProvider } from './sunoProvider';
import { SingingProvider, ProviderRequest, ProviderResponse } from './base';

const kitsProvider = new KitsAiProvider();
const rvcProvider = new RVCProvider();
const ddspProvider = new DDSPProvider();
const soVitsProvider = new SoVitsProvider();
const elevenLabsProvider = new ElevenLabsProviderEnhanced();
const openaiProvider = new OpenAIVoiceProvider();
const fishAudioProvider = new FishAudioProvider();
const cambAiProvider = new CambAiProvider();
const minimaxProvider = new MiniMaxProvider();
const openVoiceProvider = new OpenVoiceProvider();
const sunoProvider = new SunoProvider();
const localFallbackProvider = new LocalFallbackProvider();

const providerRegistry: Record<string, SingingProvider> = {
  'kits-ai': kitsProvider,
  ddsp: ddspProvider,
  'so-vits': soVitsProvider,
  rvc: rvcProvider,
  elevenlabs: elevenLabsProvider,
  'openai-voice': openaiProvider,
  'fish-audio': fishAudioProvider,
  'camb-ai': cambAiProvider,
  minimax: minimaxProvider,
  openvoice: openVoiceProvider,
  // Suno is reserved for vocals that were originally generated on Suno.
  // voiceModel format: "persona_id:<id>[|seed:<n>]"
  suno: sunoProvider,
  'chromox-clone': ddspProvider,
  'chromox-labs': elevenLabsProvider
};

// Named export so vocalRegen.ts can call provider.inpaint() without
// losing the Suno-specific typing.
export { sunoProvider };

// Re-export the openvoice instance so hybridSynthesis can take its fast
// path (blend_synthesize) without calling resolveProvider indirectly.
export { openVoiceProvider };

export function resolveProvider(providerKey: string | undefined) {
  if (!providerKey) return kitsProvider;
  return providerRegistry[providerKey] ?? kitsProvider;
}

export function listProviders() {
  return Object.entries(providerRegistry).map(([key, provider]) => ({
    key,
    label: provider.label
  }));
}

/**
 * Map provider IDs to their API key env var names.
 * Used to skip providers running in demo-key mode (they return mock garbage).
 */
const providerApiKeyMap: Record<string, string> = {
  elevenlabs: 'ELEVENLABS_API_KEY',
  'fish-audio': 'FISH_AUDIO_API_KEY',
  'camb-ai': 'CAMB_AI_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  'kits-ai': 'KITS_AI_API_KEY',
};

// Providers that don't actually do voice synthesis (return placeholders)
const placeholderProviders = new Set(['openai-voice']);

function hasRealApiKey(provider: SingingProvider): boolean {
  if (placeholderProviders.has(provider.id)) return false;
  const envVar = providerApiKeyMap[provider.id];
  if (!envVar) return true; // RVC, local-fallback — no API key needed
  const key = process.env[envVar];
  return Boolean(key && key !== 'demo-key');
}

/**
 * Waterfall synthesis: try the preferred provider, then cascade through
 * providers that have real API keys, then fall back to local ffmpeg transform.
 *
 * Skips providers with demo-key (they return headerless PCM — unplayable).
 */
const waterfallOrder: SingingProvider[] = [
  ddspProvider,
  soVitsProvider,
  rvcProvider,
  elevenLabsProvider,
  fishAudioProvider,
  cambAiProvider,
  minimaxProvider,
  kitsProvider
];

export async function synthesizeWithWaterfall(
  request: ProviderRequest,
  preferredProvider: SingingProvider
): Promise<ProviderResponse> {
  const errors: Array<{ provider: string; error: string }> = [];

  // Try preferred provider first (always try it — it was explicitly chosen)
  try {
    console.log(`[Waterfall] Trying preferred provider: ${preferredProvider.label}`);
    return await preferredProvider.synthesize(request);
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`[Waterfall] ${preferredProvider.label} failed: ${msg}`);
    errors.push({ provider: preferredProvider.label, error: msg });
  }

  // Try remaining providers — only those with real API keys
  for (const provider of waterfallOrder) {
    if (provider.id === preferredProvider.id) continue;
    if (!hasRealApiKey(provider)) {
      console.log(`[Waterfall] Skipping ${provider.label} (demo-key / no API key)`);
      errors.push({ provider: provider.label, error: 'No API key configured (demo-key)' });
      continue;
    }

    try {
      console.log(`[Waterfall] Trying fallback provider: ${provider.label}`);
      return await provider.synthesize(request);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`[Waterfall] ${provider.label} failed: ${msg}`);
      errors.push({ provider: provider.label, error: msg });
    }
  }

  // All API providers failed — use local ffmpeg fallback
  console.warn('[Waterfall] All API providers failed. Attempting local ffmpeg voice transform...');
  try {
    const result = await localFallbackProvider.synthesize(request);
    console.log('[Waterfall] Local fallback produced audio. Quality is approximate.');
    return result;
  } catch (err: any) {
    const msg = err?.message || String(err);
    errors.push({ provider: 'Local FFmpeg Fallback', error: msg });
  }

  // Everything failed — throw with details of all attempts
  const summary = errors.map(e => `  - ${e.provider}: ${e.error}`).join('\n');
  throw new Error(
    `All voice synthesis providers failed.\n${summary}\n\n` +
    'To fix: configure a valid API key for at least one provider (ELEVENLABS_API_KEY, OPENAI_API_KEY, FISH_AUDIO_API_KEY, CAMB_AI_API_KEY, or MINIMAX_API_KEY), ' +
    'or provide a guide vocal for local ffmpeg fallback.'
  );
}
