import { useEffect, useState, useCallback } from 'react';
import { EffectSettings, Persona, RenderHistoryItem, StyleControls, GuideSuggestion, TasteProfile, FolioClip } from '../types';
import { StyleGrid } from './StyleGrid';
import { GuideDropzone } from './GuideDropzone';
import { Meter } from './Meter';
import { AudioPlayer } from './AudioPlayer';
import { uploadGuideSample, fetchGuideSuggestions, mintGuideClip, fetchTasteProfile, API_HOST, sendSonicSignal } from '../lib/api';
import { ThumbUpIcon, ThumbDownIcon, ChevronDownIcon, SparklesIcon } from './Icons';
import { studioPresets, parseStylePrompt, applyPreset, StudioPreset } from '../lib/studioPresets';

type StudioMode = 'simple' | 'advanced';

interface ABSlot {
  url: string;
  controls: StyleControls;
  effects: EffectSettings;
  stylePrompt: string;
  render?: RenderHistoryItem;
}

const defaultControls: StyleControls = {
  brightness: 0.5,
  breathiness: 0.4,
  energy: 0.6,
  formant: 0,
  vibratoDepth: 0.4,
  vibratoRate: 0.4,
  roboticism: 0.2,
  glitch: 0.15,
  stereoWidth: 0.7
};

const defaultEffects: EffectSettings = {
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
  orbitDepth: 0.75,
  orbitTilt: 0.4,
  bypassEffects: false
};

type NumericEffectKey = 'clarity' | 'air' | 'drive' | 'width' | 'noiseReduction' | 'dynamics';
const effectSliderConfig: Array<{ key: NumericEffectKey; label: string }> = [
  { key: 'clarity', label: 'Clarity' },
  { key: 'air', label: 'Air' },
  { key: 'drive', label: 'Drive' },
  { key: 'width', label: 'Stereo Width' },
  { key: 'noiseReduction', label: 'Noise Reduction' },
  { key: 'dynamics', label: 'Dynamics' }
];
type OrbitEffectKey = 'orbitSpeed' | 'orbitDepth' | 'orbitTilt';
const orbitSliderConfig: Array<{ key: OrbitEffectKey; label: string; defaultValue: number }> = [
  { key: 'orbitSpeed', label: 'Orbit Speed', defaultValue: 0.5 },
  { key: 'orbitDepth', label: 'Orbit Depth', defaultValue: 0.75 },
  { key: 'orbitTilt', label: 'Orbit Tilt', defaultValue: 0.4 }
];

type Props = {
  personas: Persona[];
  activePersonaId?: string;
  onPersonaChange: (id: string) => void;
  onRewrite: (lyrics: string, stylePrompt: string) => Promise<string>;
  onRender: (payload: {
    personaId: string;
    lyrics: string;
    controls: StyleControls;
    stylePrompt: string;
    effects: EffectSettings;
    label?: string;
    accent?: string;
    accentLocked?: boolean;
    guideSampleId?: string;
    guideMatchIntensity?: number;
    guideUseLyrics?: boolean;
    guideTempo?: number;
    guide?: File;
    folioClipId?: string;
    providerOverride?: string;
  }) => Promise<{ audioUrl: string; render: RenderHistoryItem }>;
  onRenderComplete: (render: RenderHistoryItem) => void;
  prefill?: RenderHistoryItem | null;
  onPrefillConsumed?: () => void;
  onPreview: (payload: {
    personaId: string;
    lyrics: string;
    controls: StyleControls;
    stylePrompt: string;
    effects: EffectSettings;
    guide?: File;
    previewSeconds?: number;
    accent?: string;
    accentLocked?: boolean;
    guideSampleId?: string;
    guideMatchIntensity?: number;
    guideUseLyrics?: boolean;
    guideTempo?: number;
    folioClipId?: string;
  }) => Promise<{ audioUrl: string }>;
  onGuideLibraryUpdated?: () => void;
  onRateRender: (jobId: string, rating: 'like' | 'dislike' | 'neutral') => Promise<void>;
  tasteProfileVersion?: number;
  folioClips?: FolioClip[];
};

