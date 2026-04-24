import { Dialog } from '@headlessui/react';
import { useEffect, useState } from 'react';
import { Persona, Relic, SonicGenomeSummary, SonicArchetype } from '../../types';
import { fetchPersonaRelics, fetchSonicGenome, fetchSonicArchetypes } from '../../lib/api';
import { RelicCard } from './RelicCard';
import { GeneratorPanel } from './GeneratorPanel';
import { ShieldIcon, DnaIcon } from '../Icons';

type Props = {
  open: boolean;
  onClose: () => void;
  personas: Persona[];
  onCreatePersona?: (data: {
    name: string;
    bio: string;
    voice: string;
    color: string;
    personaTags: string[];
    toneAllowed: string[];
    toneForbidden: string[];
    systemPrompt: string;
    lcosData: unknown;
  }) => Promise<void>;
  onCreateRelic?: (personaId: string, relic: { name: string; description: string; lore: string; tier: number; icon: string }) => Promise<void>;
};

const ACHIEVEMENT_LABELS: Record<string, string> = {
  'first-render': 'First Render',
  'ten-renders': 'Ten Renders',
  'fifty-renders': 'Fifty Renders',
  'first-like': 'First Like',
  'first-mint': 'First Mint',
  'streak-3': '3-Day Streak',
  'streak-7': '7-Day Streak',
  'effect-explorer': 'Effect Explorer',
  'guide-explorer': 'Guide Explorer',
  'glyph-revealed': 'Glyph Revealed'
};

