import { useState, useEffect, useCallback } from 'react';
import { Persona } from '../../types';
import {
  generateCharacter,
  applyVariance,
  createRng,
  HERITAGE_OPTIONS,
  NAME_MODES,
  CORE_STYLES,
  GENDER_OPTIONS,
  GeneratedCharacter,
} from '../../lib/characterGenerator';

const COLOR_PALETTE = [
  '#d4d4d8', '#ec4899', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#f43f5e',
];

type PillSelectorProps = {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
};

function PillSelector({ label, options, value, onChange }: PillSelectorProps) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-medium tracking-tight text-muted">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1 text-[10px] font-medium transition ${
              value === opt.value
                ? 'border border-accent/40 bg-accent/15 text-accent'
                : 'border border-border-default bg-surface text-muted hover:border-border-emphasis hover:text-secondary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: string }) {
  const variants: Record<string, string> = {
    default: 'bg-elevated text-muted',
    purple: 'border border-accent/30 bg-accent/10 text-accent',
    blue: 'border border-border-default bg-surface text-secondary',
    amber: 'border border-warning/30 bg-warning/10 text-warning',
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${variants[variant] || variants.default}`}>
      {children}
    </span>
  );
}

function AxisBar({ value, leftLabel, rightLabel }: { label?: string; value: number; leftLabel: string; rightLabel: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-16 shrink-0 text-right text-muted">{leftLabel}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
        <div className="h-full rounded-full bg-accent/50 transition-all" style={{ width: `${value * 100}%` }} />
      </div>
      <span className="w-16 shrink-0 text-muted">{rightLabel}</span>
    </div>
  );
}

function mapVoiceTone(voiceTone: string): string {
  const tone = voiceTone.toLowerCase();
  if (tone.includes('warm') || tone.includes('ember')) return 'conversational';
  if (tone.includes('command') || tone.includes('thunder')) return 'authoritative';
  if (tone.includes('musical') || tone.includes('harmonic')) return 'poetic';
  if (tone.includes('sharp') || tone.includes('gravel')) return 'raw';
  if (tone.includes('quiet') || tone.includes('crystal')) return 'vulnerable';
  if (tone.includes('rhythm') || tone.includes('echo')) return 'mentor';
  return 'conversational';
}

function buildSystemPrompt(generated: GeneratedCharacter): string {
  const { name, heritage, order, arcana, personality, appearance } = generated;
  const traits: string[] = [];
  const { axes } = personality;
  traits.push(axes.orderChaos > 0.5 ? 'structured and deliberate' : 'spontaneous and adaptive');
  traits.push(axes.mercyRuthlessness > 0.5 ? 'compassionate' : 'unyielding');
  traits.push(axes.introvertExtrovert > 0.5 ? 'engaging and expressive' : 'measured and thoughtful');
  traits.push(axes.faithDoubt > 0.5 ? 'confident and assured' : 'questioning and curious');
  return `You are ${name}, a ${heritage} ${order.name} serving as a vessel of ${arcana.system} wisdom. ` +
    `Your archetype is ${arcana.archetype} (${arcana.meaning}). ` +
    `You are ${traits.join(', ')}. ` +
    `Your core desire: ${arcana.coreDesire}. Your deepest fear: ${personality.deepFear}. ` +
    `Your voice is ${personality.voiceTone}. ` +
    `Appearance: ${appearance.build}, with ${appearance.distinctiveTrait}. Style: ${appearance.styleAesthetic}. ` +
    `Speak with the weight of ages, yet remain approachable. Never break character.`;
}

type PersonaPayload = {
  name: string;
  bio: string;
  voice: string;
  color: string;
  personaTags: string[];
  toneAllowed: string[];
  toneForbidden: string[];
  systemPrompt: string;
  lcosData: GeneratedCharacter;
};

type RelicPayload = {
  name: string;
  description: string;
  lore: string;
  tier: number;
  icon: string;
};

type Props = {
  onAcceptPersona: (mapped: PersonaPayload) => Promise<void>;
  onAcceptRelic?: (personaId: string, relic: RelicPayload) => Promise<void>;
  personas?: Persona[];
};

export function GeneratorPanel({ onAcceptPersona, onAcceptRelic, personas = [] }: Props) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 10_000_000));
  const [mode, setMode] = useState<'character' | 'relic'>('character');
  const [heritage, setHeritage] = useState('');
  const [gender, setGender] = useState('');
  const [nameMode, setNameMode] = useState('standard');
  const [relicEra, setRelicEra] = useState('modern');
  const [coreStyle, setCoreStyle] = useState('');
  const [variance, setVariance] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [generated, setGenerated] = useState<GeneratedCharacter | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [relicPersonaId, setRelicPersonaId] = useState('');

  const isRelic = mode === 'relic';

  const runGenerator = useCallback(() => {
    const isBlend = heritage === 'blend';
    const isMononym = nameMode !== 'standard';
    let mononymType: string | null = null;
    if (nameMode === 'mononym-squishe') mononymType = 'squishe';
    else if (nameMode === 'mononym-simple') mononymType = 'simple';
    else if (nameMode === 'aminal-blend') mononymType = 'aminal-blend';
    else if (nameMode === 'aminal-clear') mononymType = 'aminal-clear';

    const params = {
      seed,
      ...(heritage && !isBlend ? { heritage } : {}),
      ...(gender ? { gender } : {}),
      blendHeritage: isBlend,
      mononym: isMononym,
      ...(isMononym && mononymType ? { mononymType } : {}),
      relic: isRelic,
      ...(isRelic ? { relicEra } : {}),
      ...(coreStyle ? { core: coreStyle } : {}),
    };

    setGenerated(generateCharacter(params));
  }, [seed, heritage, gender, nameMode, isRelic, relicEra, coreStyle]);

  useEffect(() => { runGenerator(); }, [runGenerator]);

  const handleReroll = () => setSeed(Math.floor(Math.random() * 10_000_000));

  const handleAccept = async () => {
    if (!generated || accepting) return;
    setAccepting(true);
    try {
      if (isRelic && onAcceptRelic && relicPersonaId) {
        await onAcceptRelic(relicPersonaId, {
          name: displayName,
          description: generated.backstory,
          lore: [
            generated.pseudonym ? `aka ${generated.pseudonym}` : '',
            generated.sacredNumber !== undefined ? `No. ${generated.sacredNumber}` : '',
            generated.samplePost ? `"${generated.samplePost}"` : '',
          ].filter(Boolean).join(' · '),
          tier: Math.floor(Math.random() * 3) + 1,
          icon: generated.subtaste?.glyph || '*',
        });
      } else {
        await onAcceptPersona({
          name: displayName,
          bio: generated.backstory,
          voice: mapVoiceTone(generated.personality.voiceTone),
          color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)],
          personaTags: generated.subtaste
            ? [generated.subtaste.label, generated.subtaste.code]
            : [generated.arcana.archetype].filter(Boolean),
          toneAllowed: generated.arcana.goldenGifts || [],
          toneForbidden: generated.arcana.shadowThemes || [],
          systemPrompt: buildSystemPrompt(generated),
          lcosData: generated,
        });
      }
    } finally {
      setAccepting(false);
    }
  };

  if (!generated) return null;

  const displayName = variance > 0
    ? applyVariance(createRng(generated.seed + variance), generated.name, variance)
    : generated.name;

  return (
    <div className="rounded-xl border border-border-default bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
        <h2 className="font-display text-sm font-semibold tracking-tight text-primary">
          Character & Relic Generator
        </h2>
      </div>

      <div className="space-y-5 p-5">
        {/* Mode Tabs */}
        <div className="flex border-b border-border-default">
          {([
            { value: 'character' as const, label: 'Character' },
            { value: 'relic' as const, label: 'Relic' },
          ]).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setMode(tab.value)}
              className={`-mb-px border-b-2 px-5 py-2.5 text-xs font-medium transition ${
                mode === tab.value
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Settings */}
        <div className="space-y-3 rounded-lg border border-border-default bg-canvas p-4">
          <h3 className="mb-3 text-[10px] font-medium tracking-tight text-muted">Settings</h3>

          {!isRelic && (
            <>
              <PillSelector label="Heritage" options={HERITAGE_OPTIONS} value={heritage || ''} onChange={setHeritage} />
              <PillSelector label="Gender" options={[{ value: '', label: 'Any' }, ...GENDER_OPTIONS]} value={gender} onChange={setGender} />
              <PillSelector label="Name Mode" options={NAME_MODES} value={nameMode} onChange={setNameMode} />
            </>
          )}

          {isRelic && (
            <>
              <div>
                <label className="mb-1.5 block text-[10px] font-medium tracking-tight text-muted">Attach to Persona</label>
                <select
                  value={relicPersonaId}
                  onChange={(e) => setRelicPersonaId(e.target.value)}
                  className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                >
                  <option value="">Select persona...</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <PillSelector
                label="Era"
                options={[{ value: 'modern', label: 'Modern' }, { value: 'archaic', label: 'Archaic' }, { value: 'hybrid', label: 'Hybrid' }]}
                value={relicEra}
                onChange={setRelicEra}
              />
            </>
          )}

          <PillSelector label="Aesthetic" options={CORE_STYLES} value={coreStyle} onChange={setCoreStyle} />

          {/* Variance slider */}
          <div>
            <label className="mb-1.5 block text-[10px] font-medium tracking-tight text-muted">
              Variance <span className="ml-1 normal-case text-secondary">{variance}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={variance}
              onChange={(e) => setVariance(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="mt-1 flex justify-between text-[9px] text-muted">
              <span>Clean</span>
              <span>Corrupted</span>
            </div>
          </div>
        </div>

        {/* Result */}
        <div className="space-y-3 rounded-lg border border-border-default bg-canvas p-4">
          <h3 className="text-[10px] font-medium tracking-tight text-muted">Result</h3>

          <div className="font-display text-2xl font-bold tracking-wide text-primary">
            {displayName}
          </div>

          {isRelic ? (
            <>
              {generated.arcana?.coreDesire && (
                <p className="text-[10px] tracking-tight text-muted">{generated.arcana.coreDesire}</p>
              )}
              {generated.relics?.[0]?.origin && (
                <div className="text-sm text-secondary">
                  <span className="text-muted">Origin:</span> {generated.relics[0].origin}
                </div>
              )}
              <div className="text-sm leading-relaxed text-secondary">{generated.backstory}</div>
              {(generated.pseudonym || generated.sacredNumber !== undefined) && (
                <div className="flex items-center gap-3 text-sm text-muted">
                  {generated.pseudonym && <span>aka {generated.pseudonym}</span>}
                  {generated.pseudonym && generated.sacredNumber !== undefined && <span className="text-border-default">|</span>}
                  {generated.sacredNumber !== undefined && <span>No. {generated.sacredNumber}</span>}
                </div>
              )}
              {generated.samplePost && (
                <div className="text-sm italic text-secondary">"{generated.samplePost}"</div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {generated.subtaste && (
                  <>
                    <Badge variant="purple">{generated.subtaste.code}</Badge>
                    <Badge variant="amber">{generated.subtaste.glyph}</Badge>
                    <Badge variant="default">{generated.subtaste.label}</Badge>
                  </>
                )}
              </div>
              <div className="text-sm text-secondary">
                <span className="text-muted">Appearance:</span> {generated.appearance.build}, {generated.appearance.distinctiveTrait}
              </div>
              <div className="text-sm text-secondary">
                <span className="text-muted">Style:</span> {generated.appearance.styleAesthetic}
              </div>
              <div className="text-sm text-secondary">
                <span className="text-muted">Voice:</span> {generated.personality.voiceTone}
              </div>
              <div className="text-sm text-secondary">
                <span className="text-muted">Backstory:</span> {generated.backstory}
              </div>
            </>
          )}

          {/* Expandable details */}
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-[10px] text-muted transition hover:text-secondary"
          >
            {showDetails ? '▲ Hide' : '▼ Show'} archetype & personality details
          </button>

          {showDetails && (
            <div className="space-y-3 border-t border-border-default pt-2">
              <div className="text-sm">
                {generated.subtaste && (
                  <div className="mb-1 text-secondary">
                    <span className="text-muted">Designation:</span> {generated.subtaste.code} {generated.subtaste.glyph} — {generated.subtaste.label}
                  </div>
                )}
                <div className="text-secondary">
                  <span className="text-muted">Core Desire:</span> {generated.arcana.coreDesire}
                </div>
                <div className="text-secondary">
                  <span className="text-muted">Strengths:</span> {generated.arcana.goldenGifts?.join(', ')}
                </div>
                <div className="text-secondary">
                  <span className="text-muted">Shadows:</span> {generated.arcana.shadowThemes?.join(', ')}
                </div>
              </div>

              <div className="space-y-2">
                <AxisBar value={generated.personality.axes.orderChaos} leftLabel="Order" rightLabel="Chaos" />
                <AxisBar value={generated.personality.axes.mercyRuthlessness} leftLabel="Mercy" rightLabel="Ruthless" />
                <AxisBar value={generated.personality.axes.introvertExtrovert} leftLabel="Introvert" rightLabel="Extrovert" />
                <AxisBar value={generated.personality.axes.faithDoubt} leftLabel="Faith" rightLabel="Doubt" />
              </div>

              <div className="text-sm text-secondary">
                <span className="text-muted">Deep Fear:</span> {generated.personality.deepFear}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleReroll}
            className="rounded-lg border border-border-default bg-surface px-4 py-2 text-xs font-medium text-secondary transition hover:border-border-emphasis hover:text-primary"
          >
            Reroll
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={accepting || (isRelic && !relicPersonaId)}
            className="rounded-lg bg-accent px-5 py-2 text-xs font-medium text-canvas transition hover:bg-accent-hover disabled:opacity-50"
          >
            {accepting ? 'Creating...' : isRelic ? 'Accept & Create Relic' : 'Accept & Create Persona'}
          </button>
        </div>
      </div>
    </div>
  );
}
