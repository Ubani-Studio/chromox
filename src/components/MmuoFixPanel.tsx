import { useEffect, useRef, useState } from 'react';

/**
 * Mmuo Fix Panel — one-click vocal regeneration for Suno persona tracks.
 *
 * Flow:
 *   1. Drop the song file + paste persona id (+ optional Suno seed)
 *   2. Backend transcribes; UI shows clickable words
 *   3. User clicks a word, then shift-clicks another → defines the fix window
 *   4. User types what the new lyric should be
 *   5. Hit "Fix" → backend regenerates that section in the same persona
 *      voice at the same cadence, crossfade-splices back into the full
 *      song, streams back a fresh fully-fixed file
 *
 * No ffmpeg, no timestamps, no manual splicing. One panel.
 *
 * Dev ports (Mmuo sits at 5170 to stay clear of Slayt on 5174 and
 * Tizita on 5180):
 *   Frontend:  http://localhost:5170
 *   Backend:   http://localhost:4414
 */

const API = 'http://localhost:4414';

interface Word {
  word: string;
  start: number;
  end: number;
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
  const [file, setFile] = useState<File | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [personaVoiceModel, setPersonaVoiceModel] = useState('');
  const [sourceTrackId, setSourceTrackId] = useState('');
  const [bpm, setBpm] = useState<number | ''>('');
  const [words, setWords] = useState<Word[]>([]);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [promptText, setPromptText] = useState('');
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FixResponse | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Upload + transcribe on file change
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      setWorking(true);
      setStage('Uploading…');
      setError(null);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const up = await fetch(`${API}/api/personas/upload`, { method: 'POST', body: fd });
        const upData = (await up.json()) as { path?: string; error?: string };
        if (!up.ok || !upData.path) throw new Error(upData.error || 'upload failed');
        if (cancelled) return;
        setUploadedPath(upData.path);

