import { Dialog } from '@headlessui/react';
import { useRef, useState, useMemo, DragEvent } from 'react';
import { API_HOST } from '../lib/api';
import { FolioClip } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { BookmarkIcon, TrashIcon, UploadIcon } from './Icons';

type SortOption = 'recent' | 'oldest' | 'az' | 'za';
type SourceFilter = 'all' | 'render' | 'upload' | 'guide';
type GroupBy = 'none' | 'persona' | 'source' | 'date';

interface ClipGroup {
  label: string;
  clips: FolioClip[];
}

type Props = {
  open: boolean;
  onClose: () => void;
  clips: FolioClip[];
  selectedClipId?: string;
  onSelectClip: (clipId: string) => void;
  onRemoveClip: (clipId: string) => Promise<void>;
  onUploadClip: (file: File, name: string) => Promise<void>;
};

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function FolioDrawer({
  open,
  onClose,
  clips,
  selectedClipId,
  onSelectClip,
  onRemoveClip,
  onUploadClip
}: Props) {
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Search, sort, filter, group state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('persona');

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);

  // Filter and sort clips
  const filteredClips = useMemo(() => {
    let result = [...clips];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        clip =>
          clip.name.toLowerCase().includes(query) ||
          clip.sourcePersonaName?.toLowerCase().includes(query) ||
          clip.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Apply source filter
    if (sourceFilter === 'guide') {
      result = result.filter(clip => clip.id.startsWith('guide_'));
    } else if (sourceFilter !== 'all') {
      result = result.filter(clip => !clip.id.startsWith('guide_') && clip.source === sourceFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
        case 'oldest':
          return new Date(a.added_at).getTime() - new Date(b.added_at).getTime();
        case 'az':
          return a.name.localeCompare(b.name);
        case 'za':
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

    return result;
  }, [clips, searchQuery, sortBy, sourceFilter]);

  // Group clips
  const groupedClips = useMemo((): ClipGroup[] => {
    if (groupBy === 'none') {
      return [{ label: '', clips: filteredClips }];
    }

    const groups = new Map<string, FolioClip[]>();

    for (const clip of filteredClips) {
      let key: string;

      switch (groupBy) {
        case 'persona':
          key = clip.sourcePersonaName || 'Uploaded';
          break;
        case 'source':
          if (clip.id.startsWith('guide_')) {
            key = 'Guide Samples';
          } else if (clip.source === 'render') {
            key = 'Renders';
          } else {
            key = 'Uploads';
          }
          break;
        case 'date':
          const date = new Date(clip.added_at);
          const now = new Date();
          const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays === 0) key = 'Today';
          else if (diffDays === 1) key = 'Yesterday';
          else if (diffDays < 7) key = 'This Week';
          else if (diffDays < 30) key = 'This Month';
          else key = 'Older';
          break;
        default:
          key = 'All';
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(clip);
    }

    // Convert to array and sort groups
    const result: ClipGroup[] = [];

    if (groupBy === 'date') {
      const dateOrder = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
      for (const label of dateOrder) {
        if (groups.has(label)) {
          result.push({ label, clips: groups.get(label)! });
        }
      }
    } else if (groupBy === 'source') {
      const sourceOrder = ['Guide Samples', 'Renders', 'Uploads'];
      for (const label of sourceOrder) {
        if (groups.has(label)) {
          result.push({ label, clips: groups.get(label)! });
        }
      }
    } else {
      const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
        if (a === 'Uploaded') return 1;
        if (b === 'Uploaded') return -1;
        return a.localeCompare(b);
      });
      for (const key of sortedKeys) {
        result.push({ label: key, clips: groups.get(key)! });
      }
    }

    return result;
  }, [filteredClips, groupBy]);

  // Count by source
  const guideCount = clips.filter(c => c.id.startsWith('guide_')).length;
  const renderCount = clips.filter(c => !c.id.startsWith('guide_') && c.source === 'render').length;
  const uploadCount = clips.filter(c => !c.id.startsWith('guide_') && c.source === 'upload').length;

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    try {
      await onUploadClip(pendingFile, uploadName || pendingFile.name);
      setPendingFile(null);
      setUploadName('');
      if (fileRef.current) fileRef.current.value = '';
    } finally {
      setUploading(false);
    }
  }

  function handleUseAndClose(clipId: string) {
    onSelectClip(clipId);
    onClose();
  }

  // Drag and drop handlers
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('audio/')) {
        setPendingFile(file);
        setUploadName(file.name.replace(/\.[^.]+$/, ''));
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 flex w-full max-w-3xl flex-col border-l border-border-default bg-canvas p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Dialog.Title className="font-display text-2xl font-semibold">Folio Collection</Dialog.Title>
            <p className="text-sm text-secondary">
              {clips.length} clip{clips.length !== 1 ? 's' : ''} · {guideCount} guides · {renderCount} renders · {uploadCount} uploads
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-muted transition hover:text-primary">
            Close
          </button>
        </div>

        {/* Upload zone */}
        <div
          className={`mb-4 transition ${isDragOver ? 'opacity-100' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {!pendingFile ? (
            <div
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed p-6 transition ${
                isDragOver
                  ? 'border-accent bg-accent/5'
                  : 'border-border-default hover:border-border-emphasis hover:bg-surface'
              }`}
            >
              <div className="text-center">
                <UploadIcon size={20} className="mx-auto mb-2 text-muted" />
                <p className="text-sm text-secondary">
                  Drop audio here or <span className="text-accent">browse</span>
                </p>
                <p className="mt-1 text-[11px] text-muted">MP3, WAV, M4A, OGG</p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border-default bg-surface p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 truncate text-sm text-primary">{pendingFile.name}</div>
                <input
                  className="w-40 rounded-xl border border-border-default bg-canvas px-3 py-2 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
                  placeholder="Clip name"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                />
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="rounded-lg bg-accent px-4 py-2 text-xs font-medium tracking-tight text-canvas transition hover:bg-accent-hover disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Add'}
                </button>
                <button
                  onClick={() => {
                    setPendingFile(null);
                    setUploadName('');
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  className="text-sm text-muted hover:text-error"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setPendingFile(file);
                if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ''));
              }
            }}
          />
        </div>

        {/* Filters row */}
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <input
            className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
            placeholder="Search clips, personas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
          >
            <option value="all">All Sources</option>
            <option value="guide">Guides ({guideCount})</option>
            <option value="render">Renders ({renderCount})</option>
            <option value="upload">Uploads ({uploadCount})</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
          >
            <option value="recent">Recent First</option>
            <option value="oldest">Oldest First</option>
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
          </select>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
          >
            <option value="persona">Group by Persona</option>
            <option value="source">Group by Source</option>
            <option value="date">Group by Date</option>
            <option value="none">No Grouping</option>
          </select>
        </div>

        {/* Active filters */}
        {(searchQuery || sourceFilter !== 'all') && (
          <div className="mb-4 flex items-center gap-2 text-[11px] text-muted">
            <span>Showing {filteredClips.length} of {clips.length} clips</span>
            <button
              onClick={() => {
                setSearchQuery('');
                setSourceFilter('all');
              }}
              className="text-accent hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Clip list */}
        <div className="flex-1 space-y-6 overflow-y-auto">
          {groupedClips.map((group, groupIndex) => (
            <div key={group.label || groupIndex}>
              {/* Group header */}
              {group.label && (
                <div className="mb-3 flex items-center gap-3">
                  <p className="text-xs font-medium tracking-tight text-muted">{group.label}</p>
                  <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] text-secondary">{group.clips.length}</span>
                  <div className="h-px flex-1 bg-border-default" />
                </div>
              )}

              {/* Clips */}
              <div className="space-y-3">
                {group.clips.map((clip) => {
                  const isSelected = selectedClipId === clip.id;
                  const isGuide = clip.id.startsWith('guide_');
                  return (
                    <div
                      key={clip.id}
                      className={`rounded-2xl border p-4 transition ${
                        isSelected
                          ? 'border-accent bg-accent/5'
                          : 'border-border-default bg-surface'
                      }`}
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs tracking-tight text-muted">
                            {clip.sourcePersonaName || (isGuide ? 'Guide' : clip.source === 'render' ? 'Render' : 'Upload')}
                          </p>
                          <h3 className="font-display text-lg font-medium">{clip.name}</h3>
                          <p className="text-xs text-muted">{new Date(clip.added_at).toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUseAndClose(clip.id)}
                            className={`rounded-lg px-4 py-2 text-xs font-medium tracking-tight transition ${
                              isSelected
                                ? 'bg-accent text-canvas'
                                : 'border border-border-default bg-surface text-secondary hover:bg-overlay hover:border-border-emphasis'
                            }`}
                          >
                            {isSelected ? 'Selected' : 'Use as Guide'}
                          </button>
                          {!isGuide && (
                            <button
                              onClick={async () => {
                                setRemovingId(clip.id);
                                try {
                                  await onRemoveClip(clip.id);
                                } finally {
                                  setRemovingId(null);
                                }
                              }}
                              disabled={removingId === clip.id}
                              className="rounded-lg border border-border-default px-4 py-2 text-xs font-medium tracking-tight text-secondary transition hover:border-error/40 hover:text-error disabled:opacity-50"
                            >
                              <TrashIcon size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted">
                        <span className="rounded-full border border-border-subtle bg-elevated px-3 py-1">
                          Type: <span className="text-secondary">{isGuide ? 'Guide Sample' : clip.source === 'render' ? 'Render' : 'Upload'}</span>
                        </span>
                        {clip.duration && (
                          <span className="rounded-full border border-border-subtle bg-elevated px-3 py-1">
                            Duration: <span className="text-secondary">{formatDuration(clip.duration)}</span>
                          </span>
                        )}
                        {clip.tags && clip.tags.filter(t => t !== 'guide-sample').length > 0 && (
                          clip.tags.filter(t => t !== 'guide-sample').map((tag) => (
                            <span
                              key={tag}
                              onClick={() => setSearchQuery(tag)}
                              className="cursor-pointer rounded-full border border-border-subtle bg-elevated px-3 py-1 transition hover:border-accent hover:text-accent"
                            >
                              {tag}
                            </span>
                          ))
                        )}
                      </div>

                      {/* Audio player */}
                      <div className="mt-3">
                        <AudioPlayer
                          src={clip.audioUrl.startsWith('http') ? clip.audioUrl : `${API_HOST}${clip.audioUrl}`}
                          label={clip.name}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredClips.length === 0 && clips.length > 0 && (
            <div className="rounded-2xl border border-border-default bg-surface p-6 text-center text-secondary">
              No clips match your filters.{' '}
              <button onClick={() => { setSearchQuery(''); setSourceFilter('all'); }} className="text-accent hover:underline">
                Clear filters
              </button>
            </div>
          )}

          {clips.length === 0 && (
            <div className="rounded-2xl border border-border-default bg-surface p-6 text-center text-secondary">
              <BookmarkIcon size={24} className="mx-auto mb-2 text-muted" />
              <p>Your folio is empty.</p>
              <p className="mt-1 text-xs text-muted">Drop audio files above or save renders from the Download Library.</p>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
