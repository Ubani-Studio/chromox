import { useMemo, useState } from 'react';
import { API_HOST, sendSonicSignal } from '../lib/api';
import { Persona, RenderHistoryItem } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { ThumbUpIcon, ThumbDownIcon, FolderIcon, ChevronDownIcon } from './Icons';

type SortOption = 'recent' | 'oldest' | 'az' | 'za' | 'liked' | 'disliked';
type GroupBy = 'none' | 'persona' | 'date' | 'rating' | 'style';
type RatingFilter = 'all' | 'liked' | 'disliked' | 'unrated';

interface RenderGroup {
  label: string;
  jobs: RenderHistoryItem[];
}

type Props = {
  jobs: RenderHistoryItem[];
  personas: Persona[];
  onSelectJob: (job: RenderHistoryItem) => void;
  onReplay: (jobId: string) => Promise<{ audioUrl: string; render: RenderHistoryItem }>;
  refreshJobs: () => Promise<void> | void;
  onRateJob: (jobId: string, rating: 'like' | 'dislike' | 'neutral') => Promise<void>;
  onRenameJob: (jobId: string, label: string) => Promise<void>;
  onChangePersona: (jobId: string, personaId: string) => Promise<void>;
  onSaveAsGuide: (personaId: string, renderId: string, name?: string) => Promise<void>;
};

