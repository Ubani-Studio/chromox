export type BeatGrid = {
  bpm: number;
  confidence: number;
  beats: number[];      // Beat times in seconds
  downbeats: number[];  // Measure start times
  duration: number;
};

export type StyleControls = {
  brightness: number;
  breathiness: number;
  energy: number;
  formant: number;
  vibratoDepth: number;
  vibratoRate: number;
  roboticism: number;
  glitch: number;
  stereoWidth: number;
};

export type EffectSettings = {
  engine: 'clean' | 'rave-ddsp' | 'rave-ddsp-8d';
  preset?: 'clean' | 'lush' | 'vintage' | 'raw' | 'harmonic-orbit' | 'choir-cloud';
  clarity: number;
  air: number;
  drive: number;
  width: number;
  noiseReduction: number;
  space: 'dry' | 'studio' | 'hall' | 'arena';
  dynamics: number;
  orbitSpeed?: number;
  orbitDepth?: number;
  orbitTilt?: number;
  bypassEffects?: boolean;
};

export type GuideSample = {
  id: string;
  name: string;
  originalName: string;
  path: string;
  url?: string;
  uploaded_at: string;
  source?: 'user' | 'ai-lab' | 'folio';
  folioCollectionId?: string;  // Reference to Folio collection item
  folioVideoUrl?: string;      // Original video URL from Folio
  tags?: string[];
  transcript?: string;
  embedding?: number[];
  tempo?: number;
  mood?: 'hype' | 'dream' | 'anthem' | 'ambient';
  aiModel?: string;
  recommendedUse?: string;
  mintedFromRenderId?: string;
  // Accent detection metadata for better persona matching
  accentMetadata?: {
    detected: string;
    confidence: number;
    language: string;
    dialect?: string;
    languageCode?: string;
  };
  transcriptionConfidence?: number;
  transcriptionProvider?: 'assemblyai' | 'deepgram' | 'revai' | 'whisper' | 'ensemble' | 'fallback';
  // Ensemble details (when multiple APIs used)
  ensembleDetails?: {
    primary: { provider: string; confidence: number };
    secondary?: { provider: string; confidence: number };
    agreement: number; // 0-1, how much APIs agreed
    method: 'single' | 'dual' | 'consensus';
  };
  // Phonetic pronunciation for fixing Chinese/Russian artifacts
  phoneticTranscript?: string;
  pronunciationHints?: Record<string, string>; // word → phonetic pronunciation
  prosodyHints?: {
    rhythm: 'syllable-timed' | 'stress-timed' | 'mora-timed';
    intonation: 'rising' | 'falling' | 'flat' | 'melodic';
    tempo: 'fast' | 'moderate' | 'slow';
  };
  // Beat grid for rhythm-aware synthesis
  beatGrid?: BeatGrid;
  // Effectiveness tracking (conviction score for samples)
  useCount?: number;           // Times used in a render
  likeCount?: number;          // Times render was liked
  dislikeCount?: number;       // Times render was disliked
  effectivenessScore?: number; // 0-100, calculated from likes/uses
  lastUsedAt?: string;         // ISO timestamp
};

export type TrainingSample = {
  id: string;
  path: string;
  originalName: string;
  duration: number;
  addedAt: string;
  embedding: number[];
  characteristics: VoiceCharacteristics;
  weight: number; // 0-1, calibration adjusts this
  isOutlier: boolean; // flagged during calibration
};

export type VoiceCharacteristics = {
  pitchRange: { min: number; max: number; mean: number };
  formants: number[];
  spectralCentroid: number;
  spectralRolloff: number;
  breathiness: number;
  brightness: number;
  timbre: number[];
  vibratoRate: number;
  vibratoDepth: number;
  energyMean: number;
};

export type VoiceProfile = {
  characteristics: VoiceCharacteristics;
  embedding: {
    embedding: number[];
    provider: 'openai' | 'rvc' | 'elevenlabs' | 'chromox';
    modelVersion: string;
  };
  samplePath: string;
  sampleDuration: number;
  analysisTimestamp: string;
  // Training history
  trainingSamples?: TrainingSample[];
  trainingVersion: number;
  lastCalibratedAt?: string;
  fidelityScore?: number; // 0-100, computed from sample consistency
};

export type LicensingTerms = {
  training_rights: boolean;
  derivative_rights: boolean;
  commercial_rights: boolean;
  attribution_required: boolean;
  revenue_split: number;
  rate_per_second_cents?: number;
};

export type CloneDetection = {
  voiceType?: 'speech' | 'singing' | 'mixed';
  accent?: string;
  accentLabel?: string;
  quality?: 'studio' | 'good' | 'acceptable' | 'poor';
  duration?: number;
  providerSettings?: Record<string, unknown>;
};

export type Persona = {
  id: string;
  name: string;
  description: string;
  voice_model_key: string;
  provider: string;
  default_style_controls: StyleControls;
  created_at: string;
  image_url?: string;
  image_focus_x?: number;
  image_focus_y?: number;
  // Voice cloning fields
  is_cloned?: boolean;
  voice_profile?: VoiceProfile;
  clone_source?: 'upload' | 'recording' | 'external';
  clone_mode?: 'quick' | 'studio' | 'diaspora';
  clone_detection?: CloneDetection;
  guide_samples?: GuideSample[];
  relics?: Relic[];
  // o8 Provenance fields
  o8_identity_id?: string;
  voice_fingerprint?: string;
  licensing_terms?: LicensingTerms;
};

