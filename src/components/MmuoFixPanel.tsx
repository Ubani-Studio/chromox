import { useEffect, useRef, useState } from 'react';

/**
 * Mmuo Fix Panel - one-click vocal regeneration for Suno persona tracks.
 *
 * Simplified flow (two inputs):
 *   1. Paste the Suno song URL. Backend resolves the persona_id + seed
 *      automatically via /suno-lookup.
 *   2. Optionally upload an acapella. If omitted, the panel downloads
 *      the audio directly from Suno via /download-suno.
 *   3. UI transcribes the audio, shows every word clickable.
 *   4. Click a word (+ shift-click another) to mark the fix window.
 *   5. Type what the new lyric should say.
 *   6. Hit Fix. Backend regenerates that section in the same persona
 *      voice at the same cadence, crossfade-splices back into the
 *      original, streams back a download-able fixed song.
 *
 * Dev ports:
 *   Frontend  http://localhost:5170
 *   Backend   http://localhost:4414
 */

const API = 'http://localhost:4414';

interface Word {
  word: string;
  start: number;
  end: number;
}

interface SunoLookup {
  trackId: string;
  personaId: string | null;
  seed: number | null;
  voiceModel: string | null;
  audioUrl: string | null;
  duration: number | null;
  tempo: number | null;
  error?: string;
}

interface FixResponse {
  sectionPath: string;
  fixedPath: string | null;
  audioPath: string;
  newLyrics?: Array<{ beat: number; word: string; syllables: number }>;
  rawText?: string;
  inSpec?: boolean;
  error?: string;
}

