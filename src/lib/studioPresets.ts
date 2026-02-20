import { StyleControls, EffectSettings } from '../types';

export interface StudioPreset {
  id: string;
  name: string;
  description: string;
  controls: Partial<StyleControls>;
  effects: Partial<EffectSettings>;
  stylePromptSuggestion?: string;
}

// Arranged from neutral → warm → airy → analog → intense → big → experimental
export const studioPresets: StudioPreset[] = [
  {
    id: 'clean',
    name: 'Clean',
    description: 'Neutral, balanced starting point',
    controls: {
      brightness: 0.5,
      breathiness: 0.4,
      energy: 0.5,
      formant: 0,
      vibratoDepth: 0.4,
      vibratoRate: 0.4,
      roboticism: 0,
      glitch: 0,
      stereoWidth: 0.5
    },
    effects: {
      preset: 'clean',
      clarity: 0.7,
      air: 0.4,
      drive: 0.1,
      width: 0.5,
      space: 'studio',
      dynamics: 0.6
    },
    stylePromptSuggestion: 'clear, natural voice'
  },
  {
    id: 'intimate',
    name: 'Intimate',
    description: 'Close, warm, personal',
    controls: {
      brightness: 0.45,
      breathiness: 0.55,
      energy: 0.4,
      formant: 0,
      vibratoDepth: 0.35,
      vibratoRate: 0.4,
      roboticism: 0,
      glitch: 0,
      stereoWidth: 0.4
    },
    effects: {
      preset: 'clean',
      clarity: 0.75,
      air: 0.5,
      drive: 0.08,
      width: 0.35,
      space: 'studio',
      dynamics: 0.55
    },
    stylePromptSuggestion: 'intimate whisper, close warmth'
  },
  {
    id: 'ethereal',
    name: 'Ethereal',
    description: 'Dreamy, floating, atmospheric',
    controls: {
      brightness: 0.7,
      breathiness: 0.65,
      energy: 0.35,
      formant: 0.1,
      vibratoDepth: 0.5,
      vibratoRate: 0.3,
      roboticism: 0.05,
      glitch: 0.02,
      stereoWidth: 0.85
    },
    effects: {
      preset: 'lush',
      clarity: 0.6,
      air: 0.75,
      drive: 0.05,
      width: 0.8,
      space: 'hall',
      dynamics: 0.4
    },
    stylePromptSuggestion: 'ethereal whisper, floating dream'
  },
  {
    id: 'vintage',
    name: 'Vintage',
    description: 'Warm, analog, nostalgic',
    controls: {
      brightness: 0.4,
      breathiness: 0.35,
      energy: 0.5,
      formant: 0.05,
      vibratoDepth: 0.45,
      vibratoRate: 0.45,
      roboticism: 0,
      glitch: 0,
      stereoWidth: 0.5
    },
    effects: {
      preset: 'vintage',
      clarity: 0.55,
      air: 0.4,
      drive: 0.2,
      width: 0.45,
      space: 'studio',
      dynamics: 0.5
    },
    stylePromptSuggestion: 'vintage warmth, analog soul'
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Punchy, intense, driving',
    controls: {
      brightness: 0.65,
      breathiness: 0.2,
      energy: 0.9,
      formant: -0.1,
      vibratoDepth: 0.2,
      vibratoRate: 0.6,
      roboticism: 0.15,
      glitch: 0.1,
      stereoWidth: 0.6
    },
    effects: {
      preset: 'raw',
      clarity: 0.85,
      air: 0.25,
      drive: 0.45,
      width: 0.65,
      space: 'dry',
      dynamics: 0.85
    },
    stylePromptSuggestion: 'aggressive bite, raw power'
  },
  {
    id: 'anthemic',
    name: 'Anthemic',
    description: 'Big, powerful, expansive',
    controls: {
      brightness: 0.6,
      breathiness: 0.3,
      energy: 0.85,
      formant: 0,
      vibratoDepth: 0.55,
      vibratoRate: 0.5,
      roboticism: 0.1,
      glitch: 0.05,
      stereoWidth: 0.95
    },
    effects: {
      preset: 'choir-cloud',
      clarity: 0.8,
      air: 0.6,
      drive: 0.25,
      width: 1,
      space: 'hall',
      dynamics: 0.75
    },
    stylePromptSuggestion: 'anthemic rise, stadium power'
  },
  {
    id: 'coffee',
    name: 'Coffee',
    description: 'Podcast studio, warm clarity',
    controls: {
      brightness: 0.5,
      breathiness: 0.3,
      energy: 0.45,
      formant: 0,
      vibratoDepth: 0.15,
      vibratoRate: 0.3,
      roboticism: 0,
      glitch: 0,
      stereoWidth: 0.3
    },
    effects: {
      preset: 'clean',
      clarity: 0.85,
      air: 0.35,
      drive: 0.05,
      width: 0.25,
      space: 'dry',
      dynamics: 0.7,
      noiseReduction: 0.6
    },
    stylePromptSuggestion: 'warm podcast voice, clear and present'
  },
  {
    id: 'glitch',
    name: 'Glitch',
    description: 'Robotic, textured, experimental',
    controls: {
      brightness: 0.6,
      breathiness: 0.25,
      energy: 0.7,
      formant: -0.15,
      vibratoDepth: 0.15,
      vibratoRate: 0.7,
      roboticism: 0.45,
      glitch: 0.5,
      stereoWidth: 0.9
    },
    effects: {
      preset: 'raw',
      engine: 'rave-ddsp-8d',
      clarity: 0.7,
      air: 0.35,
      drive: 0.3,
      width: 0.95,
      space: 'arena',
      dynamics: 0.7,
      orbitSpeed: 0.7,
      orbitDepth: 0.8
    },
    stylePromptSuggestion: 'glitch texture, digital artifact'
  },
];