export type GuideSuggestion = {
  id: string;
  title: string;
  description: string;
  reason: string;
  vibe: 'hype' | 'chill' | 'nostalgic' | 'glitch';
  energyScore: number;
  matchConfidence: number;
  sampleId?: string;
  previewUrl?: string;
  action: 'use' | 'mint';
  mintMode?: 'glitch' | 'dream' | 'anthem';
  transcriptSnippet?: string;
};

export type RenderPayload = {
  personaId: string;
  voiceModelKey: string;
  lyrics: string;
  stylePrompt: string;
  controls: StyleControls;
  effects: EffectSettings;
  label?: string;
  guideFilePath?: string;
  previewSeconds?: number;
  accent?: string;
  accentLocked?: boolean;
  guideSampleId?: string;
  guideMatchIntensity?: number;
  guideUseLyrics?: boolean;
  guideTempo?: number;
  targetBpm?: number;  // Absolute BPM for final render (auto-calculates ratio from detected BPM)
  guideStartTime?: number;
  guideEndTime?: number;
  guideAccentBlend?: number;
  rating?: RenderRating;
  // Enhanced accent handling from AssemblyAI/Rev.ai
  detectedAccent?: string;
  accentHint?: string;
  pronunciationGuide?: string;
  phoneticLyrics?: string; // Phonetically transcribed lyrics
  pronunciationHints?: Record<string, string>; // Word-level pronunciation hints
  prosodyHints?: {
    rhythm: 'syllable-timed' | 'stress-timed' | 'mora-timed';
    intonation: 'rising' | 'falling' | 'flat' | 'melodic';
    tempo: 'fast' | 'moderate' | 'slow';
  };
};

export type RenderJobRecord = {
  id: string;
  personaId: string;
  personaName: string;
  lyrics: string;
  stylePrompt: string;
  controls: StyleControls;
  effects: EffectSettings;
  label?: string;
  audioPath: string;
  audioUrl: string;
  created_at: string;
  guideFilePath?: string;
  personaImage?: string;
  accent?: string;
  accentLocked?: boolean;
  guideSampleId?: string;
  guideMatchIntensity?: number;
  guideUseLyrics?: boolean;
  guideTempo?: number;
  targetBpm?: number;
  rating?: RenderRating;
};

export type RenderRating = 'like' | 'dislike' | 'neutral';

export type FolioClip = {
  id: string;
  name: string;
  audioPath: string;
  audioUrl: string;
  source: 'render' | 'upload';
  sourceRenderId?: string;
  sourcePersonaName?: string;
  tags?: string[];
  duration?: number;
  added_at: string;
};

// ── Sonic Genome (Voice Identity) ──────────────────────────────────

export type SonicArchetypeDesignation =
  | 'S-0' | 'T-1' | 'V-2' | 'L-3' | 'C-4' | 'N-5'
  | 'H-6' | 'P-7' | 'D-8' | 'F-9' | 'R-10' | 'NULL';

export type SonicArchetype = {
  designation: SonicArchetypeDesignation;
  glyph: string;
  title: string;
  essence: string;
  creativeMode: string;
  shadow: string;
  color: string;
};

export type SonicSignalType =
  | 'render' | 'like' | 'dislike' | 'save_to_folio' | 'adjust_effects'
  | 'use_guide' | 'mint' | 'replay' | 'preview' | 'rate' | 'preference';

export type SonicSignal = {
  type: SonicSignalType;
  value?: string;
  weight: number;
  metadata: Record<string, unknown>;
  timestamp: string;
  archetypeWeights: Record<string, number>;
};

export type SonicKeywordScore = {
  score: number;
  count: number;
};

export type SonicGenomeGamification = {
  xp: number;
  tier: number;
  achievements: string[];
  streak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  totalRenders: number;
  totalLikes: number;
  totalMints: number;
  uniqueEffects: string[];
  uniqueGuides: string[];
};

export type SonicGenome = {
  userId: string;
  version: number;
  archetype: {
    primary: SonicArchetypeDesignation | null;
    secondary: SonicArchetypeDesignation | null;
    distribution: Record<string, number>;
    confidence: number;
    classifiedAt: string | null;
  };
  keywordScores: Record<string, SonicKeywordScore>;
  sonicPatterns: {
    dominantTextures: string[];
    avoidTextures: string[];
    preferredMoods: string[];
    productionStyle: string[];
    vocalPreference: string[];
    spatialPreference: string[];
  };
  signals: SonicSignal[];
  gamification: SonicGenomeGamification;
  confidence: number;
  itemCount: number;
  lastUpdated: string | null;
  createdAt: string;
};

// ── Boveda (Relics & Reliquary) ────────────────────────────────────

export type Relic = {
  id: string;
  name: string;
  description: string;
  lore: string;
  tier: number;
  icon: string;
  audioUrl?: string;
  effectChain?: string;
  sourceRenderId?: string;
  sourcePersonaId: string;
  created_at: string;
};

export type RelicPack = {
  id: string;
  name: string;
  description: string;
  hashedPassword: string;
  relics: Array<Omit<Relic, 'sourcePersonaId' | 'created_at'>>;
};

export type TasteProfile = {
  personaId: string;
  totalRenders: number;
  likes: number;
  dislikes: number;
  favoriteGuide?: {
    id: string;
    name: string;
    mood?: string;
  };
  recentLabels: string[];
  energeticPreference: number;
  glitchAffinity: number;
  recommendedMintMode: 'glitch' | 'dream' | 'anthem';
};
