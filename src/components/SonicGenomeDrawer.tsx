import { Dialog } from '@headlessui/react';
import { useEffect, useState } from 'react';
import { SonicGenomeSummary, SonicArchetype } from '../types';
import { fetchSonicGenome, fetchSonicArchetypes } from '../lib/api';
import { DnaIcon } from './Icons';

type Props = {
  open: boolean;
  onClose: () => void;
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

export function SonicGenomeDrawer({ open, onClose }: Props) {
  const [genome, setGenome] = useState<SonicGenomeSummary | null>(null);
  const [archetypes, setArchetypes] = useState<Record<string, SonicArchetype>>({});
  const [tab, setTab] = useState<'genome' | 'tuning'>('genome');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  async function loadData() {
    setLoading(true);
    try {
      const [g, a] = await Promise.all([fetchSonicGenome(), fetchSonicArchetypes()]);
      setGenome(g);
      setArchetypes(a);
    } catch (error) {
      console.error('[SonicGenome] Failed to load', error);
    } finally {
      setLoading(false);
    }
  }

  const primary = genome?.archetype.primary;
  const secondary = genome?.archetype.secondary;
  const gam = genome?.gamification;

  // Distribution bars
  const distEntries = genome
    ? Object.entries(genome.archetype.distribution)
        .sort((a, b) => b[1] - a[1])
    : [];
  const maxDist = distEntries.length > 0 ? Math.max(...distEntries.map(([, v]) => Math.abs(v)), 1) : 1;

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-border-default bg-canvas shadow-2xl">
        {/* Header */}
        <div className="border-b border-border-default px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: primary ? `${primary.color}20` : 'rgba(160,160,160,0.15)' }}
              >
                <DnaIcon
                  className={primary ? 'text-accent' : 'text-muted'}
                  size={18}
                />
              </div>
              <div>
                <Dialog.Title className="font-display text-xl font-semibold">
                  Sonic Genome
                </Dialog.Title>
                <p className="text-sm text-secondary">
                  {primary ? `${primary.glyph} \u00B7 ${primary.title}` : 'Awaiting signals...'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-sm text-muted transition hover:text-primary">
              Close
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-1">
            <button
              onClick={() => setTab('genome')}
              className={`rounded-lg px-4 py-2 text-xs font-medium tracking-tight transition ${
                tab === 'genome'
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              Genome
            </button>
            <button
              onClick={() => setTab('tuning')}
              className={`rounded-lg px-4 py-2 text-xs font-medium tracking-tight transition ${
                tab === 'tuning'
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              Tuning
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted">Loading genome data...</p>
            </div>
          )}

          {!loading && genome && tab === 'genome' && (
            <div className="space-y-6">
              {/* Primary Archetype Card */}
              <div
                className="rounded-2xl border p-5"
                style={{ borderColor: primary ? `${primary.color}40` : undefined, backgroundColor: primary ? `${primary.color}08` : undefined }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold"
                    style={{ backgroundColor: primary ? `${primary.color}20` : 'rgba(160,160,160,0.1)', color: primary?.color }}
                  >
                    {primary?.glyph ?? 'VOID'}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium tracking-tight text-muted">
                      {primary?.designation ?? 'NULL'} \u00B7 {primary?.creativeMode ?? 'Receptive'}
                    </p>
                    <h3 className="font-display text-lg font-semibold" style={{ color: primary?.color }}>
                      {primary?.title ?? 'The Receptive Presence'}
                    </h3>
                    <p className="mt-1 text-sm text-secondary">
                      {primary?.essence ?? 'Open, unclassified. Pure potential.'}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] font-medium tracking-tight text-muted">Confidence</span>
                      <div className="h-1.5 flex-1 rounded-full bg-elevated">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.round(genome.archetype.confidence * 100)}%`, backgroundColor: primary?.color ?? '#A0A0A0' }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-muted">
                        {Math.round(genome.archetype.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
                {primary?.shadow && (
                  <p className="mt-3 text-xs italic text-muted">Shadow: {primary.shadow}</p>
                )}
              </div>

              {/* Secondary Archetype */}
              {secondary && (
                <div className="rounded-xl border border-border-default bg-surface p-4">
                  <p className="text-[10px] font-medium tracking-tight text-muted">Secondary Archetype</p>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="text-lg font-bold" style={{ color: secondary.color }}>
                      {secondary.glyph}
                    </span>
                    <div>
                      <p className="text-sm font-medium" style={{ color: secondary.color }}>
                        {secondary.title}
                      </p>
                      <p className="text-xs text-muted">{secondary.essence}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Distribution Grid */}
              {distEntries.length > 0 && (
                <div className="rounded-xl border border-border-default bg-surface p-4">
                  <p className="mb-3 text-[10px] font-medium tracking-tight text-muted">
                    Archetype Distribution
                  </p>
                  <div className="space-y-2">
                    {distEntries.map(([designation, value]) => {
                      const arch = archetypes[designation];
                      const pct = Math.max(0, (value / maxDist) * 100);
                      return (
                        <div key={designation} className="flex items-center gap-2">
                          <span className="w-12 text-right font-mono text-[10px] text-muted">
                            {arch?.glyph ?? designation}
                          </span>
                          <div className="h-2 flex-1 rounded-full bg-elevated">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: arch?.color ?? '#A0A0A0' }}
                            />
                          </div>
                          <span className="w-8 font-mono text-[10px] text-muted">
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
                <div className="rounded-xl border border-border-default bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-medium tracking-tight text-muted">
                      Tier: {gam.tierName}
                    </p>
                    <span className="font-mono text-sm font-semibold text-accent">
                      {gam.xp} XP
                    </span>
                  </div>
                  {gam.nextTierName && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[10px] text-muted">
                        <span>{gam.tierName}</span>
                        <span>{gam.nextTierName} ({gam.nextTierXP} XP)</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-elevated">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${Math.min(100, (gam.xp / (gam.nextTierXP ?? 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-elevated p-2">
                      <p className="text-lg font-semibold text-primary">{gam.totalRenders}</p>
                      <p className="text-[9px] tracking-tight text-muted">Renders</p>
                    </div>
                    <div className="rounded-lg bg-elevated p-2">
                      <p className="text-lg font-semibold text-primary">{gam.totalLikes}</p>
                      <p className="text-[9px] tracking-tight text-muted">Likes</p>
                    </div>
                    <div className="rounded-lg bg-elevated p-2">
                      <p className="text-lg font-semibold text-primary">{gam.streak}</p>
                      <p className="text-[9px] tracking-tight text-muted">Streak</p>
                    </div>
                  </div>

                  {/* Achievements */}
                  {gam.achievements.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-2 text-[10px] font-medium tracking-tight text-muted">Achievements</p>
                      <div className="flex flex-wrap gap-2">
                        {gam.achievements.map((id) => (
                          <span
                            key={id}
                            className="rounded-full bg-accent/15 px-3 py-1 text-[10px] font-medium text-accent"
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
                <div className="rounded-xl border border-border-default bg-surface p-4">
                  <p className="mb-3 text-[10px] font-medium tracking-tight text-muted">
                    Top Sonic Keywords
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {genome.topKeywords.map(({ keyword, score, count }) => (
                      <span
                        key={keyword}
                        className={`rounded-full border px-3 py-1 text-[10px] font-medium ${
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
                genome.sonicPatterns.preferredMoods.length > 0) && (
                <div className="rounded-xl border border-border-default bg-surface p-4">
                  <p className="mb-3 text-[10px] font-medium tracking-tight text-muted">
                    Sonic Patterns
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {genome.sonicPatterns.dominantTextures.length > 0 && (
                      <div>
                        <p className="text-[9px] tracking-tight text-muted">Textures</p>
                        <p className="text-sm text-primary">{genome.sonicPatterns.dominantTextures.join(', ')}</p>
                      </div>
                    )}
                    {genome.sonicPatterns.preferredMoods.length > 0 && (
                      <div>
                        <p className="text-[9px] tracking-tight text-muted">Moods</p>
                        <p className="text-sm text-primary">{genome.sonicPatterns.preferredMoods.join(', ')}</p>
                      </div>
                    )}
                    {genome.sonicPatterns.productionStyle.length > 0 && (
                      <div>
                        <p className="text-[9px] tracking-tight text-muted">Production</p>
                        <p className="text-sm text-primary">{genome.sonicPatterns.productionStyle.join(', ')}</p>
                      </div>
                    )}
                    {genome.sonicPatterns.vocalPreference.length > 0 && (
                      <div>
                        <p className="text-[9px] tracking-tight text-muted">Vocal</p>
                        <p className="text-sm text-primary">{genome.sonicPatterns.vocalPreference.join(', ')}</p>
                      </div>
                    )}
                    {genome.sonicPatterns.spatialPreference.length > 0 && (
                      <div>
                        <p className="text-[9px] tracking-tight text-muted">Space</p>
                        <p className="text-sm text-primary">{genome.sonicPatterns.spatialPreference.join(', ')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Stats footer */}
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>{genome.signalCount} signals recorded</span>
                <span>
                  {genome.lastUpdated
                    ? `Updated ${new Date(genome.lastUpdated).toLocaleDateString()}`
                    : 'No activity yet'}
                </span>
              </div>
            </div>
          )}

          {!loading && genome && tab === 'tuning' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border-default bg-surface p-4">
                <p className="mb-3 text-[10px] font-medium tracking-tight text-muted">
                  Governance Metrics
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-elevated p-3">
                    <p className="text-[10px] tracking-tight text-muted">Signal Count</p>
                    <p className="text-xl font-semibold text-primary">{genome.signalCount}</p>
                  </div>
                  <div className="rounded-lg bg-elevated p-3">
                    <p className="text-[10px] tracking-tight text-muted">Item Count</p>
                    <p className="text-xl font-semibold text-primary">{genome.itemCount}</p>
                  </div>
                  <div className="rounded-lg bg-elevated p-3">
                    <p className="text-[10px] tracking-tight text-muted">Confidence</p>
                    <p className="text-xl font-semibold text-primary">
                      {Math.round(genome.confidence * 100)}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-elevated p-3">
                    <p className="text-[10px] tracking-tight text-muted">Unique Effects</p>
                    <p className="text-xl font-semibold text-primary">
                      {gam?.uniqueEffects.length ?? 0}
                    </p>
                  </div>
                </div>
              </div>

              {gam && gam.uniqueEffects.length > 0 && (
                <div className="rounded-xl border border-border-default bg-surface p-4">
                  <p className="mb-2 text-[10px] font-medium tracking-tight text-muted">
                    Effects Used
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {gam.uniqueEffects.map((e) => (
                      <span key={e} className="rounded-full border border-border-default px-3 py-1 text-[10px] text-secondary">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {gam && gam.uniqueGuides.length > 0 && (
                <div className="rounded-xl border border-border-default bg-surface p-4">
                  <p className="mb-2 text-[10px] font-medium tracking-tight text-muted">
                    Guides Used
                  </p>
                  <p className="text-sm text-secondary">{gam.uniqueGuides.length} unique guides explored</p>
                </div>
              )}

              <div className="rounded-xl border border-border-default bg-surface p-4">
                <p className="mb-2 text-[10px] font-medium tracking-tight text-muted">
                  Avoid Textures
                </p>
                {genome.sonicPatterns.avoidTextures.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {genome.sonicPatterns.avoidTextures.map((t) => (
                      <span key={t} className="rounded-full border border-error/30 bg-error/10 px-3 py-1 text-[10px] text-error">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">No negative texture signals yet</p>
                )}
              </div>
            </div>
          )}

          {!loading && !genome && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <DnaIcon className="mb-3 text-muted" size={32} />
              <p className="text-sm font-medium text-secondary">Genome not initialized</p>
              <p className="mt-1 text-xs text-muted">
                Start rendering to begin building your sonic identity
              </p>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
