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
  tags?: string[];
  transcript?: string;
  embedding?: number[];
  tempo?: number;
  mood?: 'hype' | 'dream' | 'anthem' | 'ambient';
  aiModel?: string;
  recommendedUse?: string;
  mintedFromRenderId?: string;
  folioCollectionId?: string;
  folioVideoUrl?: string;
  accentMetadata?: {
    detected: string;
    confidence: number;
    language: string;
    dialect?: string;
  };
  // Effectiveness tracking
  useCount?: number;
  likeCount?: number;
  dislikeCount?: number;
  effectivenessScore?: number;
  lastUsedAt?: string;
};

export type VoiceProfile = {
  characteristics: {
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
  embedding: {
    embedding: number[];
    provider: 'openai' | 'rvc' | 'elevenlabs' | 'chromox';
    modelVersion: string;
  };
  samplePath: string;
  sampleDuration: number;
  analysisTimestamp: string;
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

export type RenderJob = {
  personaId: string;
  lyrics: string;
  guideFile?: File;
  stylePrompt: string;
  controls: StyleControls;
  effects: EffectSettings;
  label?: string;
  accent?: string;
  accentLocked?: boolean;
  guideSampleId?: string;
  guideMatchIntensity?: number;
  guideUseLyrics?: boolean;
  guideTempo?: number;
  guideStartTime?: number;
  guideEndTime?: number;
  guideAccentBlend?: number;
};

export type RenderHistoryItem = {
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
  rating?: 'like' | 'dislike' | 'neutral';
};

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

// ── Sonic Genome ───────────────────────────────────────────────────

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

export type SonicGenomeSummary = {
  archetype: {
    primary: SonicArchetype;
    secondary: SonicArchetype | null;
    distribution: Record<string, number>;
    confidence: number;
  };
  gamification: {
    xp: number;
    tier: number;
    tierName: string;
    nextTierName: string | null;
    nextTierXP: number | null;
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
  sonicPatterns: {
    dominantTextures: string[];
    avoidTextures: string[];
    preferredMoods: string[];
    productionStyle: string[];
    vocalPreference: string[];
    spatialPreference: string[];
  };
  topKeywords: Array<{ keyword: string; score: number; count: number }>;
  signalCount: number;
  confidence: number;
  itemCount: number;
  lastUpdated: string | null;
  createdAt: string;
};

// ── Boveda ─────────────────────────────────────────────────────────

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

export type RelicPackSummary = {
  id: string;
  name: string;
  description: string;
  relicCount: number;
  unlocked: boolean;
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

// ── Photo Gallery ─────────────────────────────────────────────────────

export type PhotoElements = {
  clothingType?: string[];
  pose?: string;
  mood?: string;
  setting?: string;
  lighting?: string;
  tags?: string[];
};

export type PhotoMetadata = {
  id: string;
  filename: string;
  originalPath: string;
  relativePath: string;
  thumb150Path?: string;
  thumb400Path?: string;
  thumb150Url?: string;
  thumb400Url?: string;
  width?: number;
  height?: number;
  fileSize: number;
  mimeType: string;
  dominantColors: string[];
  colorCategory?: string;
  perceptualHash?: string;
  elements?: PhotoElements;
  createdAt: string;
  addedAt: string;
  lastModified: string;
};

export type PhotoGallerySettings = {
  selectedFolder?: string;
  lastSyncTime?: string;
  thumbnailsGenerated: number;
  totalPhotos: number;
};

export type PhotoScanResult = {
  added: number;
  updated: number;
  removed: number;
  errors: string[];
  totalProcessed: number;
};

export type SimilarityMatch = {
  photo: PhotoMetadata;
  similarity: number;
};