// Keywords that map to control adjustments
interface KeywordMapping {
  keywords: string[];
  adjustments: {
    controls?: Partial<StyleControls>;
    effects?: Partial<EffectSettings>;
  };
}

const keywordMappings: KeywordMapping[] = [
  {
    keywords: ['breathy', 'airy', 'whisper', 'soft'],
    adjustments: {
      controls: { breathiness: 0.7, energy: 0.35, brightness: 0.55 },
      effects: { air: 0.7, drive: 0.05 }
    }
  },
  {
    keywords: ['aggressive', 'hard', 'intense', 'powerful', 'punch'],
    adjustments: {
      controls: { energy: 0.85, breathiness: 0.2, brightness: 0.65 },
      effects: { drive: 0.4, dynamics: 0.8, clarity: 0.85 }
    }
  },
  {
    keywords: ['robotic', 'robot', 'synth', 'electronic', 'digital'],
    adjustments: {
      controls: { roboticism: 0.4, glitch: 0.2, vibratoDepth: 0.15 }
    }
  },
  {
    keywords: ['glitch', 'broken', 'corrupted', 'distorted'],
    adjustments: {
      controls: { glitch: 0.5, roboticism: 0.25 },
      effects: { drive: 0.3 }
    }
  },
  {
    keywords: ['warm', 'cozy', 'intimate', 'close'],
    adjustments: {
      controls: { brightness: 0.4, breathiness: 0.5, stereoWidth: 0.4 },
      effects: { air: 0.45, width: 0.4, space: 'studio' }
    }
  },
  {
    keywords: ['bright', 'crisp', 'clear', 'sharp'],
    adjustments: {
      controls: { brightness: 0.75 },
      effects: { clarity: 0.85, air: 0.6 }
    }
  },
  {
    keywords: ['dark', 'deep', 'low', 'gritty'],
    adjustments: {
      controls: { brightness: 0.3, formant: -0.15 },
      effects: { drive: 0.25, air: 0.25 }
    }
  },
  {
    keywords: ['wide', 'spacious', 'big', 'huge', 'stadium'],
    adjustments: {
      controls: { stereoWidth: 0.9 },
      effects: { width: 0.9, space: 'hall' }
    }
  },
  {
    keywords: ['tight', 'focused', 'mono', 'centered'],
    adjustments: {
      controls: { stereoWidth: 0.3 },
      effects: { width: 0.3, space: 'dry' }
    }
  },
  {
    keywords: ['dreamy', 'ethereal', 'floating', 'heavenly'],
    adjustments: {
      controls: { breathiness: 0.6, energy: 0.4, vibratoDepth: 0.5 },
      effects: { air: 0.7, space: 'hall', width: 0.8 }
    }
  },
  {
    keywords: ['vintage', 'retro', 'classic', 'analog', 'old'],
    adjustments: {
      controls: { brightness: 0.4, roboticism: 0, glitch: 0 },
      effects: { preset: 'vintage', clarity: 0.55, drive: 0.18 }
    }
  },
  {
    keywords: ['vibrato', 'shaky', 'tremolo'],
    adjustments: {
      controls: { vibratoDepth: 0.7, vibratoRate: 0.6 }
    }
  },
  {
    keywords: ['steady', 'stable', 'flat', 'no vibrato'],
    adjustments: {
      controls: { vibratoDepth: 0.1, vibratoRate: 0.3 }
    }
  },
  {
    keywords: ['high', 'pitched', 'chipmunk'],
    adjustments: {
      controls: { formant: 0.3, brightness: 0.7 }
    }
  },
  {
    keywords: ['8d', 'surround', 'orbit', 'spatial', '3d'],
    adjustments: {
      effects: { engine: 'rave-ddsp-8d', orbitDepth: 0.8, orbitSpeed: 0.6 }
    }
  }
];