export function DownloadsTab({
  jobs,
  personas,
  onSelectJob,
  onReplay,
  refreshJobs,
  onRateJob,
  onRenameJob,
  onChangePersona,
  onSaveAsGuide
}: Props) {
  const [search, setSearch] = useState('');
  const [personaFilter, setPersonaFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [groupBy, setGroupBy] = useState<GroupBy>('date');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ratingBusyId, setRatingBusyId] = useState<string | null>(null);
  const [guideBusyId, setGuideBusyId] = useState<string | null>(null);
  const [guideSavedIds, setGuideSavedIds] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [selectedNewPersonaId, setSelectedNewPersonaId] = useState<string | null>(null);
  const [changingPersonaId, setChangingPersonaId] = useState<string | null>(null);

  async function handleRename(jobId: string) {
    // Prevent double submission
    if (renamingId === jobId) return;

    const newLabel = editingLabel.trim();
    if (!newLabel) {
      setEditingId(null);
      setEditingLabel('');
      return;
    }

    setRenamingId(jobId);
    try {
      await onRenameJob(jobId, newLabel);
      await refreshJobs();
    } catch (err) {
      console.error('Failed to rename:', err);
    } finally {
      setEditingId(null);
      setEditingLabel('');
      setRenamingId(null);
    }
  }

  async function handleChangePersona(jobId: string, personaId: string) {
    if (changingPersonaId === jobId) return;
    setChangingPersonaId(jobId);
    try {
      await onChangePersona(jobId, personaId);
      // onChangePersona already updates the state in App.tsx
      // No need to call refreshJobs() which could cause timing issues
    } catch (err) {
      console.error('Failed to change persona:', err);
    } finally {
      setChangingPersonaId(null);
      setEditingPersonaId(null);
      setSelectedNewPersonaId(null);
    }
  }

  function toggleGroup(label: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

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

  // Stats
  const likedCount = jobs.filter(j => j.rating === 'like').length;
  const dislikedCount = jobs.filter(j => j.rating === 'dislike').length;
  const unratedCount = jobs.filter(j => !j.rating || j.rating === 'neutral').length;

  const filtered = useMemo(() => {
    let result = jobs.filter((job) => {
      const matchesPersona = personaFilter === 'all' || job.personaId === personaFilter;
      const query = search.toLowerCase();
      const matchesSearch =
        job.personaName.toLowerCase().includes(query) ||
        job.lyrics.toLowerCase().includes(query) ||
        (job.label?.toLowerCase().includes(query) ?? false) ||
        (job.stylePrompt?.toLowerCase().includes(query) ?? false);

      let matchesRating = true;
      if (ratingFilter === 'liked') matchesRating = job.rating === 'like';
      else if (ratingFilter === 'disliked') matchesRating = job.rating === 'dislike';
      else if (ratingFilter === 'unrated') matchesRating = !job.rating || job.rating === 'neutral';

      return matchesPersona && matchesSearch && matchesRating;
    });

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'az':
          return (a.label || 'Untitled').localeCompare(b.label || 'Untitled');
        case 'za':
          return (b.label || 'Untitled').localeCompare(a.label || 'Untitled');
        case 'liked':
          const aLike = a.rating === 'like' ? 0 : a.rating === 'dislike' ? 2 : 1;
          const bLike = b.rating === 'like' ? 0 : b.rating === 'dislike' ? 2 : 1;
          return aLike - bLike;
        case 'disliked':
          const aDislike = a.rating === 'dislike' ? 0 : a.rating === 'like' ? 2 : 1;
          const bDislike = b.rating === 'dislike' ? 0 : b.rating === 'like' ? 2 : 1;
          return aDislike - bDislike;
        default:
          return 0;
      }
    });

    return result;
  }, [jobs, personaFilter, search, sortBy, ratingFilter]);

  // Group renders
  const groupedRenders = useMemo((): RenderGroup[] => {
    if (groupBy === 'none') {
      return [{ label: '', jobs: filtered }];
    }

    const groups = new Map<string, RenderHistoryItem[]>();

    for (const job of filtered) {
      let key: string;

      switch (groupBy) {
        case 'persona':
          key = job.personaName;
          break;
        case 'date':
          const date = new Date(job.created_at);
          const now = new Date();
          const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays === 0) key = 'Today';
          else if (diffDays === 1) key = 'Yesterday';
          else if (diffDays < 7) key = 'This Week';
          else if (diffDays < 30) key = 'This Month';
          else key = 'Older';
          break;
        case 'rating':
          if (job.rating === 'like') key = '👍 Liked';
          else if (job.rating === 'dislike') key = '👎 Disliked';
          else key = 'Unrated';
          break;
        case 'style':
          key = job.stylePrompt || 'No Style';
          break;
        default:
          key = 'All';
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(job);
    }

    const result: RenderGroup[] = [];

    if (groupBy === 'date') {
      const dateOrder = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
      for (const label of dateOrder) {
        if (groups.has(label)) {
          result.push({ label, jobs: groups.get(label)! });
        }
      }
    } else if (groupBy === 'rating') {
      const ratingOrder = ['👍 Liked', 'Unrated', '👎 Disliked'];
      for (const label of ratingOrder) {
        if (groups.has(label)) {
          result.push({ label, jobs: groups.get(label)! });
        }
      }
    } else {
      const sortedKeys = Array.from(groups.keys()).sort();
      for (const key of sortedKeys) {
        result.push({ label: key, jobs: groups.get(key)! });
      }
    }

    return result;
  }, [filtered, groupBy]);

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
    <div className="mx-auto max-w-[1400px] p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Download Library</h1>
          <p className="text-sm text-secondary">
            {jobs.length} render{jobs.length !== 1 ? 's' : ''} · {likedCount} liked · {dislikedCount} disliked · {unratedCount} unrated
          </p>
        </div>
        <button
          onClick={() => refreshJobs()}
          className="rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-medium tracking-tight text-secondary transition hover:bg-overlay hover:border-border-emphasis"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 grid gap-3 md:grid-cols-5">
        <input
          className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
          placeholder="Search lyrics, style..."
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
        <select
          className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value as RatingFilter)}
        >
          <option value="all">All Ratings</option>
          <option value="liked">Liked ({likedCount})</option>
          <option value="disliked">Disliked ({dislikedCount})</option>
          <option value="unrated">Unrated ({unratedCount})</option>
        </select>
        <select
          className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
        >
          <option value="recent">Recent First</option>
          <option value="oldest">Oldest First</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="liked">Liked First</option>
          <option value="disliked">Disliked First</option>
        </select>
        <select
          className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
        >
          <option value="date">Group by Date</option>
          <option value="persona">Group by Persona</option>
          <option value="rating">Group by Rating</option>
          <option value="style">Group by Style</option>
          <option value="none">No Grouping</option>
        </select>
      </div>

      {/* Render list */}
      <div className="space-y-8">
        {groupedRenders.map((group, groupIndex) => {
          const isCollapsed = collapsedGroups.has(group.label);
          return (
          <div key={group.label || groupIndex}>
            {group.label && (
              <button
                onClick={() => toggleGroup(group.label)}
                className="mb-4 flex w-full items-center gap-3 text-left hover:opacity-80 transition"
              >
                <ChevronDownIcon
                  size={14}
                  className={`text-muted transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                />
                <p className="text-xs font-medium tracking-tight text-muted">{group.label}</p>
                <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] text-secondary">{group.jobs.length}</span>
                <div className="h-px flex-1 bg-border-default" />
              </button>
            )}

            {!isCollapsed && (
            <div className="flex flex-col gap-px bg-border-default border border-border-default">
              {group.jobs.map((job) => {
                const persona = personas.find((p) => p.id === job.personaId);
                const guideSampleName = persona?.guide_samples?.find((sample) => sample.id === job.guideSampleId)?.name;
                return (
                  <div key={job.id} className="bg-surface p-4 flex flex-col transition-colors hover:bg-elevated">
              {/* Header */}
              <div className="mb-2">
                {editingPersonaId === job.id ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedNewPersonaId || job.personaId}
                      onChange={(e) => setSelectedNewPersonaId(e.target.value)}
                      className="min-w-0 flex-1 truncate rounded border border-accent bg-canvas px-1.5 py-0.5 text-[10px] tracking-tight text-primary outline-none focus:ring-1 focus:ring-accent"
                    >
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const newId = selectedNewPersonaId;
                        if (newId) {
                          handleChangePersona(job.id, newId);
                        } else {
                          setEditingPersonaId(null);
                          setSelectedNewPersonaId(null);
                        }
                      }}
                      disabled={changingPersonaId === job.id}
                      className="shrink-0 rounded bg-accent px-2 py-0.5 text-[9px] font-medium text-canvas hover:bg-accent-hover disabled:opacity-50"
                    >
                      {changingPersonaId === job.id ? '...' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingPersonaId(null); setSelectedNewPersonaId(null); }}
                      className="shrink-0 rounded border border-border-default px-1.5 py-0.5 text-[9px] font-medium text-muted hover:text-primary"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <p
                    className="text-[10px] tracking-tight text-muted cursor-pointer hover:text-accent transition"
                    onClick={() => { setEditingPersonaId(job.id); setSelectedNewPersonaId(job.personaId); }}
                    title="Click to change persona"
                  >
                    {job.personaName}
                  </p>
                )}
                {editingId === job.id ? (
                  <input
                    type="text"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onBlur={() => handleRename(job.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                      if (e.key === 'Escape') { setEditingId(null); setEditingLabel(''); }
                    }}
                    autoFocus
                    className="w-full rounded border border-accent bg-canvas px-2 py-0.5 font-display text-base font-medium text-primary outline-none focus:ring-1 focus:ring-accent"
                  />
                ) : (
                  <h3
                    className="font-display text-base font-medium truncate cursor-pointer hover:text-accent transition"
                    onClick={() => { setEditingId(job.id); setEditingLabel(job.label || ''); }}
                    title="Click to rename"
                  >
                    {job.label || 'Untitled Session'}
                  </h3>
                )}
                <p className="text-[10px] text-muted">{new Date(job.created_at).toLocaleString()}</p>
              </div>

              {/* Lyrics preview */}
              <p className="mb-2 text-xs text-secondary line-clamp-2">{job.lyrics}</p>

              {/* Tags - compact */}
              <div className="mb-3 flex flex-wrap gap-1 text-[9px] text-muted">
                <span className="rounded-full border border-border-subtle bg-elevated px-2 py-0.5">{job.stylePrompt}</span>
                {job.effects.preset && (
                  <span className="rounded-full border border-border-subtle bg-elevated px-2 py-0.5">
                    {presetLabels[job.effects.preset] ?? job.effects.preset}
                  </span>
                )}
                <span className="rounded-full border border-border-subtle bg-elevated px-2 py-0.5">{job.effects.engine}</span>
                {job.accent && (
                  <span className="rounded-full border border-border-subtle bg-elevated px-2 py-0.5">{job.accent}</span>
                )}
                {guideSampleName && (
                  <span className="rounded-full border border-border-subtle bg-elevated px-2 py-0.5">{guideSampleName}</span>
                )}
              </div>

              {/* Audio Player */}
              <div className="mb-3">
                <AudioPlayer
                  src={job.audioUrl.startsWith('http') ? job.audioUrl : `${API_HOST}${job.audioUrl}`}
                  label={job.label || 'Untitled Session'}
                />
              </div>

              {/* Rating */}
              <div className="mb-3 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleRate(job, 'like')}
                  disabled={ratingBusyId === job.id}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    job.rating === 'like'
                      ? 'bg-accent/15 text-accent border border-accent/40'
                      : 'border border-border-default text-secondary hover:border-border-emphasis'
                  } disabled:opacity-40`}
                >
                  <ThumbUpIcon size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => handleRate(job, 'dislike')}
                  disabled={ratingBusyId === job.id}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    job.rating === 'dislike'
                      ? 'bg-error/15 text-error border border-error/40'
                      : 'border border-border-default text-secondary hover:border-border-emphasis'
                  } disabled:opacity-40`}
                >
                  <ThumbDownIcon size={10} />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setGuideBusyId(job.id);
                    try {
                      await onSaveAsGuide(job.personaId, job.id, job.label || job.personaName);
                      setGuideSavedIds((prev) => new Set(prev).add(job.id));
                    } finally {
                      setGuideBusyId(null);
                    }
                  }}
                  disabled={guideBusyId === job.id || guideSavedIds.has(job.id)}
                  className="rounded-full border border-border-default px-2 py-0.5 text-[10px] font-medium text-secondary transition hover:border-border-emphasis disabled:opacity-40"
                >
                  {guideSavedIds.has(job.id) ? 'Saved' : guideBusyId === job.id ? '...' : 'Use as Guide'}
                </button>
              </div>

              {/* Action buttons */}
              <div className="mt-auto flex gap-2">
                <a
                  href={`${job.audioUrl.startsWith('http') ? job.audioUrl : `${API_HOST}${job.audioUrl}`}`}
                  download
                  className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-center text-[10px] font-medium tracking-tight text-canvas transition hover:bg-accent-hover"
                >
                  Download
                </a>
                <button
                  onClick={() => onSelectJob(job)}
                  className="flex-1 rounded-lg border border-border-default bg-surface px-2 py-1.5 text-[10px] font-medium tracking-tight text-secondary transition hover:bg-overlay"
                >
                  Load
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
                  className="flex-1 rounded-lg border border-border-default px-2 py-1.5 text-[10px] font-medium tracking-tight text-secondary transition hover:bg-overlay disabled:opacity-50"
                >
                  {busyId === job.id ? '...' : 'Reprint'}
                </button>
              </div>
            </div>
          );
        })}
            </div>
            )}
          </div>
        );
        })}

        {filtered.length === 0 && jobs.length > 0 && (
          <div className="rounded-2xl border border-border-default bg-surface p-8 text-center text-secondary">
            No renders match your filters.{' '}
            <button
              onClick={() => { setSearch(''); setPersonaFilter('all'); setRatingFilter('all'); }}
              className="text-accent hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {jobs.length === 0 && (
          <div className="rounded-2xl border border-border-default bg-surface p-8 text-center">
            <FolderIcon size={32} className="mx-auto mb-3 text-muted" />
            <p className="text-secondary">No renders yet.</p>
            <p className="mt-1 text-xs text-muted">Create one in the Studio tab to populate your library.</p>
          </div>
        )}
      </div>
    </div>
  );
}
