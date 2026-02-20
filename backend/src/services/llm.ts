const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function rewriteLyricsWithLLM(lyrics: string, stylePrompt: string) {
  // Fallback if no API key
  if (!OPENAI_API_KEY) {
    return `${lyrics}\n// Reimagined via Nebula Tone: ${stylePrompt}`;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a creative lyricist that rewrites song lyrics in different styles. When given lyrics and a style direction, you rewrite them to match that vibe while keeping the SAME LENGTH and structure. Be creative, evocative, and stylistically bold. Keep the rewrite CONCISE - do not make it longer than the original. Output ONLY the rewritten lyrics, no explanations or commentary.`
          },
          {
            role: 'user',
            content: `Rewrite these lyrics in the style of: ${stylePrompt}\n\nOriginal lyrics:\n${lyrics}\n\nRewritten lyrics (keep it the same length):`
          }
        ],
        temperature: 0.9,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return `${lyrics}\n// Reimagined via Nebula Tone: ${stylePrompt}`;
    }

    const data = await response.json() as any;
    let rewrittenLyrics = data?.choices?.[0]?.message?.content?.trim();

    if (!rewrittenLyrics) {
      return `${lyrics}\n// Reimagined via Nebula Tone: ${stylePrompt}`;
    }

    // Safety: Ensure lyrics don't exceed ElevenLabs 10k character limit (with buffer)
    const MAX_CHARS = 8000;
    if (rewrittenLyrics.length > MAX_CHARS) {
      console.warn(`[LLM] Rewritten lyrics too long (${rewrittenLyrics.length} chars), truncating to ${MAX_CHARS}`);
      rewrittenLyrics = rewrittenLyrics.substring(0, MAX_CHARS) + '\n...';
    }

    return rewrittenLyrics;
  } catch (error) {
    console.error('Failed to rewrite lyrics with LLM:', error);
    return `${lyrics}\n// Reimagined via Nebula Tone: ${stylePrompt}`;
  }
}

export async function promptToControls(stylePrompt: string) {
  const hash = Array.from(stylePrompt).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const normalize = (offset: number) => ((hash + offset) % 100) / 100;
  return {
    brightness: normalize(5),
    breathiness: normalize(11),
    energy: normalize(19),
    stereoWidth: normalize(47),
    // Safe defaults — these controls cause destructive artifacts (shaky pitch,
    // unwanted formant shifts, glitch noise) when set to random values
    formant: 0,
    vibratoDepth: 0,
    vibratoRate: 0.5,
    roboticism: 0,
    glitch: 0
  };
}

const personaAdjectives = [
  'Pixel',
  'Velvet',
  'Glitch',
  'Nebula',
  'Aether',
  'Prismatic',
  'Obsidian',
  'Aurora',
  'Synthetic',
  'Crystal',
  'Cyber',
  'Sakura',
  'Bubblegum',
  'Astral',
  'Lofi',
  'Hyperpop',
  '808',
  'Lo-fi',
  'Reverb-soaked',
  'Chromatic',
  'Hologram'
];

const personaNouns = [
  'Muse',
  'Oracle',
  'Siren',
  'Specter',
  'Pulse',
  'Echo',
  'Flux',
  'Phantom',
  'Nova',
  'Chimera',
  'Kitten',
  'Avatar',
  'Sprite',
  'Nyx',
  'Vibe',
  'Stream',
  'Chanteuse',
  'MC',
  'Fader',
  'Frequenzy',
  'Loop'
];

const vibeDescriptions = [
  'E-girl lullaby machine who speaks in lowercase heart emojis, bounces in 6/8, and layers celestial harmonies like she is live looping on stream',
  'Chronically online siren with uwu husk, glitch-pop adlibs, and mix-notes on how much plate reverb to send to the aux bus',
  'Twitch-night owl weaving “no thoughts head empty” whispers into sparkly sub-bass hugs, sidechained to her own heartbeat BPM',
  'Discord kitten crooner dropping parasocial winks over mascara-stained hyperpop pads while calling out key changes mid-verse',
  'Zoomer dreamweaver mixing “pls hydrate” ASMR tones with cracked Valorant bravado and vocal fry bridges pitched up an octave',
  'E-boy crooner with softboy falsetto, auto-tuned meows, perma-doomscroll ennui, and an 808 that follows his mood swings',
  'Kawaii cyber bard who speedruns heartbreak arcs with stan-Twitter diction, stacking fifths and ninths like she is speedrunning music theory',
  'Neon mod goddess who chants “ratio me daddy” between reverb-drenched harmonics and filter sweeps that mimic modulated vocals',
  'Lo-fi vtuber specter armed with pastel synth stabs, crunchy tape hiss, and synthwave slay energy for late-night setlists',
  'Antihero streamer poet layering keysmash giggles over 200 bpm jellycore drums and shouting out the DAW automation lanes mid-hook'
];

const mononymFixed = [
  'Nyxxie',
  'Luxwave',
  'Voxara',
  'Liminala',
  'Astridaze',
  'Kyarix',
  'Veloria',
  'Riotline',
  'Nebuline',
  'Seraphae',
  'Junoverse',
  'Soniclair',
  'Echoette',
  'Synthara',
  'Lushwave',
  'Ravena'
];

const mononymPrefixes = [
  'Lumi',
  'Vanta',
  'Neon',
  'Pixel',
  'Astra',
  'Velvi',
  'Chroma',
  'Kitsu',
  'Vivi',
  'Echo',
  'Rave',
  'Nyte',
  'Plasma',
  'Halo',
  'Nova',
  'Sable'
];

const mononymSuffixes = [
  'lina',
  'ique',
  'elle',
  'wave',
  'line',
  'essa',
  'phira',
  'night',
  'mori',
  'elle',
  'ora',
  'vy',
  'lithe',
  'flux',
  'aria',
  'rae'
];

function buildMononymName() {
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  if (Math.random() < 0.6) {
    return pick(mononymFixed);
  }
  return `${pick(mononymPrefixes)}${pick(mononymSuffixes)}`;
}

export async function generatePersonaIdea(options: { seed?: string; mononym?: boolean } = {}) {
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const name = options.mononym ? buildMononymName() : `${pick(personaAdjectives)} ${pick(personaNouns)}`;
  const description = pick(vibeDescriptions);
  return { name, description };
}
