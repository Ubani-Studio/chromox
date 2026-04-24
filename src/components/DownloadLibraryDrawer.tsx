import { Dialog } from '@headlessui/react';
import { useMemo, useState } from 'react';
import { API_HOST, sendSonicSignal } from '../lib/api';
import { Persona, RenderHistoryItem } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { ThumbUpIcon, ThumbDownIcon } from './Icons';

type Props = {
  open: boolean;
  onClose: () => void;
  jobs: RenderHistoryItem[];
  personas: Persona[];
  onSelectJob: (job: RenderHistoryItem) => void;
  onReplay: (jobId: string) => Promise<{ audioUrl: string; render: RenderHistoryItem }>;
  refreshJobs: () => Promise<void> | void;
  onRateJob: (jobId: string, rating: 'like' | 'dislike' | 'neutral') => Promise<void>;
  onAddToFolio: (renderId: string, name?: string) => Promise<void>;
};

export function DownloadLibraryDrawer({
  open,
  onClose,
  jobs,
  personas,
  onSelectJob,
  onReplay,
  refreshJobs,
  onRateJob,
  onAddToFolio
}: Props) {
  const [search, setSearch] = useState('');
  const [personaFilter, setPersonaFilter] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const presetLabels: Record<string, string> = {
    clean: 'Clean Studio',
    lush: 'Lush',
    vintage: 'Vintage',
    club: 'Club Stack',
    raw: 'Raw Direct',
    'shimmer-stack': 'Shimmer Stack',
    'harmonic-orbit': 'Harmonic Orbit',
    'pitch-warp': 'Pitch Warp',
    'choir-cloud': 'Choir Cloud',
    '8d-swarm': '8D Swarm'
  };

  const filtered = useMemo(() => {
    return jobs.filter((job) => {
      const matchesPersona = personaFilter === 'all' || job.personaId === personaFilter;
      const query = search.toLowerCase();
      const matchesSearch =
        job.personaName.toLowerCase().includes(query) ||
        job.lyrics.toLowerCase().includes(query) ||
        (job.label?.toLowerCase().includes(query) ?? false);
      return matchesPersona && matchesSearch;
    });
  }, [jobs, personaFilter, search]);

  const [ratingBusyId, setRatingBusyId] = useState<string | null>(null);
  const [folioBusyId, setFolioBusyId] = useState<string | null>(null);
  const [folioSavedIds, setFolioSavedIds] = useState<Set<string>>(new Set());

  async function handleRate(job: RenderHistoryItem, rating: 'like' | 'dislike') {
    const nextRating = job.rating === rating ? 'neutral' : rating;
    setRatingBusyId(job.id);
    try {
      await onRateJob(job.id, nextRating);
      await refreshJobs();
    } finally {
      setRatingBusyId(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 flex w-full max-w-3xl flex-col border-l border-border-default bg-canvas p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Dialog.Title className="font-display text-2xl font-semibold">Download Library</Dialog.Title>
            <p className="text-sm text-secondary">High-resolution 24-bit renders with recallable settings.</p>
          </div>
          <button onClick={onClose} className="text-sm text-muted transition hover:text-primary">
            Close
          </button>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <input
            className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
            placeholder="Search lyrics, persona, tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
            value={personaFilter}
            onChange={(e) => setPersonaFilter(e.target.value)}
          >
            <option value="all">All Personas</option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => refreshJobs()}
            className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm font-medium tracking-tight text-secondary transition hover:bg-overlay hover:border-border-emphasis"
          >
            Refresh
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto">
          {filtered.map((job) => {
            const persona = personas.find((p) => p.id === job.personaId);
            const guideSampleName = persona?.guide_samples?.find((sample) => sample.id === job.guideSampleId)?.name;
            return (
              <div key={job.id} className="rounded-2xl border border-border-default bg-surface p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs tracking-tight text-muted">{job.personaName}</p>
                  <h3 className="font-display text-lg font-medium">{job.label || 'Untitled Session'}</h3>
                  <p className="text-xs text-muted">{new Date(job.created_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`${job.audioUrl.startsWith('http') ? job.audioUrl : `${API_HOST}${job.audioUrl}`}`}
                    download
                    className="rounded-lg bg-accent px-4 py-2 text-xs font-medium tracking-tight text-canvas transition hover:bg-accent-hover"
                  >
                    24-bit WAV
                  </a>
                  <button
                    onClick={() => onSelectJob(job)}
                    className="rounded-lg border border-border-default bg-surface px-4 py-2 text-xs font-medium tracking-tight text-secondary transition hover:bg-overlay hover:border-border-emphasis"
                  >
                    Load in Studio
                  </button>
                  <button
                    onClick={async () => {
                      setBusyId(job.id);
                      try {
                        await onReplay(job.id);
                        sendSonicSignal('replay', job.id, { personaId: job.personaId });
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    disabled={busyId === job.id}
                    className="rounded-lg border border-border-default px-4 py-2 text-xs font-medium tracking-tight text-secondary transition hover:bg-overlay hover:text-primary disabled:opacity-50"
                  >
                    {busyId === job.id ? 'Re-rendering...' : 'Reprint'}
                  </button>
                </div>
              </div>
              <p className="mt-3 max-h-16 overflow-hidden text-sm text-secondary">{job.lyrics}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted">
                <span className="rounded-full border border-border-subtle bg-elevated px-3 py-1">
                  Style: <span className="text-secondary">{job.stylePrompt}</span>
                </span>
                {job.effects.preset && (
                  <span className="rounded-full border border-border-subtle bg-elevated px-3 py-1">
                    Preset:{' '}
                    <span className="text-secondary">
                      {presetLabels[job.effects.preset] ?? job.effects.preset}
                    </span>
                  </span>
                )}
                <span className="rounded-full border border-border-subtle bg-elevated px-3 py-1">
                  Engine: <span className="text-secondary">{job.effects.engine}</span>
                </span>
                {job.accent && (
                  <span className="rounded-full border border-border-subtle bg-elevated px-3 py-1">
                    Accent: <span className="text-secondary">{job.accent}</span>
                    {job.accentLocked ? ' (locked)' : ''}
                  </span>
                )}
                {guideSampleName && (
                  <span className="rounded-full border border-border-subtle bg-elevated px-3 py-1">
                    Guide: <span className="text-secondary">{guideSampleName}</span>
                  </span>
                )}
                {job.guideMatchIntensity !== undefined && (
                  <span className="rounded-full border border-border-subtle bg-elevated px-3 py-1">
                    Match: <span className="text-secondary">{Math.round(job.guideMatchIntensity * 100)}%</span>
                  </span>
                )}
                {job.guideUseLyrics && (
                  <span className="rounded-full border border-border-subtle bg-elevated px-3 py-1 text-secondary">Guide Lyrics</span>
                )}
                {job.guideTempo && Math.abs(job.guideTempo - 1) > 0.01 && (
                  <span className="rounded-full border border-border-subtle bg-elevated px-3 py-1">
                    Tempo: <span className="text-secondary">{job.guideTempo.toFixed(2)}x</span>
                  </span>
                )}
              </div>
              <div className="mt-3">
                <AudioPlayer
                  src={job.audioUrl.startsWith('http') ? job.audioUrl : `${API_HOST}${job.audioUrl}`}
                  label={job.label || 'Untitled Session'}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
                <span>Rate:</span>
                <button
                  type="button"
                  onClick={() => handleRate(job, 'like')}
                  disabled={ratingBusyId === job.id}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 font-medium ${
                    job.rating === 'like'
                      ? 'bg-accent/15 text-accent border border-accent/40'
                      : 'border border-border-default text-secondary hover:border-border-emphasis'
                  } disabled:opacity-40`}
                >
                  <ThumbUpIcon size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => handleRate(job, 'dislike')}
                  disabled={ratingBusyId === job.id}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 font-medium ${
                    job.rating === 'dislike'
                      ? 'bg-error/15 text-error border border-error/40'
                      : 'border border-border-default text-secondary hover:border-border-emphasis'
                  } disabled:opacity-40`}
                >
                  <ThumbDownIcon size={12} />
                </button>
                <span className="mx-1">|</span>
                <button
                  type="button"
                  onClick={async () => {
                    setFolioBusyId(job.id);
                    try {
                      await onAddToFolio(job.id, job.label || job.personaName);
                      setFolioSavedIds((prev) => new Set(prev).add(job.id));
                    } finally {
                      setFolioBusyId(null);
                    }
                  }}
                  disabled={folioBusyId === job.id || folioSavedIds.has(job.id)}
                  className="rounded-full border border-border-default px-3 py-1 font-medium text-secondary transition hover:border-border-emphasis disabled:opacity-40"
                >
                  {folioSavedIds.has(job.id) ? 'Saved to Folio' : folioBusyId === job.id ? 'Saving...' : 'Save to Folio'}
                </button>
              </div>
            </div>
          );
          })}
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-border-default bg-surface p-6 text-center text-secondary">
              No renders yet. Create one in the studio to populate your library.
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