        setStage('Transcribing…');
        const tr = await fetch(`${API}/api/vocal-regen/transcribe`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sourceAudioPath: upData.path }),
        });
        const trData = (await tr.json()) as { words?: Word[]; error?: string };
        if (!tr.ok || !trData.words) throw new Error(trData.error || 'transcribe failed');
        if (cancelled) return;
        setWords(trData.words);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'failed');
      } finally {
        setWorking(false);
        setStage('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const selStartSec = selStart != null ? words[selStart]?.start ?? null : null;
  const selEndSec = selEnd != null ? words[selEnd]?.end ?? null : null;
  const originalLyrics =
    selStart != null && selEnd != null
      ? words.slice(selStart, selEnd + 1).map((w) => w.word).join(' ')
      : '';

  async function runFix() {
    if (
      !uploadedPath ||
      !personaVoiceModel ||
      !sourceTrackId ||
      selStart == null ||
      selEnd == null ||
      !promptText.trim()
    ) {
      setError('Pick a word range + fill persona id + source track id + what to change.');
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
          personaVoiceModel,
          sourceTrackId,
          sourceAudioPath: uploadedPath,
          startSec: words[selStart].start,
          endSec: words[selEnd].end,
          prompt: promptText.trim(),
          originalLyrics,
          bpm: bpm || undefined,
          preserveRhyme: true,
        }),
      });
      const data = (await r.json()) as FixResponse;
      if (!r.ok || data.error) throw new Error(data.error || 'fix failed');
      setResult(data);
      setStage('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fix failed');
    } finally {
      setWorking(false);
    }
  }

  function handleWordClick(idx: number, e: React.MouseEvent) {
    if (e.shiftKey && selStart != null) {
      setSelEnd(idx >= selStart ? idx : selStart);
      if (idx < selStart) {
        setSelStart(idx);
        setSelEnd(selStart);
      }
    } else {
      setSelStart(idx);
      setSelEnd(idx);
    }
  }

  const hasSelection = selStart != null && selEnd != null;
  const audioUrl = result?.audioPath
    ? `${API}/api/vocal-regen/audio?path=${encodeURIComponent(result.fixedPath || result.audioPath)}`
    : null;

  return (
    <div className="p-6 bg-black border border-neutral-900 space-y-6 max-w-4xl">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-600 mb-1">Mmuo</div>
        <h2 className="font-serif text-3xl text-white tracking-tight">Fix a lyric</h2>
        <p className="text-xs text-neutral-600 mt-2 max-w-xl leading-relaxed">
          Drop the Suno song, click the words you want to fix, type what they should be.
          Same voice, same cadence, new words — the full song comes back fixed.
        </p>
      </div>

      {/* Persona id + track id + bpm (one-time per song) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-widest text-neutral-600 mb-1">
            Persona voice model
          </label>
          <input
            value={personaVoiceModel}
            onChange={(e) => setPersonaVoiceModel(e.target.value)}
            placeholder="persona_id:abc123|seed:42"
            className="w-full bg-black border border-neutral-900 text-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-pink-700"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-neutral-600 mb-1">
            Suno track id
          </label>
          <input
            value={sourceTrackId}
            onChange={(e) => setSourceTrackId(e.target.value)}
            placeholder="e.g. 7f3b2a…"
            className="w-full bg-black border border-neutral-900 text-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-pink-700"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-neutral-600 mb-1">
            BPM <span className="text-neutral-700 normal-case">(optional)</span>
          </label>
          <input
            type="number"
            value={bpm}
            onChange={(e) => setBpm(e.target.value ? Number(e.target.value) : '')}
            placeholder="128"
            className="w-full bg-black border border-neutral-900 text-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-pink-700"
          />
        </div>
      </div>

      {/* Dropzone */}
      <div>
        <label className="block text-xs uppercase tracking-widest text-neutral-600 mb-2">
          Song file
        </label>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-sm text-neutral-400 file:mr-3 file:px-3 file:py-1.5 file:border file:border-neutral-800 file:bg-black file:text-neutral-300 file:cursor-pointer file:hover:border-pink-700"
        />
        {file && <div className="text-xs text-neutral-600 mt-2">{file.name}</div>}
      </div>

      {/* Transcript with click-to-select */}
      {words.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs uppercase tracking-widest text-neutral-600">
              Transcript · click a word, shift-click another to define the fix window
            </div>
            {hasSelection && (
              <div className="text-xs text-pink-700 font-mono">
                {words[selStart!].start.toFixed(2)}s → {words[selEnd!].end.toFixed(2)}s
              </div>
            )}
          </div>
          <div className="border border-neutral-900 p-4 leading-loose">
            {words.map((w, i) => {
              const inSel =
                selStart != null && selEnd != null && i >= selStart && i <= selEnd;
              return (
                <span
                  key={i}
                  onClick={(e) => handleWordClick(i, e)}
                  className={`cursor-pointer px-1 transition-colors ${
                    inSel
                      ? 'bg-pink-900/40 text-white'
                      : 'text-neutral-400 hover:bg-neutral-900'
                  }`}
                >
                  {w.word}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* What the new lyrics should say */}
      {hasSelection && (
        <div>
          <label className="block text-xs uppercase tracking-widest text-neutral-600 mb-1">
            Should say
          </label>
          <div className="text-xs text-neutral-700 mb-2 italic">
            Original: &ldquo;{originalLyrics}&rdquo;
          </div>
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Write what the persona should sing instead…"
            rows={3}
            className="w-full bg-black border border-neutral-900 text-white px-3 py-2 text-sm focus:outline-none focus:border-pink-700"
          />
        </div>
      )}

      {/* Action */}
      <div className="flex items-center gap-4">
        <button
          onClick={runFix}
          disabled={working || !hasSelection || !promptText.trim() || !personaVoiceModel || !sourceTrackId}
          className="px-6 py-2 border border-pink-700 text-pink-400 uppercase tracking-widest text-xs hover:bg-pink-900/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {working ? stage || 'Working…' : 'Fix lyric'}
        </button>
        {error && <div className="text-xs text-red-500">{error}</div>}
        {stage && !error && <div className="text-xs text-neutral-600">{stage}</div>}
      </div>

      {/* Result */}
      {result && audioUrl && (
        <div className="border-t border-neutral-900 pt-6 space-y-3">
          <div className="text-xs uppercase tracking-widest text-neutral-600">
            Fixed {result.fixedPath ? '(full song, crossfaded)' : '(section only)'}
          </div>
          {result.rawText && (
            <div className="text-sm text-neutral-300 italic">
              &ldquo;{result.rawText}&rdquo;
              {result.inSpec === false && (
                <span className="ml-2 text-yellow-600 text-xs">meter drift</span>
              )}
            </div>
          )}
          <audio ref={audioRef} controls src={audioUrl} className="w-full" />
          <a
            href={audioUrl}
            download
            className="inline-block text-xs uppercase tracking-widest text-neutral-400 hover:text-pink-400 border-b border-neutral-900 hover:border-pink-700 pb-0.5 transition-colors"
          >
            Download
          </a>
        </div>
      )}
    </div>
  );
}
