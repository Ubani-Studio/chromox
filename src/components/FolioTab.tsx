import { useRef, useState, useMemo, DragEvent } from 'react';
import { API_HOST } from '../lib/api';
import { FolioClip } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { BookmarkIcon, TrashIcon, UploadIcon } from './Icons';

type SortOption = 'recent' | 'oldest' | 'az' | 'za';
type SourceFilter = 'all' | 'render' | 'upload' | 'guide' | 'duplicates';
type GroupBy = 'none' | 'persona' | 'source' | 'date';

interface ClipGroup {
  label: string;
  clips: FolioClip[];
}

type Props = {
  clips: FolioClip[];
  selectedClipId?: string;
  onSelectClip: (clipId: string) => void;
  onRemoveClip: (clipId: string) => Promise<void>;
  onRemoveGuideSample: (personaId: string, sampleId: string) => Promise<void>;
  onUploadClip: (file: File, name: string) => Promise<void>;
};

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function FolioTab({
  clips,
  selectedClipId,
  onSelectClip,
  onRemoveClip,
  onRemoveGuideSample,
  onUploadClip
}: Props) {
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('persona');

  const [isDragOver, setIsDragOver] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Detect duplicates by: 1) audio URL, 2) exact name, 3) duration, 4) similar name prefix
  const { duplicateIds, duplicateGroups } = useMemo(() => {
    const urlMap = new Map<string, FolioClip[]>();
    const nameMap = new Map<string, FolioClip[]>();
    const durationMap = new Map<string, FolioClip[]>();
    const prefixMap = new Map<string, FolioClip[]>();

    // Helper to extract base name (remove trailing numbers, "vox", "vocal", etc.)
    const getBaseName = (name: string) => {
      return name
        .toLowerCase()
        .trim()
        .replace(/\s*(vox|vocal|vocals|v\d+|\d+|copy|dup|duplicate|\(\d+\)|-\d+|_\d+)$/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    for (const clip of clips) {
      // Group by audio URL (normalized)
      if (clip.audioUrl) {
        const normalizedUrl = clip.audioUrl.replace(API_HOST, '').toLowerCase().trim();
        if (!urlMap.has(normalizedUrl)) {
          urlMap.set(normalizedUrl, []);
        }
        urlMap.get(normalizedUrl)!.push(clip);
      }

      // Group by exact normalized name
      const normalizedName = clip.name.toLowerCase().trim();
      if (!nameMap.has(normalizedName)) {
        nameMap.set(normalizedName, []);
      }
      nameMap.get(normalizedName)!.push(clip);

      // Group by duration (rounded to 0.1s for tolerance)
      if (clip.duration && clip.duration > 0) {
        const durationKey = Math.round(clip.duration * 10).toString();
        if (!durationMap.has(durationKey)) {
          durationMap.set(durationKey, []);
        }
        durationMap.get(durationKey)!.push(clip);
      }

      // Group by base name prefix (fuzzy matching)
      const baseName = getBaseName(clip.name);
      if (baseName.length >= 3) {
        if (!prefixMap.has(baseName)) {
          prefixMap.set(baseName, []);
        }
        prefixMap.get(baseName)!.push(clip);
      }
    }

    const dupIds = new Set<string>();
    const groups: { key: string; clips: FolioClip[] }[] = [];

    // URL matches = exact duplicates (same file)
    for (const [url, clipGroup] of urlMap) {
      if (clipGroup.length > 1) {
        groups.push({ key: `file: ${url.slice(-30)}`, clips: clipGroup });
        clipGroup.forEach(c => dupIds.add(c.id));
      }
    }

    // Exact name matches
    for (const [name, clipGroup] of nameMap) {
      if (clipGroup.length > 1) {
        const newDups = clipGroup.filter(c => !dupIds.has(c.id));
        if (newDups.length > 0 || clipGroup.some(c => dupIds.has(c.id))) {
          groups.push({ key: `name: ${name}`, clips: clipGroup });
          clipGroup.forEach(c => dupIds.add(c.id));
        }
      }
    }

    // Duration matches
    for (const [duration, clipGroup] of durationMap) {
      if (clipGroup.length > 1) {
        const newDups = clipGroup.filter(c => !dupIds.has(c.id));
        if (newDups.length > 1) {
          const durationSec = parseInt(duration) / 10;
          groups.push({ key: `duration: ${durationSec.toFixed(1)}s`, clips: clipGroup });
          clipGroup.forEach(c => dupIds.add(c.id));
        }
      }
    }

    // Similar name prefix matches (fuzzy)
    for (const [baseName, clipGroup] of prefixMap) {
      if (clipGroup.length > 1) {
        const newDups = clipGroup.filter(c => !dupIds.has(c.id));
        if (newDups.length > 1) {
          groups.push({ key: `similar: ${baseName}`, clips: clipGroup });
          clipGroup.forEach(c => dupIds.add(c.id));
        }
      }
    }

    return { duplicateIds: dupIds, duplicateGroups: groups };
  }, [clips]);

  // No more "similar name" distinction - all duplicates are treated the same
  const similarNameIds = new Set<string>();

  const filteredClips = useMemo(() => {
    let result = [...clips];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        clip =>
          clip.name.toLowerCase().includes(query) ||
          clip.sourcePersonaName?.toLowerCase().includes(query) ||
          clip.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (sourceFilter === 'duplicates') {
      result = result.filter(clip => duplicateIds.has(clip.id));
    } else if (sourceFilter === 'guide') {
      result = result.filter(clip => clip.id.startsWith('guide_'));
    } else if (sourceFilter !== 'all') {
      result = result.filter(clip => !clip.id.startsWith('guide_') && clip.source === sourceFilter);
    }

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
  }, [clips, searchQuery, sortBy, sourceFilter, duplicateIds]);

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

  const guideCount = clips.filter(c => c.id.startsWith('guide_')).length;
  const renderCount = clips.filter(c => !c.id.startsWith('guide_') && c.source === 'render').length;
  const uploadCount = clips.filter(c => !c.id.startsWith('guide_') && c.source === 'upload').length;
  const duplicateCount = duplicateIds.size;

  function toggleSelection(clipId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(clipId)) {
        next.delete(clipId);
      } else {
        next.add(clipId);
      }
      return next;
    });
  }

  function selectAllDuplicates() {
    // Select all duplicates (including guides for visibility, delete will skip guides)
    const toSelect = new Set<string>();
    for (const group of duplicateGroups) {
      const sorted = [...group.clips].sort(
        (a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
      );
      // Skip first (oldest), select rest for deletion
      sorted.slice(1).forEach(c => toSelect.add(c.id));
    }
    setSelectedIds(toSelect);
  }

  // All selected items can now be deleted (including guides)
  const deletableCount = selectedIds.size;
  const guideSelectedCount = Array.from(selectedIds).filter(id => id.startsWith('guide_')).length;

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      for (const id of selectedIds) {
        if (id.startsWith('guide_')) {
          // Parse guide sample ID: guide_{personaId}_{sampleId}
          const parts = id.split('_');
          if (parts.length >= 3) {
            const personaId = parts[1];
            const sampleId = parts.slice(2).join('_');
            await onRemoveGuideSample(personaId, sampleId);
          }
        } else {
          await onRemoveClip(id);
        }
      }
      setSelectedIds(new Set());
      setSelectionMode(false);
    } finally {
      setBulkDeleting(false);
    }
  }

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
    <div className="mx-auto max-w-[1400px] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Folio Collection</h1>
          <p className="text-sm text-secondary">
            {clips.length} clip{clips.length !== 1 ? 's' : ''} · {guideCount} guides · {renderCount} renders · {uploadCount} uploads
            {duplicateCount > 0 && (
              <span className="text-error font-medium"> · {duplicateCount} exact duplicates</span>
            )}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {!selectionMode && (
            <>
              <button
                onClick={() => {
                  setSelectionMode(true);
                  if (duplicateCount > 0) {
                    selectAllDuplicates();
                  }
                }}
                disabled={duplicateCount === 0}
                className={`rounded-lg border-2 px-4 py-2 text-sm font-medium transition ${
                  duplicateCount > 0
                    ? 'border-error/50 bg-error/10 text-error hover:bg-error/20'
                    : 'border-border-default bg-surface text-muted cursor-not-allowed'
                }`}
              >
                {duplicateCount > 0 ? `Select Duplicates (${duplicateCount})` : 'No Duplicates'}
              </button>
              <button
                onClick={() => setSelectionMode(true)}
                className="rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary transition hover:bg-overlay"
              >
                Manual Select
              </button>
            </>
          )}

          {selectionMode && (
            <>
              <span className="text-sm text-muted">
                {selectedIds.size} selected
              </span>
              {duplicateCount > 0 && (
                <button
                  onClick={selectAllDuplicates}
                  className="rounded-lg border border-error/40 bg-error/10 px-4 py-2 text-sm font-medium text-error transition hover:bg-error/20"
                >
                  Select Duplicates
                </button>
              )}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deletableCount === 0 || bulkDeleting}
                className="rounded-lg bg-error px-4 py-2 text-sm font-medium text-canvas transition hover:bg-error/80 disabled:opacity-50"
              >
                {bulkDeleting ? 'Deleting...' : `Delete (${deletableCount})`}
              </button>
              <button
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedIds(new Set());
                }}
                className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-secondary transition hover:bg-overlay"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Upload zone */}
      <div
        className="mb-6"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!pendingFile ? (
          <div
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed p-8 transition ${
              isDragOver
                ? 'border-accent bg-accent/5'
                : 'border-border-default hover:border-border-emphasis hover:bg-surface'
            }`}
          >
            <div className="text-center">
              <UploadIcon size={24} className="mx-auto mb-2 text-muted" />
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

      {/* Filters */}
      <div className="mb-6 grid gap-3 md:grid-cols-4">
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
          {duplicateCount > 0 && (
            <option value="duplicates">⚠ Duplicates ({duplicateCount})</option>
          )}
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

      {/* Clip list */}
      <div className="space-y-8">
        {groupedClips.map((group, groupIndex) => (
          <div key={group.label || groupIndex}>
            {group.label && (
              <div className="mb-4 flex items-center gap-3">
                <p className="text-xs font-medium tracking-tight text-muted">{group.label}</p>
                <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] text-secondary">{group.clips.length}</span>
                <div className="h-px flex-1 bg-border-default" />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.clips.map((clip) => {
                const isSelectedAsGuide = selectedClipId === clip.id;
                const isGuide = clip.id.startsWith('guide_');
                const isDuplicate = duplicateIds.has(clip.id);
                const isChecked = selectedIds.has(clip.id);
                return (
                  <div
                    key={clip.id}
                    onClick={selectionMode ? () => toggleSelection(clip.id) : undefined}
                    className={`rounded-2xl border-2 p-4 transition ${
                      selectionMode ? 'cursor-pointer' : ''
                    } ${
                      isChecked
                        ? 'border-error bg-error/10'
                        : isDuplicate
                          ? 'border-error/60 bg-error/5'
                          : isSelectedAsGuide
                            ? 'border-accent bg-accent/5'
                            : 'border-border-default bg-surface hover:border-border-emphasis'
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs tracking-tight text-muted">
                            {clip.sourcePersonaName || (isGuide ? 'Guide' : clip.source === 'render' ? 'Render' : 'Upload')}
                          </p>
                          {isDuplicate && (
                            <span className="rounded-full bg-error/20 px-2 py-0.5 text-[10px] font-semibold tracking-tight text-error">
                              Duplicate
                            </span>
                          )}
                        </div>
                        <h3 className="font-display text-lg font-medium truncate">{clip.name}</h3>
                        <p className="text-xs text-muted">{new Date(clip.added_at).toLocaleString()}</p>
                      </div>
                      {selectionMode && (
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                            isChecked
                              ? 'border-error bg-error text-canvas'
                              : 'border-border-default bg-surface'
                          }`}
                        >
                          {isChecked && (
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-muted">
                      <span className={`rounded-full border px-2 py-0.5 ${
                        isGuide
                          ? 'border-[#66023C]/40 bg-[#66023C]/15 text-[#9B4D7B]'
                          : 'border-border-subtle bg-elevated'
                      }`}>
                        {isGuide ? 'Guide Sample' : clip.source === 'render' ? 'Render' : 'Upload'}
                      </span>
                      {clip.duration && (
                        <span className="rounded-full border border-border-subtle bg-elevated px-2 py-0.5">
                          {formatDuration(clip.duration)}
                        </span>
                      )}
                    </div>

                    <div className="mb-3">
                      <AudioPlayer
                        src={clip.audioUrl.startsWith('http') ? clip.audioUrl : `${API_HOST}${clip.audioUrl}`}
                        label={clip.name}
                      />
                    </div>

                    {!selectionMode && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => onSelectClip(clip.id)}
                          className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium tracking-tight transition ${
                            isSelectedAsGuide
                              ? 'bg-accent text-canvas'
                              : 'border border-border-default bg-surface text-secondary hover:bg-overlay'
                          }`}
                        >
                          {isSelectedAsGuide ? 'Selected' : 'Use as Guide'}
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
                            className="rounded-lg border border-border-default px-3 py-2 text-xs text-muted transition hover:border-error/40 hover:text-error disabled:opacity-50"
                          >
                            <TrashIcon size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredClips.length === 0 && clips.length > 0 && (
          <div className="rounded-2xl border border-border-default bg-surface p-8 text-center text-secondary">
            No clips match your filters.{' '}
            <button onClick={() => { setSearchQuery(''); setSourceFilter('all'); }} className="text-accent hover:underline">
              Clear filters
            </button>
          </div>
        )}

        {clips.length === 0 && (
          <div className="rounded-2xl border border-border-default bg-surface p-8 text-center">
            <BookmarkIcon size={32} className="mx-auto mb-3 text-muted" />
            <p className="text-secondary">Your folio is empty.</p>
            <p className="mt-1 text-xs text-muted">Drop audio files above or save renders from the Downloads tab.</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-border-default bg-surface p-6">
            <h3 className="font-display text-lg font-semibold text-error">Confirm Delete</h3>
            <p className="mt-2 text-sm text-secondary">
              Are you sure you want to delete {deletableCount} clip{deletableCount !== 1 ? 's' : ''}? This cannot be undone.
            </p>
            <div className="mt-4 max-h-40 overflow-y-auto rounded-xl bg-elevated p-3">
              <p className="mb-2 text-xs font-medium tracking-tight text-muted">Files to delete:</p>
              <ul className="space-y-1 text-sm text-primary">
                {Array.from(selectedIds).map(id => {
                  const clip = clips.find(c => c.id === id);
                  return clip ? <li key={id} className="truncate">• {clip.name}</li> : null;
                })}
              </ul>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-secondary transition hover:bg-overlay"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowDeleteConfirm(false);
                  await handleBulkDelete();
                }}
                disabled={bulkDeleting}
                className="flex-1 rounded-lg bg-error px-4 py-2 text-sm font-medium text-canvas transition hover:bg-error/80 disabled:opacity-50"
              >
                {bulkDeleting ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