export function StudioPanel({
  personas,
  activePersonaId,
  onPersonaChange,
  onRewrite,
  onRender,
  onRenderComplete,
  prefill,
  onPrefillConsumed,
  onPreview,
  onGuideLibraryUpdated,
  onRateRender,
  tasteProfileVersion,
  folioClips
}: Props) {
  const [lyrics, setLyrics] = useState('Layer me in prismatic light...');
  const [stylePrompt, setStylePrompt] = useState('holographic croon, velvet aggression');
  const [controls, setControls] = useState<StyleControls>(defaultControls);
  const [effects, setEffects] = useState<EffectSettings>(defaultEffects);
  const [label, setLabel] = useState('');
  const [accent, setAccent] = useState('auto');
  const [accentLocked, setAccentLocked] = useState(false);
  const [guide, setGuide] = useState<File | undefined>(undefined);
  const [outputUrl, setOutputUrl] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [guideMatchIntensity, setGuideMatchIntensity] = useState(0.85);
  const [selectedGuideSampleId, setSelectedGuideSampleId] = useState<string | undefined>(undefined);
  const [guideName, setGuideName] = useState('');
  const [savingGuide, setSavingGuide] = useState(false);
  const [guideUseLyrics, setGuideUseLyrics] = useState(true);
  const [guideTempo, setGuideTempo] = useState(1);
  const [guideDurationPreset, setGuideDurationPreset] = useState<'5s' | '12s' | '30s' | '60s' | '90s' | 'full' | 'custom'>('full');
  const [guideStartTime, setGuideStartTime] = useState(0);
  const [guideEndTime, setGuideEndTime] = useState(0);
  const [guideAccentBlend, setGuideAccentBlend] = useState(0.5); // 0 = keep guide accent, 1 = use persona accent
  const [guideSuggestions, setGuideSuggestions] = useState<GuideSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [mintingSuggestionId, setMintingSuggestionId] = useState<string | null>(null);
  const [latestRender, setLatestRender] = useState<RenderHistoryItem | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);
  const [tasteLoading, setTasteLoading] = useState(false);
  const [renderError, setRenderError] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState('rvc');
  const [customMintMode, setCustomMintMode] = useState<'glitch' | 'dream' | 'anthem'>('glitch');
  const [mintDuration, setMintDuration] = useState<number>(12);
  const [voiceControlsOpen, setVoiceControlsOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  // Simple/Advanced mode and presets
  const [studioMode, setStudioMode] = useState<StudioMode>('simple');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [autoConfiguring, setAutoConfiguring] = useState(false);

  // A/B Comparison
  const [abSlotA, setAbSlotA] = useState<ABSlot | null>(null);
  const [abSlotB, setAbSlotB] = useState<ABSlot | null>(null);
  const [activeAbSlot, setActiveAbSlot] = useState<'A' | 'B'>('A');
  const [abMode, setAbMode] = useState(false);

  const customMintSuggestion: GuideSuggestion = {
    id: `custom-${customMintMode}`,
    title: 'Custom Mint',
    description: `Chromox ${customMintMode} generator`,
    reason: 'Manually trigger Chromox Labs mint',
    vibe: customMintMode === 'dream' ? 'nostalgic' : customMintMode === 'anthem' ? 'hype' : 'glitch',
    energyScore: customMintMode === 'dream' ? 0.5 : customMintMode === 'anthem' ? 0.95 : 0.75,
    matchConfidence: tasteProfile?.energeticPreference ?? 0.7,
    action: 'mint',
    mintMode: customMintMode
  };
  const activePersona = personas.find((p) => p.id === activePersonaId);
  const guideSamples = activePersona?.guide_samples ?? [];
  const hasGuideSelection = Boolean(selectedGuideSampleId || guide);

  useEffect(() => {
    if (prefill) {
      setLyrics(prefill.lyrics);
      setStylePrompt(prefill.stylePrompt);
      setControls(prefill.controls);
      setEffects(prefill.effects);
      setLabel(prefill.label ?? '');
      setAccent(prefill.accent ?? 'auto');
      setAccentLocked(prefill.accentLocked ?? false);
      setGuideMatchIntensity(prefill.guideMatchIntensity ?? 0.85);
      setSelectedGuideSampleId(prefill.guideSampleId);
      setGuideUseLyrics(prefill.guideUseLyrics ?? true);
      setGuideTempo(prefill.guideTempo ?? 1);
      onPrefillConsumed?.();
    }
  }, [prefill?.id]);

  useEffect(() => {
    setSelectedGuideSampleId(undefined);
    setGuideUseLyrics(false);
    setGuideTempo(1);
    setLatestRender(null);
  }, [activePersonaId]);

  useEffect(() => {
    if (!activePersonaId) {
      setGuideSuggestions([]);
      setTasteProfile(null);
      return;
    }
    refreshGuideSuggestions(activePersonaId);
    refreshTasteProfile(activePersonaId);
  }, [activePersonaId, guideSamples.length, tasteProfileVersion]);

  async function handleRewrite() {
    const personaName = personas.find((p) => p.id === activePersonaId)?.name ?? 'Chromox';
    const result = await onRewrite(lyrics, `${personaName} :: ${stylePrompt}`);
    setLyrics(result);
  }

  // Apply a preset to current settings
  function handleApplyPreset(preset: StudioPreset) {
    const { controls: newControls, effects: newEffects } = applyPreset(preset, controls, effects);
    setControls(newControls);
    setEffects(newEffects);
    setSelectedPresetId(preset.id);
    if (preset.stylePromptSuggestion && !stylePrompt.trim()) {
      setStylePrompt(preset.stylePromptSuggestion);
    }
  }

  // Auto-configure controls based on style prompt keywords
  function handleAutoConfig() {
    if (!stylePrompt.trim()) return;
    setAutoConfiguring(true);
    const adjustments = parseStylePrompt(stylePrompt);
    if (Object.keys(adjustments.controls).length > 0) {
      setControls(prev => ({ ...prev, ...adjustments.controls }));
    }
    if (Object.keys(adjustments.effects).length > 0) {
      setEffects(prev => ({ ...prev, ...adjustments.effects }));
    }
    setSelectedPresetId(null); // Clear preset since we're custom now
    setTimeout(() => setAutoConfiguring(false), 500);
  }

  // A/B Comparison handlers
  function handleRenderToSlot(slot: 'A' | 'B') {
    return async () => {
      if (!activePersonaId) return;
      setBusy(true);
      setRenderError('');
      try {
        const result = await onRender({
          personaId: activePersonaId,
          lyrics,
          controls,
          stylePrompt,
          effects,
          label,
          accent: accent === 'auto' ? undefined : accent,
          accentLocked,
          guideSampleId: selectedGuideSampleId,
          guideMatchIntensity,
          guideUseLyrics,
          guideTempo,
          guide,
                  });
        const abSlot: ABSlot = {
          url: result.audioUrl,
          controls: { ...controls },
          effects: { ...effects },
          stylePrompt,
          render: result.render
        };
        if (slot === 'A') {
          setAbSlotA(abSlot);
        } else {
          setAbSlotB(abSlot);
        }
        setActiveAbSlot(slot);
        onRenderComplete(result.render);
        setLatestRender(result.render);
      } catch (err: any) {
        const message = err?.response?.data?.error || err?.message || 'Render failed — unknown error';
        console.error('[StudioPanel] A/B Render failed:', message);
        setRenderError(message);
      } finally {
        setBusy(false);
      }
    };
  }

  function handlePickWinner(slot: 'A' | 'B') {
    const winner = slot === 'A' ? abSlotA : abSlotB;
    if (winner?.render) {
      onRateRender(winner.render.id, 'like');
    }
    // Load winner settings
    if (winner) {
      setControls(winner.controls);
      setEffects(winner.effects);
      setStylePrompt(winner.stylePrompt);
      setOutputUrl(winner.url);
    }
    setAbMode(false);
    setAbSlotA(null);
    setAbSlotB(null);
  }

  async function handleRender() {
    if (!activePersonaId) return;
    setBusy(true);
    setRenderError('');
    try {
      const result = await onRender({
        personaId: activePersonaId,
        lyrics,
        controls,
        stylePrompt,
        effects,
        label,
        accent: accent === 'auto' ? undefined : accent,
        accentLocked,
        guideSampleId: selectedGuideSampleId,
        guideMatchIntensity,
        guideUseLyrics,
        guideTempo,
        guide,
        providerOverride: selectedProvider,
      });
      setOutputUrl(result.audioUrl);
      onRenderComplete(result.render);
      setLatestRender(result.render);
      sendSonicSignal('render', result.render.id, {
        personaId: activePersonaId,
        effectPreset: effects.preset,
        guideSampleId: selectedGuideSampleId
      });
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Render failed — unknown error';
      console.error('[StudioPanel] Render failed:', message);
      setRenderError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    if (!activePersonaId) return;
    setPreviewBusy(true);
    setRenderError('');
    try {
      const result = await onPreview({
        personaId: activePersonaId,
        lyrics,
        controls,
        stylePrompt,
        effects,
        accent: accent === 'auto' ? undefined : accent,
        accentLocked,
        guideSampleId: selectedGuideSampleId,
        guideMatchIntensity,
        guideUseLyrics,
        guideTempo,
        guide,
        previewSeconds: 12,
              });
      setPreviewUrl(result.audioUrl);
      sendSonicSignal('preview', undefined, {
        personaId: activePersonaId,
        effectPreset: effects.preset,
        guideSampleId: selectedGuideSampleId
      });
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Preview failed — unknown error';
      console.error('[StudioPanel] Preview failed:', message);
      setRenderError(message);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleSaveGuideSample() {
    if (!activePersonaId || !guide) return;
    setSavingGuide(true);
    try {
      const entry = await uploadGuideSample(activePersonaId, guide, guideName || guide.name);
      setSelectedGuideSampleId(entry.id);
      setGuideName('');
      onGuideLibraryUpdated?.();
    } catch (error) {
      console.error('[Guide] Failed to save sample', error);
    } finally {
      setSavingGuide(false);
    }
  }

  async function refreshGuideSuggestions(personaId: string) {
    setSuggestionsLoading(true);
    try {
      const data = await fetchGuideSuggestions(personaId);
      setGuideSuggestions(data);
    } catch (error) {
      console.error('[Guide] Failed to fetch suggestions', error);
      setGuideSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function refreshTasteProfile(personaId: string) {
    setTasteLoading(true);
    try {
      const profile = await fetchTasteProfile(personaId);
      setTasteProfile(profile);
      if (profile.recommendedMintMode) {
        setCustomMintMode(profile.recommendedMintMode);
      }
    } catch (error) {
      console.error('[Guide] Failed to fetch taste profile', error);
      setTasteProfile(null);
    } finally {
      setTasteLoading(false);
    }
  }

  function handleUseSuggestion(suggestion: GuideSuggestion) {
    if (!suggestion.sampleId) return;
    setSelectedGuideSampleId(suggestion.sampleId);
    sendSonicSignal('use_guide', suggestion.sampleId, { personaId: activePersonaId });
  }

  async function handleMintSuggestion(suggestion: GuideSuggestion) {
    if (!activePersonaId) return;
    setMintingSuggestionId(suggestion.id);
    try {
      const sample = await mintGuideClip(
        activePersonaId,
        suggestion.mintMode ?? 'glitch',
        mintDuration,
        true // dry mode enabled by default
      );
      setSelectedGuideSampleId(sample.id);
      sendSonicSignal('mint', sample.id, { personaId: activePersonaId, mode: suggestion.mintMode });
      if (onGuideLibraryUpdated) {
        await onGuideLibraryUpdated();
      }
      await refreshGuideSuggestions(activePersonaId);
      await refreshTasteProfile(activePersonaId);
    } catch (error) {
      console.error('[Guide] Failed to mint clip', error);
    } finally {
      setMintingSuggestionId(null);
    }
  }

  async function handleRateLatest(rating: 'like' | 'dislike' | 'neutral') {
    if (!latestRender) return;
    setRatingBusy(true);
    try {
      const nextRating = latestRender.rating === rating ? 'neutral' : rating;
      await onRateRender(latestRender.id, nextRating);
      setLatestRender((prev) => (prev ? { ...prev, rating: nextRating } : prev));
      if (activePersonaId) {
        await refreshTasteProfile(activePersonaId);
      }
    } finally {
      setRatingBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mode Toggle & Preset Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-default bg-surface p-4">
        {/* Mode Toggle */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Mode</span>
          <div className="flex rounded-lg border border-border-default bg-canvas p-0.5">
            <button
              onClick={() => setStudioMode('simple')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                studioMode === 'simple'
                  ? 'bg-accent text-canvas'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              Simple
            </button>
            <button
              onClick={() => setStudioMode('advanced')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                studioMode === 'advanced'
                  ? 'bg-accent text-canvas'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              Advanced
            </button>
          </div>
        </div>

        {/* Preset Selector - Horizontal scroll, no wrap */}
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted">Preset</span>
          <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {studioPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleApplyPreset(preset)}
                title={preset.description}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                  selectedPresetId === preset.id
                    ? 'bg-accent text-canvas'
                    : 'border border-border-default bg-canvas text-secondary hover:border-accent/40 hover:text-primary'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* A/B Mode Toggle */}
        <button
          onClick={() => setAbMode(!abMode)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            abMode
              ? 'bg-purple-500/20 border border-purple-500/40 text-purple-400'
              : 'border border-border-default text-secondary hover:border-border-emphasis'
          }`}
        >
          A/B Compare
        </button>
      </div>

      {/* Lyrics & Style Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Lyrics & Prompt */}
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
              Lyrics
            </label>
            <textarea
              className={`w-full resize-none rounded-xl border border-border-default bg-surface px-4 py-3 text-sm leading-relaxed text-primary placeholder-disabled focus:border-accent focus:outline-none ${
                studioMode === 'simple' ? 'h-32' : 'h-48'
              }`}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Enter your lyrics..."
            />
            {studioMode === 'advanced' && (
              <button
                onClick={handleRewrite}
                className="mt-3 rounded-lg border border-border-default bg-surface px-4 py-2 text-xs font-medium uppercase tracking-wider text-secondary transition hover:bg-overlay hover:border-border-emphasis"
              >
                Rewrite with AI
              </button>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-muted">
                Style Prompt
              </label>
              <button
                onClick={handleAutoConfig}
                disabled={!stylePrompt.trim() || autoConfiguring}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-accent transition hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Auto-configure controls based on style keywords"
              >
                <SparklesIcon size={12} />
                {autoConfiguring ? 'Configuring...' : 'Auto-Config'}
              </button>
            </div>
            <input
              className="w-full rounded-xl border border-border-default bg-surface px-4 py-3 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
              value={stylePrompt}
              onChange={(e) => setStylePrompt(e.target.value)}
              placeholder="e.g., ethereal, dreamy, powerful..."
            />
            <p className="mt-1 text-[10px] text-muted">
              Try keywords like: breathy, aggressive, glitchy, warm, bright, dreamy, vintage, 8d
            </p>
          </div>

          {studioMode === 'advanced' && (
          <>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
                Session Tag / Collection
              </label>
              <input
                className="w-full rounded-xl border border-border-default bg-surface px-4 py-3 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Neon Ballad Pack"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
                Accent
              </label>
              <select
                className="w-full rounded-xl border border-border-default bg-surface px-4 py-3 text-sm text-primary focus:border-accent focus:outline-none"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
              >
                <option value="auto">Auto / Persona Default</option>
                <option value="uk-london">British · London</option>
                <option value="us-west">American · West Coast</option>
                <option value="us-south">American · Southern</option>
                <option value="au-melbourne">Australian · Melbourne</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
            <input
              type="checkbox"
              className=""
              checked={accentLocked}
              onChange={(e) => setAccentLocked(e.target.checked)}
            />
            Lock Accent
          </label>

          <div className="space-y-3">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
                Guide Vocal (Optional)
              </label>
              <GuideDropzone onFile={setGuide} />
            </div>
            {guide && activePersonaId && (
              <div className="flex flex-col gap-2 rounded-xl border border-border-default bg-surface p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">Save uploaded clip</p>
                <input
                  className="rounded-lg border border-border-default bg-canvas px-3 py-2 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
                  placeholder="Clip name"
                  value={guideName}
                  onChange={(e) => setGuideName(e.target.value)}
                />
                <button
                  onClick={handleSaveGuideSample}
                  disabled={savingGuide}
                  className="rounded-lg border border-border-default px-3 py-2 text-xs font-medium uppercase tracking-wide text-secondary transition hover:border-border-emphasis disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingGuide ? 'Saving...' : 'Save to Voice Library'}
                </button>
              </div>
            )}
            {(guideSamples.length > 0 || guide) && (
              <div className="space-y-3 rounded-xl border border-border-default bg-surface p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">Guide Controls</p>
                {guideSamples.length > 0 && (
                  <>
                    <select
                      className="mt-2 w-full rounded-lg border border-border-default bg-canvas px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                      value={selectedGuideSampleId ?? ''}
                      onChange={(e) => setSelectedGuideSampleId(e.target.value || undefined)}
                    >
                      <option value="">Use uploaded clip</option>
                      {guideSamples.map((sample) => (
                        <option key={sample.id} value={sample.id}>
                          {sample.name}
                        </option>
                      ))}
                    </select>
                    {selectedGuideSampleId && guideSamples.find((s) => s.id === selectedGuideSampleId)?.url && (
                      <div className="mt-2">
                        <AudioPlayer
                          src={(() => {
                            const url = guideSamples.find((s) => s.id === selectedGuideSampleId)!.url!;
                            return url.startsWith('http') ? url : `${API_HOST}${url}`;
                          })()}
                          label={guideSamples.find((s) => s.id === selectedGuideSampleId)?.name ?? 'Guide Preview'}
                        />
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-muted">
                      Choose a stored guide or leave blank to use the freshly uploaded clip.
                    </p>
                  </>
                )}
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
                  <input
                    type="checkbox"
                    className=""
                    checked={guideUseLyrics}
                    onChange={(e) => setGuideUseLyrics(e.target.checked)}
                    disabled={!hasGuideSelection}
                  />
                  Use guide lyrics
                </label>
                <p className="text-[11px] text-muted">
                  {hasGuideSelection
                    ? 'When enabled, your typed lyrics are ignored and the guide\'s transcription is used.'
                    : 'Upload or select a guide to enable lyric matching.'}
                </p>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Guide Match Intensity</p>
                  <div className="mt-1 flex items-center justify-between text-xs text-secondary">
                    <span>Alien/Creative</span>
                    <span className="font-mono text-primary">{Math.round(guideMatchIntensity * 100)}%</span>
                    <span>Exact Match</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={guideMatchIntensity}
                    onChange={(e) => setGuideMatchIntensity(parseFloat(e.target.value))}
                    disabled={!hasGuideSelection}
                    className="mt-1 w-full  disabled:opacity-40"
                  />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Accent Blend</p>
                  <div className="mt-1 flex items-center justify-between text-xs text-secondary">
                    <span>Guide Accent</span>
                    <span className="font-mono text-primary">{Math.round(guideAccentBlend * 100)}%</span>
                    <span>Persona Voice</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={guideAccentBlend}
                    onChange={(e) => setGuideAccentBlend(parseFloat(e.target.value))}
                    disabled={!hasGuideSelection}
                    className="mt-1 w-full  disabled:opacity-40"
                  />
                  <p className="mt-1 text-[10px] text-muted">
                    Left: Keep guide's accent (Patois, etc). Right: Use persona's trained voice
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Guide Tempo</p>
                  <div className="mt-1 flex items-center justify-between text-xs text-secondary">
                    <span>Speed</span>
                    <span className="font-mono text-primary">{guideTempo.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={6}
                    step={0.05}
                    value={guideTempo}
                    onChange={(e) => setGuideTempo(parseFloat(e.target.value))}
                    disabled={!hasGuideSelection}
                    className="mt-1 w-full disabled:opacity-40"
                  />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Render Length</p>
                  <select
                    value={guideDurationPreset}
                    onChange={(e) => {
                      const val = e.target.value as typeof guideDurationPreset;
                      setGuideDurationPreset(val);
                      if (val === '5s') { setGuideStartTime(0); setGuideEndTime(5); }
                      else if (val === '12s') { setGuideStartTime(0); setGuideEndTime(12); }
                      else if (val === '30s') { setGuideStartTime(0); setGuideEndTime(30); }
                      else if (val === '60s') { setGuideStartTime(0); setGuideEndTime(60); }
                      else if (val === '90s') { setGuideStartTime(0); setGuideEndTime(90); }
                      else if (val === 'full') { setGuideStartTime(0); setGuideEndTime(0); }
                    }}
                    disabled={!hasGuideSelection}
                    className="mt-1 w-full rounded-lg border border-border-default bg-canvas px-3 py-2 text-sm text-primary disabled:opacity-40"
                  >
                    <option value="5s">5 seconds</option>
                    <option value="12s">12 seconds</option>
                    <option value="30s">30 seconds</option>
                    <option value="60s">1 minute</option>
                    <option value="90s">1:30 minutes</option>
                    <option value="full">Full length</option>
                    <option value="custom">Custom region</option>
                  </select>
                </div>
                {guideDurationPreset === 'custom' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted">Start (seconds)</p>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={guideStartTime}
                        onChange={(e) => setGuideStartTime(parseFloat(e.target.value) || 0)}
                        disabled={!hasGuideSelection}
                        className="mt-1 w-full rounded-lg border border-border-default bg-canvas px-3 py-2 text-sm text-primary disabled:opacity-40"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted">End (seconds)</p>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={guideEndTime}
                        onChange={(e) => setGuideEndTime(parseFloat(e.target.value) || 0)}
                        disabled={!hasGuideSelection}
                        className="mt-1 w-full rounded-lg border border-border-default bg-canvas px-3 py-2 text-sm text-primary disabled:opacity-40"
                        placeholder="Auto"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Suggested Clips — collapsible with horizontal scroll */}
            <div className="rounded-xl border border-border-default bg-surface">
              <button
                type="button"
                onClick={() => setSuggestionsOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-[11px] uppercase tracking-wider text-muted transition hover:text-secondary"
              >
                <span>Suggested Clips {!suggestionsLoading && guideSuggestions.length > 0 ? `(${guideSuggestions.length})` : ''}</span>
                <ChevronDownIcon
                  size={14}
                  className={`transition-transform duration-200 ${suggestionsOpen ? '' : '-rotate-90'}`}
                />
              </button>
              {suggestionsOpen && (
                <div className="space-y-3 border-t border-border-subtle px-4 pb-4 pt-3">
                  {suggestionsLoading && (
                    <p className="text-xs text-muted">Analyzing persona...</p>
                  )}

                  {/* Horizontal scroll strip of suggestion cards */}
                  {guideSuggestions.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                      {guideSuggestions.map((suggestion) => (
                        <div
                          key={suggestion.id}
                          className="flex w-52 shrink-0 flex-col rounded-xl border border-border-default bg-canvas p-3"
                        >
                          <p className="truncate text-sm font-medium text-primary">{suggestion.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{suggestion.description}</p>
                          <div className="mt-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted">
                            <span>{suggestion.vibe}</span>
                            <span>{Math.round(suggestion.matchConfidence * 100)}%</span>
                          </div>
                          {suggestion.previewUrl && (
                            <div className="mt-2">
                              <AudioPlayer
                                src={suggestion.previewUrl.startsWith('http') ? suggestion.previewUrl : `${API_HOST}${suggestion.previewUrl}`}
                                label={suggestion.title}
                              />
                            </div>
                          )}
                          <div className="mt-auto pt-2">
                            {suggestion.action === 'use' ? (
                              <button
                                onClick={() => handleUseSuggestion(suggestion)}
                                className="w-full rounded-lg border border-border-default py-1.5 text-[11px] font-medium uppercase tracking-wide text-secondary transition hover:border-border-emphasis hover:text-primary"
                              >
                                Use Guide
                              </button>
                            ) : (
                              <button
                                onClick={() => handleMintSuggestion(suggestion)}
                                disabled={mintingSuggestionId === suggestion.id}
                                className="w-full rounded-lg border border-accent/40 py-1.5 text-[11px] font-medium uppercase tracking-wide text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {mintingSuggestionId === suggestion.id ? 'Minting...' : 'Mint'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Mint custom clip — compact row */}
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-default bg-elevated px-3 py-2">
                    <span className="text-[11px] text-secondary">Mint:</span>
                    <select
                      value={customMintMode}
                      onChange={(e) => setCustomMintMode(e.target.value as 'glitch' | 'dream' | 'anthem')}
                      className="rounded-md border border-border-default bg-canvas px-2 py-1 text-xs text-primary focus:border-accent focus:outline-none"
                    >
                      <option value="glitch">Glitch</option>
                      <option value="dream">Dream</option>
                      <option value="anthem">Anthem</option>
                    </select>
                    <select
                      value={mintDuration}
                      onChange={(e) => setMintDuration(Number(e.target.value))}
                      className="rounded-md border border-border-default bg-canvas px-2 py-1 text-xs text-primary focus:border-accent focus:outline-none"
                    >
                      <option value={5}>5s</option>
                      <option value={12}>12s</option>
                      <option value={30}>30s</option>
                      <option value={60}>60s</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleMintSuggestion(customMintSuggestion)}
                      className="rounded-md border border-accent/40 px-3 py-1 text-[11px] font-medium text-accent transition hover:border-accent"
                    >
                      Mint Now
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Taste Profile */}
            {tasteProfile && (
              <div className="space-y-3 rounded-xl border border-border-default bg-surface p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-secondary">Taste Profile</p>
                  <span className="font-mono text-[10px] text-muted">
                    {tasteLoading ? 'Refreshing...' : `${tasteProfile.likes} liked / ${tasteProfile.dislikes} passed`}
                  </span>
                </div>
                <div className="grid gap-3 text-sm text-secondary sm:grid-cols-2">
                  <div className="rounded-lg border border-border-subtle bg-canvas p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted">Energy Bias</p>
                    <p className="text-xl font-semibold text-primary">{Math.round(tasteProfile.energeticPreference * 100)}%</p>
                    <p className="text-xs text-muted">Glitch affinity {Math.round(tasteProfile.glitchAffinity * 100)}%</p>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-canvas p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted">Recommended Mint Mode</p>
                    <p className="text-xl font-semibold capitalize text-primary">{tasteProfile.recommendedMintMode}</p>
                    {tasteProfile.favoriteGuide && (
                      <p className="text-xs text-muted">
                        Fav guide: {tasteProfile.favoriteGuide.name}
                        {tasteProfile.favoriteGuide.mood ? ` (${tasteProfile.favoriteGuide.mood})` : ''}
                      </p>
                    )}
                  </div>
                </div>
                {tasteProfile.recentLabels.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-muted">
                    {tasteProfile.recentLabels.map((label) => (
                      <span key={label} className="rounded-full border border-border-default px-3 py-1">
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* Right: Style Controls - Advanced Mode Only */}
        {studioMode === 'advanced' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border-default bg-surface">
            <button
              type="button"
              onClick={() => setVoiceControlsOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-[11px] uppercase tracking-wider text-muted transition hover:text-secondary"
            >
              <span>Voice Controls</span>
              <ChevronDownIcon
                size={14}
                className={`transition-transform duration-200 ${voiceControlsOpen ? '' : '-rotate-90'}`}
              />
            </button>
            {voiceControlsOpen && (
              <div className="border-t border-border-subtle px-4 pb-4 pt-3">
                <StyleGrid controls={controls} onChange={setControls} />
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border-default bg-surface">
            <button
              type="button"
              onClick={() => setEffectsOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-[11px] uppercase tracking-wider text-muted transition hover:text-secondary"
            >
              <span>Effects & Mastering</span>
              <ChevronDownIcon
                size={14}
                className={`transition-transform duration-200 ${effectsOpen ? '' : '-rotate-90'}`}
              />
            </button>
            {effectsOpen && (
            <div className="space-y-4 border-t border-border-subtle px-4 pb-4 pt-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-1 flex-col">
                  <p className="text-[11px] uppercase tracking-wide text-muted">FX Preset</p>
                  <select
                    className="mt-1 rounded-lg border border-border-default bg-canvas px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                    value={effects.preset ?? 'clean'}
                    onChange={(e) =>
                      setEffects((prev) => ({ ...prev, preset: e.target.value as EffectSettings['preset'] }))
                    }
                  >
                    <option value="clean">Clean</option>
                    <option value="lush">Lush</option>
                    <option value="vintage">Vintage Warmth</option>
                    <option value="raw">Raw Direct</option>
                    <option value="harmonic-orbit">Harmonic Orbit</option>
                    <option value="choir-cloud">Choir Cloud</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-secondary">
                  <input
                    type="checkbox"
                    className=""
                    checked={effects.bypassEffects ?? false}
                    onChange={(e) => setEffects((prev) => ({ ...prev, bypassEffects: e.target.checked }))}
                  />
                  Bypass
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {effectSliderConfig.map(({ key, label: sliderLabel }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted">
                      <span>{sliderLabel}</span>
                      <span>{Math.round(effects[key] * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={effects[key]}
                      onChange={(e) =>
                        setEffects((prev) => ({
                          ...prev,
                          [key]: parseFloat(e.target.value)
                        }))
                      }
                      className="mt-1 w-full "
                    />
                  </div>
                ))}
              </div>
              <div className="mb-4">
                <p className="mb-1 text-[11px] uppercase tracking-wider text-muted">Voice Provider</p>
                <select
                  className="w-full rounded-lg border border-border-default bg-canvas px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                >
                  <option value="rvc">Studio Clone (RVC)</option>
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wider text-muted">Engine</p>
                  <select
                    className="w-full rounded-lg border border-border-default bg-canvas px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                    value={effects.engine}
                    onChange={(e) =>
                      setEffects((prev) => ({ ...prev, engine: e.target.value as EffectSettings['engine'] }))
                    }
                  >
                    <option value="clean">Clean Vocal</option>
                    <option value="rave-ddsp">RAVE + DDSP</option>
                    <option value="rave-ddsp-8d">RAVE + DDSP + 8D Orbit</option>
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wider text-muted">Space</p>
                  <select
                    className="w-full rounded-lg border border-border-default bg-canvas px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                    value={effects.space}
                    onChange={(e) =>
                      setEffects((prev) => ({ ...prev, space: e.target.value as EffectSettings['space'] }))
                    }
                  >
                    <option value="dry">Dry Booth</option>
                    <option value="studio">Studio Plate</option>
                    <option value="hall">Concert Hall</option>
                    <option value="arena">Arena Bloom</option>
                  </select>
                </div>
              </div>
              {effects.engine.includes('8d') && (
                <div className="grid gap-4 md:grid-cols-3">
                  {orbitSliderConfig.map(({ key, label: orbitLabel, defaultValue }) => (
                    <div key={key}>
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted">
                        <span>{orbitLabel}</span>
                        <span>{Math.round((effects[key] ?? defaultValue) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={effects[key] ?? defaultValue}
                        onChange={(e) =>
                          setEffects((prev) => ({
                            ...prev,
                            [key]: parseFloat(e.target.value)
                          }))
                        }
                        className="mt-1 w-full "
                      />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted">
                Powered by Chromox DSP with bridges for Nectar, Waves Clarity, and Synergy Core. All renders
                are bounced to 24-bit WAV automatically.
              </p>
            </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Render Section */}
      <div className="rounded-3xl border border-border-default bg-surface p-6">
        {/* Simple Mode: Single big render button */}
        {studioMode === 'simple' && !abMode && (
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleRender}
              disabled={!activePersonaId || busy}
              className="w-full max-w-md rounded-2xl bg-accent px-6 py-4 text-sm font-medium uppercase tracking-wide text-canvas transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Rendering...' : 'Generate Vocal'}
            </button>
            {busy && (
              <div className="w-full max-w-md">
                <Meter active={busy} />
              </div>
            )}
          </div>
        )}

        {/* Advanced Mode or A/B Mode: Full controls */}
        {(studioMode === 'advanced' || abMode) && (
        <>
        {/* A/B Mode Render Buttons */}
        {abMode ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <button
              onClick={handleRenderToSlot('A')}
              disabled={!activePersonaId || busy}
              className={`rounded-2xl px-4 py-3 text-[11px] font-medium uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${
                activeAbSlot === 'A' && abSlotA
                  ? 'bg-purple-500 text-white'
                  : 'border border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
              }`}
            >
              {busy && activeAbSlot === 'A' ? 'Rendering A...' : abSlotA ? 'Re-render A' : 'Render to A'}
            </button>
            <button
              onClick={handleRenderToSlot('B')}
              disabled={!activePersonaId || busy}
              className={`rounded-2xl px-4 py-3 text-[11px] font-medium uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${
                activeAbSlot === 'B' && abSlotB
                  ? 'bg-purple-500 text-white'
                  : 'border border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
              }`}
            >
              {busy && activeAbSlot === 'B' ? 'Rendering B...' : abSlotB ? 'Re-render B' : 'Render to B'}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <button
              onClick={handlePreview}
              disabled={!activePersonaId || previewBusy}
              className="rounded-2xl border border-border-default bg-elevated px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-secondary transition hover:bg-overlay hover:border-border-emphasis disabled:cursor-not-allowed disabled:opacity-40"
            >
              {previewBusy ? 'Previewing...' : 'Preview 12s'}
            </button>
            <button
              onClick={handleRender}
              disabled={!activePersonaId || busy}
              className="rounded-2xl bg-accent px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-canvas transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Rendering...' : 'Render Vocal'}
            </button>
            <div className="rounded-2xl border border-border-default bg-elevated px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-muted">Status</p>
              <p className="text-sm text-secondary">
                {busy
                  ? 'Printing chromatic mix...'
                  : previewBusy
                    ? 'Sketching preview layers...'
                    : 'Idle · ready for playback'}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-border-default bg-canvas p-4">
          <Meter active={busy || previewBusy} />
          <div className="mt-2 grid grid-cols-4 text-[9px] uppercase tracking-wide text-muted">
            <span>Tempo {guideTempo.toFixed(2)}x</span>
            <span>Blend {Math.round(guideMatchIntensity * 100)}%</span>
            <span className="text-right">{effects.bypassEffects ? 'Bypass' : effects.preset}</span>
            <span className="text-right">{effects.engine}</span>
          </div>
        </div>
        </>
        )}

        {/* A/B Comparison Output */}
        {abMode && (abSlotA || abSlotB) && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Slot A */}
              <div className={`rounded-2xl border-2 p-4 transition ${
                activeAbSlot === 'A' ? 'border-purple-500 bg-purple-500/5' : 'border-border-default bg-canvas'
              }`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-purple-400">Version A</span>
                  {abSlotA && <span className="text-[10px] text-muted">{abSlotA.stylePrompt}</span>}
                </div>
                {abSlotA ? (
                  <AudioPlayer src={abSlotA.url} label="Version A" />
                ) : (
                  <p className="py-4 text-center text-sm text-muted">Not rendered yet</p>
                )}
              </div>

              {/* Slot B */}
              <div className={`rounded-2xl border-2 p-4 transition ${
                activeAbSlot === 'B' ? 'border-purple-500 bg-purple-500/5' : 'border-border-default bg-canvas'
              }`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-purple-400">Version B</span>
                  {abSlotB && <span className="text-[10px] text-muted">{abSlotB.stylePrompt}</span>}
                </div>
                {abSlotB ? (
                  <AudioPlayer src={abSlotB.url} label="Version B" />
                ) : (
                  <p className="py-4 text-center text-sm text-muted">Not rendered yet</p>
                )}
              </div>
            </div>

            {/* Pick Winner */}
            {abSlotA && abSlotB && (
              <div className="flex items-center justify-center gap-4">
                <span className="text-xs text-muted uppercase tracking-wide">Pick winner:</span>
                <button
                  onClick={() => handlePickWinner('A')}
                  className="rounded-lg bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-400 transition hover:bg-purple-500/30"
                >
                  A Wins
                </button>
                <button
                  onClick={() => handlePickWinner('B')}
                  className="rounded-lg bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-400 transition hover:bg-purple-500/30"
                >
                  B Wins
                </button>
              </div>
            )}
          </div>
        )}

        {/* Render Output (non-A/B mode) — always visible */}
        {!abMode && (
          <div className="mt-4 space-y-3">
            {/* Error display */}
            {renderError && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
                <p className="text-sm font-medium text-red-400">Render failed</p>
                <p className="mt-1 text-xs text-red-400/80">{renderError}</p>
                <p className="mt-2 text-[10px] text-muted">
                  Check that at least one voice provider has a valid API key configured, or upload a guide vocal for local ffmpeg fallback.
                </p>
              </div>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              {previewUrl && studioMode === 'advanced' && (
                <div className="rounded-2xl border border-border-default bg-canvas p-3">
                  <AudioPlayer src={previewUrl} label="Preview" />
                </div>
              )}
              {outputUrl ? (
                <div className={`rounded-2xl border border-border-default bg-canvas p-3 ${studioMode === 'simple' || !previewUrl ? 'lg:col-span-2' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <AudioPlayer src={outputUrl} label="Render" />
                    </div>
                    <a
                      href={outputUrl}
                      download
                      className="shrink-0 rounded-lg border border-border-default px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-secondary transition hover:border-border-emphasis hover:text-primary"
                    >
                      Download
                    </a>
                  </div>
                  {latestRender && (
                    <div className="mt-3 flex flex-col gap-2 text-[11px] uppercase tracking-wide text-muted">
                      <span>Rate this print</span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleRateLatest('like')}
                          disabled={ratingBusy}
                          className={`flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium ${
                            latestRender.rating === 'like'
                              ? 'bg-accent/15 text-accent border border-accent/40'
                              : 'border border-border-default text-secondary hover:border-border-emphasis'
                          } disabled:opacity-40`}
                        >
                          <ThumbUpIcon size={12} /> Like
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRateLatest('dislike')}
                          disabled={ratingBusy}
                          className={`flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium ${
                            latestRender.rating === 'dislike'
                              ? 'bg-error/15 text-error border border-error/40'
                              : 'border border-border-default text-secondary hover:border-border-emphasis'
                          } disabled:opacity-40`}
                        >
                          <ThumbDownIcon size={12} /> Pass
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : !renderError && !busy && (
                <div className={`rounded-2xl border border-dashed border-border-default bg-canvas/50 p-6 ${studioMode === 'simple' || !previewUrl ? 'lg:col-span-2' : ''}`}>
                  <p className="text-center text-sm text-muted">
                    Waiting for render output...
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