/**
 * Parse a style prompt and return suggested control adjustments
 */
export function parseStylePrompt(prompt: string): {
  controls: Partial<StyleControls>;
  effects: Partial<EffectSettings>;
} {
  const lowerPrompt = prompt.toLowerCase();
  const result: {
    controls: Partial<StyleControls>;
    effects: Partial<EffectSettings>;
  } = {
    controls: {},
    effects: {}
  };

  for (const mapping of keywordMappings) {
    const matched = mapping.keywords.some(keyword => lowerPrompt.includes(keyword));
    if (matched) {
      if (mapping.adjustments.controls) {
        result.controls = { ...result.controls, ...mapping.adjustments.controls };
      }
      if (mapping.adjustments.effects) {
        result.effects = { ...result.effects, ...mapping.adjustments.effects };
      }
    }
  }

  return result;
}

/**
 * Apply a preset to current controls/effects
 */
export function applyPreset(
  preset: StudioPreset,
  currentControls: StyleControls,
  currentEffects: EffectSettings
): { controls: StyleControls; effects: EffectSettings } {
  return {
    controls: { ...currentControls, ...preset.controls },
    effects: { ...currentEffects, ...preset.effects }
  };
}

/**
 * Find the closest matching preset based on current settings
 */
export function findClosestPreset(
  controls: StyleControls,
  effects: EffectSettings
): StudioPreset | null {
  let bestMatch: StudioPreset | null = null;
  let bestScore = Infinity;

  for (const preset of studioPresets) {
    let score = 0;

    // Compare controls
    for (const [key, value] of Object.entries(preset.controls)) {
      const current = controls[key as keyof StyleControls];
      if (typeof current === 'number' && typeof value === 'number') {
        score += Math.abs(current - value);
      }
    }

    // Compare effects
    for (const [key, value] of Object.entries(preset.effects)) {
      const current = effects[key as keyof EffectSettings];
      if (typeof current === 'number' && typeof value === 'number') {
        score += Math.abs(current - value);
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestMatch = preset;
    }
  }

  return bestMatch;
}