export function BovedaDrawer({ open, onClose, personas, onCreatePersona, onCreateRelic }: Props) {
  const [loading, setLoading] = useState(false);

  // Genome state
  const [genome, setGenome] = useState<SonicGenomeSummary | null>(null);
  const [archetypes, setArchetypes] = useState<Record<string, SonicArchetype>>({});

  // Relics state
  const [relicsByPersona, setRelicsByPersona] = useState<Record<string, Relic[]>>({});

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  async function loadData() {
    setLoading(true);
    try {
      const [genomeData, archetypeData, ...relicResults] = await Promise.all([
        fetchSonicGenome(),
        fetchSonicArchetypes(),
        ...personas.map((p) => fetchPersonaRelics(p.id).then((relics) => ({ personaId: p.id, relics })))
      ]);
      setGenome(genomeData);
      setArchetypes(archetypeData);
      const map: Record<string, Relic[]> = {};
      for (const result of relicResults) {
        if (result.relics.length > 0) {
          map[result.personaId] = result.relics;
        }
      }
      setRelicsByPersona(map);
    } catch (error) {
      console.error('[Boveda] Failed to load', error);
    } finally {
      setLoading(false);
    }
  }

  const totalRelics = Object.values(relicsByPersona).reduce((sum, r) => sum + r.length, 0);

  // Genome derived values
  const primary = genome?.archetype.primary;
  const secondary = genome?.archetype.secondary;
  const gam = genome?.gamification;
  const distEntries = genome
    ? Object.entries(genome.archetype.distribution).sort((a, b) => b[1] - a[1])
    : [];
  const maxDist = distEntries.length > 0 ? Math.max(...distEntries.map(([, v]) => Math.abs(v)), 1) : 1;

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 flex w-full max-w-5xl flex-col border-l border-border-default bg-canvas shadow-2xl">
        {/* Header */}
        <div className="border-b border-border-default px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
                <ShieldIcon className="text-accent" size={18} />
              </div>
              <div>
                <Dialog.Title className="font-display text-xl font-semibold">Boveda</Dialog.Title>
                <p className="text-sm text-secondary">
                  {primary
                    ? `${primary.glyph} · ${primary.title}`
                    : 'Voice Identity Vault'}
                  {totalRelics > 0 && ` · ${totalRelics} relic${totalRelics !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-sm text-muted transition hover:text-primary">
              Close
            </button>
          </div>
        </div>

        {/* Content — two-column: Create (left) | Genome (right) */}
        <div className="flex flex-1 overflow-hidden">
          {loading && (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted">Loading boveda...</p>
            </div>
          )}

          {!loading && (
            <>
              {/* ── CREATE (left) ──────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto border-r border-border-default px-6 py-4">
                <h2 className="mb-4 text-[10px] font-medium tracking-tight text-muted">Create</h2>
                <div className="space-y-6">
                  <GeneratorPanel
                    onAcceptPersona={onCreatePersona ?? (async () => {})}
                    onAcceptRelic={onCreateRelic ? async (personaId, relic) => {
                      await onCreateRelic(personaId, relic);
                      await loadData();
                    } : undefined}
                    personas={personas}
                  />

                  {/* Relics grouped by persona */}
                  {personas.map((persona) => {
                    const relics = relicsByPersona[persona.id];
                    if (!relics || relics.length === 0) return null;
                    return (
                      <div key={persona.id}>
                        <h3 className="mb-3 text-xs font-medium tracking-tight text-muted">
                          {persona.name} ({relics.length})
                        </h3>
                        <div className="space-y-3">
                          {relics.map((relic) => (
                            <RelicCard key={relic.id} relic={relic} variant="generated" />
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {totalRelics === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-default bg-surface p-12 text-center">
                      <ShieldIcon className="mb-3 text-muted" size={32} />
                      <p className="text-sm font-medium text-secondary">No relics yet</p>
                      <p className="mt-1 text-xs text-muted">
                        Like 5 renders for a persona to auto-generate relics, or use the generator in Relic mode
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── GENOME (right) ─────────────────────────────────── */}
              <div className="w-80 shrink-0 overflow-y-auto px-5 py-4">
                <h2 className="mb-4 text-[10px] font-medium tracking-tight text-muted">Genome</h2>

                {genome ? (
                  <div className="space-y-4">
                    {/* Primary Archetype Card */}
                    <div
                      className="rounded-2xl border p-4"
                      style={{ borderColor: primary ? `${primary.color}40` : undefined, backgroundColor: primary ? `${primary.color}08` : undefined }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
                          style={{ backgroundColor: primary ? `${primary.color}20` : 'rgba(160,160,160,0.1)', color: primary?.color }}
                        >
                          {primary?.glyph ?? 'VOID'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-medium tracking-tight text-muted">
                            {primary?.designation ?? 'NULL'} · {primary?.creativeMode ?? 'Receptive'}
                          </p>
                          <h3 className="font-display text-sm font-semibold" style={{ color: primary?.color }}>
                            {primary?.title ?? 'The Receptive Presence'}
                          </h3>
                          <p className="mt-1 text-xs text-secondary leading-relaxed">
                            {primary?.essence ?? 'Open, unclassified. Pure potential.'}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-elevated">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${Math.round(genome.archetype.confidence * 100)}%`, backgroundColor: primary?.color ?? '#A0A0A0' }}
                              />
                            </div>
                            <span className="font-mono text-[9px] text-muted">
                              {Math.round(genome.archetype.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      {primary?.shadow && (
                        <p className="mt-2 text-[10px] italic text-muted">Shadow: {primary.shadow}</p>
                      )}
                    </div>

                    {/* Secondary Archetype */}
                    {secondary && (
                      <div className="rounded-xl border border-border-default bg-surface p-3">
                        <p className="text-[9px] font-medium tracking-tight text-muted">Secondary</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: secondary.color }}>
                            {secondary.glyph}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium" style={{ color: secondary.color }}>
                              {secondary.title}
                            </p>
                            <p className="truncate text-[10px] text-muted">{secondary.essence}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Distribution Grid */}
                    {distEntries.length > 0 && (
                      <div className="rounded-xl border border-border-default bg-surface p-3">
                        <p className="mb-2 text-[9px] font-medium tracking-tight text-muted">
                          Distribution
                        </p>
                        <div className="space-y-1.5">
                          {distEntries.map(([designation, value]) => {
                            const arch = archetypes[designation];
                            const pct = Math.max(0, (value / maxDist) * 100);
                            return (
                              <div key={designation} className="flex items-center gap-1.5">
                                <span className="w-10 text-right font-mono text-[9px] text-muted">
                                  {arch?.glyph ?? designation}
                                </span>
                                <div className="h-1.5 flex-1 rounded-full bg-elevated">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${pct}%`, backgroundColor: arch?.color ?? '#A0A0A0' }}
                                  />
                                </div>
                                <span className="w-6 font-mono text-[9px] text-muted">
                                  {value.toFixed(1)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Gamification */}
                    {gam && (
                      <div className="rounded-xl border border-border-default bg-surface p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-medium tracking-tight text-muted">
                            {gam.tierName}
                          </p>
                          <span className="font-mono text-xs font-semibold text-accent">
                            {gam.xp} XP
                          </span>
                        </div>
                        {gam.nextTierName && (
                          <div className="mt-1.5">
                            <div className="flex items-center justify-between text-[9px] text-muted">
                              <span>{gam.tierName}</span>
                              <span>{gam.nextTierName} ({gam.nextTierXP})</span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-elevated">
                              <div
                                className="h-full rounded-full bg-accent transition-all"
                                style={{ width: `${Math.min(100, (gam.xp / (gam.nextTierXP ?? 1)) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg bg-elevated p-1.5">
                            <p className="text-sm font-semibold text-primary">{gam.totalRenders}</p>
                            <p className="text-[8px] tracking-tight text-muted">Renders</p>
                          </div>
                          <div className="rounded-lg bg-elevated p-1.5">
                            <p className="text-sm font-semibold text-primary">{gam.totalLikes}</p>
                            <p className="text-[8px] tracking-tight text-muted">Likes</p>
                          </div>
                          <div className="rounded-lg bg-elevated p-1.5">
                            <p className="text-sm font-semibold text-primary">{gam.streak}</p>
                            <p className="text-[8px] tracking-tight text-muted">Streak</p>
                          </div>
                        </div>

                        {gam.achievements.length > 0 && (
                          <div className="mt-2">
                            <p className="mb-1.5 text-[9px] font-medium tracking-tight text-muted">Achievements</p>
                            <div className="flex flex-wrap gap-1.5">
                              {gam.achievements.map((id) => (
                                <span
                                  key={id}
                                  className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-medium text-accent"
                                >
                                  {ACHIEVEMENT_LABELS[id] ?? id}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Top Sonic Keywords */}
                    {genome.topKeywords.length > 0 && (
                      <div className="rounded-xl border border-border-default bg-surface p-3">
                        <p className="mb-2 text-[9px] font-medium tracking-tight text-muted">
                          Sonic Keywords
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {genome.topKeywords.map(({ keyword, score, count }) => (
                            <span
                              key={keyword}
                              className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${
                                score > 0
                                  ? 'border-accent/30 bg-accent/10 text-accent'
                                  : 'border-error/30 bg-error/10 text-error'
                              }`}
                            >
                              {keyword} ({score > 0 ? '+' : ''}{score}, {count}x)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sonic Patterns */}
                    {(genome.sonicPatterns.dominantTextures.length > 0 ||
                      genome.sonicPatterns.preferredMoods.length > 0 ||
                      genome.sonicPatterns.productionStyle.length > 0) && (
                      <div className="rounded-xl border border-border-default bg-surface p-3">
                        <p className="mb-2 text-[9px] font-medium tracking-tight text-muted">
                          Sonic Patterns
                        </p>
                        <div className="space-y-2">
                          {genome.sonicPatterns.dominantTextures.length > 0 && (
                            <div>
                              <p className="text-[8px] tracking-tight text-muted">Textures</p>
                              <p className="text-xs text-primary">{genome.sonicPatterns.dominantTextures.join(', ')}</p>
                            </div>
                          )}
                          {genome.sonicPatterns.preferredMoods.length > 0 && (
                            <div>
                              <p className="text-[8px] tracking-tight text-muted">Moods</p>
                              <p className="text-xs text-primary">{genome.sonicPatterns.preferredMoods.join(', ')}</p>
                            </div>
                          )}
                          {genome.sonicPatterns.productionStyle.length > 0 && (
                            <div>
                              <p className="text-[8px] tracking-tight text-muted">Production</p>
                              <p className="text-xs text-primary">{genome.sonicPatterns.productionStyle.join(', ')}</p>
                            </div>
                          )}
                          {genome.sonicPatterns.vocalPreference.length > 0 && (
                            <div>
                              <p className="text-[8px] tracking-tight text-muted">Vocal</p>
                              <p className="text-xs text-primary">{genome.sonicPatterns.vocalPreference.join(', ')}</p>
                            </div>
                          )}
                          {genome.sonicPatterns.spatialPreference.length > 0 && (
                            <div>
                              <p className="text-[8px] tracking-tight text-muted">Space</p>
                              <p className="text-xs text-primary">{genome.sonicPatterns.spatialPreference.join(', ')}</p>
                            </div>
                          )}
                          {genome.sonicPatterns.avoidTextures.length > 0 && (
                            <div>
                              <p className="text-[8px] tracking-tight text-muted">Avoid</p>
                              <p className="text-xs text-error">{genome.sonicPatterns.avoidTextures.join(', ')}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Exploration */}
                    {gam && (gam.uniqueEffects.length > 0 || gam.uniqueGuides.length > 0) && (
                      <div className="rounded-xl border border-border-default bg-surface p-3">
                        <p className="mb-2 text-[9px] font-medium tracking-tight text-muted">
                          Exploration
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-elevated p-2">
                            <p className="text-[9px] tracking-tight text-muted">Effects</p>
                            <p className="text-lg font-semibold text-primary">{gam.uniqueEffects.length}</p>
                          </div>
                          <div className="rounded-lg bg-elevated p-2">
                            <p className="text-[9px] tracking-tight text-muted">Guides</p>
                            <p className="text-lg font-semibold text-primary">{gam.uniqueGuides.length}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Stats footer */}
                    <div className="flex items-center justify-between text-[9px] text-muted">
                      <span>{genome.signalCount} signals</span>
                      <span>
                        {genome.lastUpdated
                          ? new Date(genome.lastUpdated).toLocaleDateString()
                          : 'No activity'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <DnaIcon className="mb-3 text-muted" size={28} />
                    <p className="text-xs font-medium text-secondary">Genome not initialized</p>
                    <p className="mt-1 text-[10px] text-muted">
                      Start rendering to build your sonic identity
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