export default function MmuoFixPanel() {
  const [sunoUrl, setSunoUrl] = useState('');
  const [acapella, setAcapella] = useState<File | null>(null);
  const [lookup, setLookup] = useState<SunoLookup | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [promptText, setPromptText] = useState('');
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FixResponse | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function resolveAndLoad() {
    if (!sunoUrl.trim()) {
      setError('Paste a Suno song URL first.');
      return;
    }
    setWorking(true);
    setError(null);
    setWords([]);
    setSelStart(null);
    setSelEnd(null);
    setResult(null);

    try {
      // 1. Resolve the Suno URL → persona id / seed / track id
      setStage('Resolving Suno track…');
      const lu = await fetch(`${API}/api/vocal-regen/suno-lookup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: sunoUrl.trim() }),
      });
      const luData = (await lu.json()) as SunoLookup;
      if (!lu.ok || luData.error) throw new Error(luData.error || 'lookup failed');
      setLookup(luData);

      // 2. Get the audio to work with. Prefer the uploaded acapella;
      //    fall back to pulling from Suno directly.
      let workingPath: string;
      if (acapella) {
        setStage('Uploading acapella…');
        const fd = new FormData();
        fd.append('file', acapella);
        const up = await fetch(`${API}/api/personas/upload`, { method: 'POST', body: fd });
        const upData = (await up.json()) as { path?: string; error?: string };
        if (!up.ok || !upData.path) throw new Error(upData.error || 'upload failed');
        workingPath = upData.path;
      } else {
        setStage('Downloading from Suno…');
        const dl = await fetch(`${API}/api/vocal-regen/download-suno`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: sunoUrl.trim() }),
        });
        const dlData = (await dl.json()) as { audioPath?: string; error?: string };
        if (!dl.ok || !dlData.audioPath) throw new Error(dlData.error || 'download failed');
        workingPath = dlData.audioPath;
      }
      setAudioPath(workingPath);

      // 3. Transcribe → word-level timing
      setStage('Transcribing…');
      const tr = await fetch(`${API}/api/vocal-regen/transcribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceAudioPath: workingPath }),
      });
      const trData = (await tr.json()) as { words?: Word[]; error?: string };
      if (!tr.ok || !trData.words) throw new Error(trData.error || 'transcribe failed');
      setWords(trData.words);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setWorking(false);
      setStage('');
    }
  }

  const originalLyrics =
    selStart != null && selEnd != null
      ? words.slice(selStart, selEnd + 1).map((w) => w.word).join(' ')
      : '';

  async function runFix() {
    if (!lookup?.voiceModel || !audioPath || selStart == null || selEnd == null || !promptText.trim()) {
      setError('Select words and type the new lyric.');
      return;
    }
    setWorking(true);
    setError(null);
    setResult(null);
    setStage('Rewriting lyrics + regenerating…');
    try {
      const r = await fetch(`${API}/api/vocal-regen/fix-section`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          personaVoiceModel: lookup.voiceModel,
          sourceTrackId: lookup.trackId,
          sourceAudioPath: audioPath,
          startSec: words[selStart].start,
          endSec: words[selEnd].end,
          prompt: promptText.trim(),
          originalLyrics,
          bpm: lookup.tempo || undefined,
          preserveRhyme: true,
        }),
      });
      const data = (await r.json()) as FixResponse;
      if (!r.ok || data.error) throw new Error(data.error || 'fix failed');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fix failed');
    } finally {
      setWorking(false);
      setStage('');
    }
  }

  function handleWordClick(idx: number, e: React.MouseEvent) {
    if (e.shiftKey && selStart != null) {
      if (idx < selStart) {
        setSelEnd(selStart);
        setSelStart(idx);
      } else {
        setSelEnd(idx);
      }
    } else {
      setSelStart(idx);
      setSelEnd(idx);
    }
  }

  const hasSelection = selStart != null && selEnd != null;
  const audioUrl = result?.fixedPath || result?.audioPath
    ? `${API}/api/vocal-regen/audio?path=${encodeURIComponent(result.fixedPath || result.audioPath)}`
    : null;

  return (
    <div className="p-6 bg-canvas border border-border-default space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display text-3xl text-primary tracking-tight">Fix a lyric</h2>
        <p className="text-xs text-muted mt-2 max-w-xl leading-relaxed">
          Paste the Suno song link, optionally drop an acapella, click the
          words you want to fix, type what they should say. Same voice,
          same cadence, new words.
        </p>
      </div>

      {/* Step 1: Suno URL + acapella upload */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs tracking-tight text-muted mb-1">
            Suno song link
          </label>
          <input
            value={sunoUrl}
            onChange={(e) => setSunoUrl(e.target.value)}
            placeholder="https://suno.com/song/…"
            className="w-full bg-canvas border border-border-default text-primary px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs tracking-tight text-muted mb-1">
            Acapella <span className="text-disabled">(optional — drops from Suno if omitted)</span>
          </label>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setAcapella(e.target.files?.[0] || null)}
            className="text-sm text-secondary file:mr-3 file:px-3 file:py-1.5 file:border file:border-border-default file:bg-canvas file:text-secondary file:cursor-pointer file:hover:border-accent"
          />
          {acapella && <div className="text-xs text-muted mt-1">{acapella.name}</div>}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={resolveAndLoad}
            disabled={working || !sunoUrl.trim()}
            className="px-4 py-2 border border-accent/60 text-accent tracking-tight text-sm hover:bg-accent-subtle disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {working && !words.length ? stage || 'Loading…' : 'Load'}
          </button>
          {lookup && (
            <div className="text-xs text-muted tracking-tight">
              {lookup.personaId ? (
                <>
                  Persona <span className="font-mono text-secondary">{lookup.personaId.slice(0, 10)}…</span>
                  {lookup.tempo ? ` · ${lookup.tempo} BPM` : ''}
                </>
              ) : (
                <span className="text-warning">No persona returned (Suno API key missing or track private)</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Step 2: word-level transcript, click to select */}
      {words.length > 0 && (
        <div className="space-y-2 border-t border-border-default pt-6">
          <div className="flex items-baseline justify-between">
            <div className="text-xs tracking-tight text-muted">
              Click a word, shift-click another to mark the fix window.
            </div>
            {hasSelection && (
              <div className="text-xs text-accent font-mono">
                {words[selStart!].start.toFixed(2)}s → {words[selEnd!].end.toFixed(2)}s
              </div>
            )}
          </div>
          <div className="border border-border-default p-4 leading-loose bg-surface">
            {words.map((w, i) => {
              const inSel =
                selStart != null && selEnd != null && i >= selStart && i <= selEnd;
              return (
                <span
                  key={i}
                  onClick={(e) => handleWordClick(i, e)}
                  className={`cursor-pointer px-1 transition-colors ${
                    inSel
                      ? 'bg-accent-subtle text-primary'
                      : 'text-secondary hover:bg-elevated'
                  }`}
                >
                  {w.word}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: what it should say */}
      {hasSelection && (
        <div>
          <label className="block text-xs tracking-tight text-muted mb-1">
            Should say
          </label>
          <div className="text-xs text-disabled mb-2 italic">
            Original: &ldquo;{originalLyrics}&rdquo;
          </div>
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Write what the persona should sing instead…"
            rows={3}
            className="w-full bg-canvas border border-border-default text-primary px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
        </div>
      )}

      {/* Action */}
      {words.length > 0 && (
        <div className="flex items-center gap-4">
          <button
            onClick={runFix}
            disabled={working || !hasSelection || !promptText.trim()}
            className="px-6 py-2 border border-accent/60 text-accent tracking-tight text-sm hover:bg-accent-subtle disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {working ? stage || 'Working…' : 'Fix lyric'}
          </button>
          {error && <div className="text-xs text-error">{error}</div>}
          {stage && !error && <div className="text-xs text-muted">{stage}</div>}
        </div>
      )}

      {error && !words.length && <div className="text-xs text-error">{error}</div>}

      {/* Result */}
      {result && audioUrl && (
        <div className="border-t border-border-default pt-6 space-y-3">
          <div className="text-xs tracking-tight text-muted">
            Fixed {result.fixedPath ? '— full song, crossfaded' : '— section only'}
          </div>
          {result.rawText && (
            <div className="text-sm text-secondary italic">
              &ldquo;{result.rawText}&rdquo;
              {result.inSpec === false && (
                <span className="ml-2 text-warning text-xs">(meter drift)</span>
              )}
            </div>
          )}
          <audio ref={audioRef} controls src={audioUrl} className="w-full" />
          <a
            href={audioUrl}
            download
            className="inline-block text-xs tracking-tight text-secondary hover:text-accent border-b border-border-default hover:border-accent pb-0.5 transition-colors"
          >
            Download
          </a>
        </div>
      )}
    </div>
  );
}
