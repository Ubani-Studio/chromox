import { useState, useMemo } from 'react';
import { Persona, GuideSample } from '../types';
import {
  API_HOST,
  fetchFolioVideos,
  importFromFolioToPersona,
  importFromUrlToPersona,
  FolioVideo
} from '../lib/api';
import { AudioPlayer } from './AudioPlayer';
import { MicIcon, UploadIcon, LinkIcon } from './Icons';

type Props = {
  personas: Persona[];
  onRefresh: () => void;
};

type FilterPersona = 'all' | string;
type FilterSource = 'all' | 'user' | 'ai-lab' | 'folio';
type FilterMood = 'all' | 'hype' | 'dream' | 'anthem' | 'ambient';
type SortBy = 'recent' | 'effectiveness' | 'uses' | 'name';

export function VoiceLibraryTab({ personas, onRefresh }: Props) {
  const [filterPersona, setFilterPersona] = useState<FilterPersona>('all');
  const [filterSource, setFilterSource] = useState<FilterSource>('all');
  const [filterMood, setFilterMood] = useState<FilterMood>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('recent');

  // Import from URL modal
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importName, setImportName] = useState('');
  const [importPersonaId, setImportPersonaId] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Import from Folio modal
  const [showFolioImport, setShowFolioImport] = useState(false);
  const [folioVideos, setFolioVideos] = useState<FolioVideo[]>([]);
  const [loadingFolio, setLoadingFolio] = useState(false);
  const [selectedFolioVideo, setSelectedFolioVideo] = useState<FolioVideo | null>(null);

  // Collect all guide samples across personas
  const allSamples = useMemo(() => {
    const samples: Array<GuideSample & { personaId: string; personaName: string }> = [];
    for (const persona of personas) {
      if (persona.guide_samples) {
        for (const sample of persona.guide_samples) {
          samples.push({
            ...sample,
            personaId: persona.id,
            personaName: persona.name
          });
        }
      }
    }
    return samples;
  }, [personas]);

  // Filter samples
  const filteredSamples = useMemo(() => {
    let result = [...allSamples];

    if (filterPersona !== 'all') {
      result = result.filter(s => s.personaId === filterPersona);
    }

    if (filterSource !== 'all') {
      result = result.filter(s => s.source === filterSource);
    }

    if (filterMood !== 'all') {
      result = result.filter(s => s.mood === filterMood);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.personaName.toLowerCase().includes(query) ||
        s.tags?.some(t => t.toLowerCase().includes(query))
      );
    }

    // Sort based on selection
    switch (sortBy) {
      case 'effectiveness':
        return result.sort((a, b) => (b.effectivenessScore ?? 0) - (a.effectivenessScore ?? 0));
      case 'uses':
        return result.sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0));
      case 'name':
        return result.sort((a, b) => a.name.localeCompare(b.name));
      case 'recent':
      default:
        return result.sort((a, b) =>
          new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
        );
    }
  }, [allSamples, filterPersona, filterSource, filterMood, searchQuery, sortBy]);

  // Top effective samples (conviction-based recommendations)
  const recommendedSamples = useMemo(() => {
    return allSamples
      .filter(s => (s.useCount ?? 0) >= 1 && (s.effectivenessScore ?? 0) > 50)
      .sort((a, b) => (b.effectivenessScore ?? 0) - (a.effectivenessScore ?? 0))
      .slice(0, 4);
  }, [allSamples]);

  // Samples that need more testing
  const samplesToTest = useMemo(() => {
    return allSamples
      .filter(s => {
        const uses = s.useCount ?? 0;
        return uses >= 1 && uses < 5;
      })
      .sort((a, b) => (a.useCount ?? 0) - (b.useCount ?? 0))
      .slice(0, 3);
  }, [allSamples]);

  // Stats
  const stats = useMemo(() => {
    const bySource = { user: 0, 'ai-lab': 0, folio: 0 };
    const byMood = { hype: 0, dream: 0, anthem: 0, ambient: 0 };
    let totalUses = 0;
    let totalLikes = 0;
    let testedSamples = 0;

    for (const s of allSamples) {
      if (s.source && bySource[s.source as keyof typeof bySource] !== undefined) {
        bySource[s.source as keyof typeof bySource]++;
      }
      if (s.mood && byMood[s.mood as keyof typeof byMood] !== undefined) {
        byMood[s.mood as keyof typeof byMood]++;
      }
      totalUses += s.useCount ?? 0;
      totalLikes += s.likeCount ?? 0;
      if ((s.useCount ?? 0) > 0) testedSamples++;
    }

    return { total: allSamples.length, bySource, byMood, totalUses, totalLikes, testedSamples };
  }, [allSamples]);

  async function handleImportFromUrl() {
    if (!importUrl.trim() || !importPersonaId) return;

    setImporting(true);
    setImportError(null);

    try {
      await importFromUrlToPersona(importPersonaId, importUrl, importName || undefined);
      setShowUrlImport(false);
      setImportUrl('');
      setImportName('');
      setImportPersonaId('');
      onRefresh();
    } catch (err) {
      setImportError((err as Error).message || 'Failed to import');
    } finally {
      setImporting(false);
    }
  }

  async function loadFolioVideos() {
    setLoadingFolio(true);
    try {
      const videos = await fetchFolioVideos();
      setFolioVideos(videos);
    } catch (err) {
      console.error('Failed to load Folio videos:', err);
    } finally {
      setLoadingFolio(false);
    }
  }

  async function handleImportFromFolio() {
    if (!selectedFolioVideo || !importPersonaId) return;

    setImporting(true);
    setImportError(null);

    try {
      await importFromFolioToPersona(
        importPersonaId,
        selectedFolioVideo.id,
        importName || selectedFolioVideo.title
      );
      setShowFolioImport(false);
      setSelectedFolioVideo(null);
      setImportName('');
      setImportPersonaId('');
      onRefresh();
    } catch (err) {
      setImportError((err as Error).message || 'Failed to import');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Voice Library</h1>
          <p className="text-sm text-secondary">
            {stats.total} sample{stats.total !== 1 ? 's' : ''} across {personas.length} persona{personas.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowUrlImport(true);
              if (personas.length > 0 && !importPersonaId) {
                setImportPersonaId(personas[0].id);
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/10"
          >
            <LinkIcon size={14} />
            Import from URL
          </button>
          <button
            onClick={() => {
              setShowFolioImport(true);
              loadFolioVideos();
              if (personas.length > 0 && !importPersonaId) {
                setImportPersonaId(personas[0].id);
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary transition hover:bg-overlay"
          >
            <UploadIcon size={14} />
            Import from Folio
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="mb-6 grid grid-cols-5 gap-4">
        <div className="rounded-xl border border-border-default bg-surface p-4">
          <p className="text-xs tracking-tight text-muted">Total Samples</p>
          <p className="font-display text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-border-default bg-surface p-4">
          <p className="text-xs tracking-tight text-muted">Tested</p>
          <p className="font-display text-2xl font-semibold">{stats.testedSamples}</p>
          <p className="text-[10px] text-muted">used at least once</p>
        </div>
        <div className="rounded-xl border border-border-default bg-surface p-4">
          <p className="text-xs tracking-tight text-muted">Total Uses</p>
          <p className="font-display text-2xl font-semibold">{stats.totalUses}</p>
        </div>
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-xs tracking-tight text-accent">Liked Renders</p>
          <p className="font-display text-2xl font-semibold text-accent">{stats.totalLikes}</p>
        </div>
        <div className="rounded-xl border border-border-default bg-surface p-4">
          <p className="text-xs tracking-tight text-muted">Conviction Rate</p>
          <p className="font-display text-2xl font-semibold">
            {stats.totalUses > 0 ? Math.round((stats.totalLikes / stats.totalUses) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Recommended Section */}
      {recommendedSamples.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold tracking-tight text-accent">
            <span className="text-lg">★</span> High Conviction Samples
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {recommendedSamples.map((sample) => (
              <div
                key={`rec_${sample.personaId}_${sample.id}`}
                className="rounded-xl border-2 border-accent/30 bg-gradient-to-br from-accent/5 to-transparent p-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[10px] tracking-tight text-muted">{sample.personaName}</p>
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
                    {sample.effectivenessScore}%
                  </span>
                </div>
                <h4 className="font-medium truncate text-sm">{sample.name}</h4>
                <p className="text-[10px] text-secondary">
                  {sample.useCount} use{sample.useCount !== 1 ? 's' : ''} · {sample.likeCount} like{sample.likeCount !== 1 ? 's' : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Samples to Test */}
      {samplesToTest.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold tracking-tight text-secondary">
            <span className="text-lg">◐</span> Needs More Testing
            <span className="text-xs font-normal normal-case text-muted">(1-4 uses)</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {samplesToTest.map((sample) => (
              <div
                key={`test_${sample.personaId}_${sample.id}`}
                className="rounded-lg border border-border-default bg-surface px-3 py-2"
              >
                <span className="text-sm font-medium">{sample.name}</span>
                <span className="ml-2 text-xs text-muted">
                  {sample.useCount} use{sample.useCount !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 grid gap-3 md:grid-cols-5">
        <input
          className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
          placeholder="Search samples..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          value={filterPersona}
          onChange={(e) => setFilterPersona(e.target.value)}
          className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
        >
          <option value="all">All Personas</option>
          {personas.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value as FilterSource)}
          className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
        >
          <option value="all">All Sources</option>
          <option value="user">User ({stats.bySource.user})</option>
          <option value="ai-lab">AI Lab ({stats.bySource['ai-lab']})</option>
          <option value="folio">Folio ({stats.bySource.folio})</option>
        </select>
        <select
          value={filterMood}
          onChange={(e) => setFilterMood(e.target.value as FilterMood)}
          className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
        >
          <option value="all">All Moods</option>
          <option value="hype">Hype ({stats.byMood.hype})</option>
          <option value="dream">Dream ({stats.byMood.dream})</option>
          <option value="anthem">Anthem ({stats.byMood.anthem})</option>
          <option value="ambient">Ambient ({stats.byMood.ambient})</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
        >
          <option value="recent">Sort: Recent</option>
          <option value="effectiveness">Sort: Effectiveness ★</option>
          <option value="uses">Sort: Most Used</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* Sample Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredSamples.map((sample) => {
          const hasUsageData = (sample.useCount ?? 0) > 0;
          const effectivenessScore = sample.effectivenessScore ?? 0;
          const isHighConviction = effectivenessScore >= 70;

          return (
            <div
              key={`${sample.personaId}_${sample.id}`}
              className={`rounded-2xl border p-4 transition hover:border-border-emphasis ${
                isHighConviction
                  ? 'border-accent/30 bg-gradient-to-br from-accent/5 to-surface'
                  : 'border-border-default bg-surface'
              }`}
            >
              <div className="mb-2 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs tracking-tight text-muted">{sample.personaName}</p>
                  <h3 className="font-display text-lg font-medium truncate">{sample.name}</h3>
                </div>
                {/* Effectiveness Score Badge */}
                {hasUsageData ? (
                  <div className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg ${
                    isHighConviction ? 'bg-accent/20' : 'bg-elevated'
                  }`}>
                    <span className={`text-xs font-bold ${
                      isHighConviction ? 'text-accent' : 'text-secondary'
                    }`}>
                      {effectivenessScore}
                    </span>
                    <span className="text-[8px] text-muted">score</span>
                  </div>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-elevated">
                    <MicIcon size={14} className="text-secondary" />
                  </div>
                )}
              </div>

              {/* Usage Stats */}
              {hasUsageData && (
                <div className="mb-2 flex items-center gap-3 text-[10px] text-muted">
                  <span>{sample.useCount} use{sample.useCount !== 1 ? 's' : ''}</span>
                  {(sample.likeCount ?? 0) > 0 && (
                    <span className="text-accent">♥ {sample.likeCount}</span>
                  )}
                  {(sample.dislikeCount ?? 0) > 0 && (
                    <span>✕ {sample.dislikeCount}</span>
                  )}
                </div>
              )}

              {/* Tags */}
              <div className="mb-3 flex flex-wrap gap-1">
                {sample.source && (
                  <span className="rounded-full border border-border-default bg-elevated px-2 py-0.5 text-[10px] text-muted">
                    {sample.source}
                  </span>
                )}
                {sample.mood && (
                  <span className="rounded-full border border-border-default bg-elevated px-2 py-0.5 text-[10px] text-muted">
                    {sample.mood}
                  </span>
                )}
                {sample.accentMetadata?.detected && (
                  <span className="rounded-full border border-border-default bg-elevated px-2 py-0.5 text-[10px] text-muted">
                    {sample.accentMetadata.detected}
                  </span>
                )}
                {!hasUsageData && (
                  <span className="rounded-full border border-accent/30 bg-accent/5 px-2 py-0.5 text-[10px] text-accent">
                    untested
                  </span>
                )}
              </div>

              {/* Transcript preview */}
              {sample.transcript && (
                <p className="mb-3 text-xs text-secondary line-clamp-2 italic">
                  "{sample.transcript}"
                </p>
              )}

              {/* Audio player */}
              <AudioPlayer
                src={sample.url ? (sample.url.startsWith('http') ? sample.url : `${API_HOST}${sample.url}`) : ''}
                label={sample.name}
              />
            </div>
          );
        })}
      </div>

      {filteredSamples.length === 0 && (
        <div className="rounded-2xl border border-border-default bg-surface p-12 text-center">
          <MicIcon size={32} className="mx-auto mb-3 text-muted" />
          <p className="text-secondary">No voice samples found.</p>
          <p className="mt-1 text-xs text-muted">
            Import samples from URLs or Folio to build your voice library.
          </p>
        </div>
      )}

      {/* Import from URL Modal */}
      {showUrlImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-border-default bg-surface p-6">
            <h3 className="font-display text-lg font-semibold">Import from URL</h3>
            <p className="mt-1 text-sm text-secondary">
              Extract audio from YouTube, TikTok, or other video URLs.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium tracking-tight text-muted">Video URL</label>
                <input
                  className="mt-1 w-full rounded-xl border border-border-default bg-canvas px-3 py-2 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
                  placeholder="https://youtube.com/watch?v=..."
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium tracking-tight text-muted">Sample Name (optional)</label>
                <input
                  className="mt-1 w-full rounded-xl border border-border-default bg-canvas px-3 py-2 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
                  placeholder="Voice Reference"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium tracking-tight text-muted">Add to Persona</label>
                <select
                  className="mt-1 w-full rounded-xl border border-border-default bg-canvas px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                  value={importPersonaId}
                  onChange={(e) => setImportPersonaId(e.target.value)}
                >
                  {personas.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {importError && (
                <p className="text-sm text-error">{importError}</p>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowUrlImport(false);
                  setImportUrl('');
                  setImportName('');
                  setImportError(null);
                }}
                className="flex-1 rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-secondary transition hover:bg-overlay"
              >
                Cancel
              </button>
              <button
                onClick={handleImportFromUrl}
                disabled={!importUrl.trim() || !importPersonaId || importing}
                className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-canvas transition hover:bg-accent-hover disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import from Folio Modal */}
      {showFolioImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-2xl rounded-2xl border border-border-default bg-surface p-6">
            <h3 className="font-display text-lg font-semibold">Import from Folio</h3>
            <p className="mt-1 text-sm text-secondary">
              Select a saved video to extract as a voice reference.
            </p>

            <div className="mt-4">
              {loadingFolio ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-muted">Loading Folio videos...</p>
                </div>
              ) : folioVideos.length === 0 ? (
                <div className="rounded-xl border border-border-default bg-elevated p-8 text-center">
                  <p className="text-secondary">No videos saved in Folio.</p>
                  <p className="mt-1 text-xs text-muted">
                    Save videos from YouTube or TikTok using the Folio Chrome extension.
                  </p>
                </div>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {folioVideos.map((video) => (
                    <button
                      key={video.id}
                      onClick={() => setSelectedFolioVideo(video)}
                      className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition ${
                        selectedFolioVideo?.id === video.id
                          ? 'border-accent bg-accent/5'
                          : 'border-border-default bg-surface hover:border-border-emphasis'
                      }`}
                    >
                      {video.thumbnail && (
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="h-16 w-24 shrink-0 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs tracking-tight text-muted">{video.platform}</p>
                        <h4 className="font-medium truncate">{video.title}</h4>
                        <p className="text-xs text-secondary truncate">{video.url}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedFolioVideo && (
              <div className="mt-4 space-y-3 border-t border-border-default pt-4">
                <div>
                  <label className="text-xs font-medium tracking-tight text-muted">Sample Name</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-border-default bg-canvas px-3 py-2 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
                    placeholder={selectedFolioVideo.title}
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium tracking-tight text-muted">Add to Persona</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-border-default bg-canvas px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                    value={importPersonaId}
                    onChange={(e) => setImportPersonaId(e.target.value)}
                  >
                    {personas.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {importError && (
                  <p className="text-sm text-error">{importError}</p>
                )}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowFolioImport(false);
                  setSelectedFolioVideo(null);
                  setImportName('');
                  setImportError(null);
                }}
                className="flex-1 rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-secondary transition hover:bg-overlay"
              >
                Cancel
              </button>
              <button
                onClick={handleImportFromFolio}
                disabled={!selectedFolioVideo || !importPersonaId || importing}
                className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-canvas transition hover:bg-accent-hover disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
