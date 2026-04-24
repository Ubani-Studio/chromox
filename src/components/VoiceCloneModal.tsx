import { Dialog } from '@headlessui/react';
import { useEffect, useRef, useState, DragEvent } from 'react';
import { StyleControls } from '../types';
import { API_HOST } from '../lib/api';
import { LogoIcon, MicIcon, UploadIcon } from './Icons';

type DetectionResult = {
  voiceType: 'speech' | 'singing' | 'mixed';
  voiceTypeConfidence: number;
  accent: string;
  accentLabel: string;
  accentConfidence: number;
  audioQuality: 'studio' | 'good' | 'acceptable' | 'poor';
  qualityScore: number;
  duration: number;
  recommendedMode: 'quick' | 'studio' | 'diaspora';
  modeLabel: string;
  recommendedProvider: string;
  explanation: string;
};

type AnalysisResult = {
  success: boolean;
  profile: any;
  suggestedControls: StyleControls;
  detection?: DetectionResult;
  message: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onPersonaCreated: () => void;
};

export function VoiceCloneModal({ open, onClose, onPersonaCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [vocalFile, setVocalFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string>('');
  const [personaImage, setPersonaImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (personaImage) {
      const url = URL.createObjectURL(personaImage);
      setImagePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setImagePreview(null);
  }, [personaImage]);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setVocalFile(file);
      setError('');
    }
  }

  async function handleAnalyze() {
    if (!vocalFile) return;

    setAnalyzing(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('vocal', vocalFile);

      const response = await fetch(`${API_HOST}/api/voice-clone/analyze`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const result = await response.json();
      setAnalysis(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCreatePersona() {
    if (!vocalFile || !name) return;

    setCreating(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('vocal', vocalFile);
      formData.append('name', name);
      formData.append('description', description || `Cloned voice from ${vocalFile.name}`);
      if (personaImage) {
        formData.append('image', personaImage);
      }

      const response = await fetch(`${API_HOST}/api/voice-clone/create-persona`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Persona creation failed');
      }

      const result = await response.json();
      console.log('Persona created:', result);

      // Reset and close
      resetForm();
      onPersonaCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function resetForm() {
    setName('');
    setDescription('');
    setVocalFile(null);
    setAnalysis(null);
    setError('');
    setPersonaImage(null);
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70" aria-hidden="true" />

      {/* Modal Container */}
      <div className="fixed inset-0 flex items-center justify-center p-6">
        <Dialog.Panel className="w-full max-w-2xl rounded-3xl border border-border-default bg-surface p-8 shadow-2xl">
          {/* Header */}
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15">
                <LogoIcon className="text-accent" size={28} />
              </div>
              <div>
                <Dialog.Title className="font-display text-2xl font-semibold tracking-tight">
                  Clone Voice Persona
                </Dialog.Title>
                <p className="text-sm text-muted">Extract and save voice characteristics</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Dropzone */}
            <div>
              <label className="mb-3 block text-sm font-medium text-secondary">Upload Vocal Stem</label>
              <div
                className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all ${
                  dragging
                    ? 'border-accent bg-accent/10'
                    : vocalFile
                      ? 'border-accent/30 bg-surface'
                      : 'border-border-default bg-surface'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'audio/*';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) setVocalFile(file);
                  };
                  input.click();
                }}
              >
                {vocalFile ? (
                  <div className="text-center">
                    <MicIcon className="mx-auto mb-2 text-accent" size={40} />
                    <p className="text-lg font-medium text-accent">{vocalFile.name}</p>
                    <p className="mt-2 text-sm text-muted">
                      {(vocalFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <UploadIcon className="mx-auto mb-4 text-muted" size={48} />
                    <p className="text-base font-medium text-secondary">Drop vocal stem or click to browse</p>
                    <p className="mt-3 text-xs tracking-tight text-muted">
                      WAV · AIFF · MP3 · FLAC
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Analysis Results with Auto-Detection */}
            {analysis && (
              <div className="space-y-4">
                {/* Detection Summary */}
                {analysis.detection && (
                  <div className="border border-border-default bg-surface p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 bg-accent" />
                        <p className="text-sm font-medium tracking-tight">
                          Auto-Detected
                        </p>
                      </div>
                      <span className="border border-border-default px-3 py-1 text-xs font-medium tracking-tight">
                        {analysis.detection.modeLabel}
                      </span>
                    </div>

                    {/* Detection Grid */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="border border-border-subtle bg-canvas p-3">
                        <p className="text-[10px] tracking-tight text-muted">Voice Type</p>
                        <p className="mt-1 text-sm font-semibold capitalize">
                          {analysis.detection.voiceType}
                        </p>
                        <p className="text-[10px] text-muted">
                          {Math.round(analysis.detection.voiceTypeConfidence * 100)}% confidence
                        </p>
                      </div>
                      <div className="border border-border-subtle bg-canvas p-3">
                        <p className="text-[10px] tracking-tight text-muted">Accent</p>
                        <p className="mt-1 text-sm font-semibold">
                          {analysis.detection.accentLabel}
                        </p>
                        <p className="text-[10px] text-muted">
                          {Math.round(analysis.detection.accentConfidence * 100)}% confidence
                        </p>
                      </div>
                      <div className="border border-border-subtle bg-canvas p-3">
                        <p className="text-[10px] tracking-tight text-muted">Quality</p>
                        <p className="mt-1 text-sm font-semibold capitalize">
                          {analysis.detection.audioQuality}
                        </p>
                        <p className="text-[10px] text-muted">
                          {Math.round(analysis.detection.duration)}s audio
                        </p>
                      </div>
                    </div>

                    {/* Provider Recommendation */}
                    <div className="mt-4 border-t border-border-subtle pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] tracking-tight text-muted">Recommended Provider</p>
                          <p className="mt-1 text-sm font-semibold">
                            {analysis.detection.recommendedProvider}
                          </p>
                        </div>
                        <p className="max-w-xs text-right text-xs text-secondary">
                          {analysis.detection.explanation}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Voice Characteristics */}
                <div className="border border-border-default bg-surface p-5">
                  <p className="mb-4 text-sm font-medium tracking-tight text-muted">
                    Voice Characteristics
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-border-subtle bg-canvas p-3">
                      <p className="text-[10px] tracking-tight text-muted">Pitch Range</p>
                      <p className="mt-1 text-lg font-semibold">
                        {analysis.profile.characteristics.pitchRange.min.toFixed(0)} -{' '}
                        {analysis.profile.characteristics.pitchRange.max.toFixed(0)} Hz
                      </p>
                    </div>
                    <div className="border border-border-subtle bg-canvas p-3">
                      <p className="text-[10px] tracking-tight text-muted">Brightness</p>
                      <p className="mt-1 text-lg font-semibold">
                        {(analysis.profile.characteristics.brightness * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="border border-border-subtle bg-canvas p-3">
                      <p className="text-[10px] tracking-tight text-muted">Breathiness</p>
                      <p className="mt-1 text-lg font-semibold">
                        {(analysis.profile.characteristics.breathiness * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="border border-border-subtle bg-canvas p-3">
                      <p className="text-[10px] tracking-tight text-muted">Vibrato</p>
                      <p className="mt-1 text-lg font-semibold">
                        {analysis.profile.characteristics.vibratoRate.toFixed(1)} Hz
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Name & Description */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-secondary">Persona Name</label>
                <input
                  className="w-full rounded-xl border border-border-default bg-surface px-4 py-3 text-primary placeholder-disabled focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Stellar Voice, Dream Singer..."
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-secondary">Description</label>
                <input
                  className="w-full rounded-xl border border-border-default bg-surface px-4 py-3 text-primary placeholder-disabled focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description..."
                />
              </div>
            </div>

            {/* Persona Image */}
            <div>
              <label className="mb-2 block text-sm font-medium text-secondary">Persona Image</label>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-border-default bg-elevated">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Persona preview" className="h-full w-full object-cover" />
                  ) : (
                    <LogoIcon className="text-muted" size={20} />
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="rounded-lg border border-border-default px-4 py-2 text-xs font-medium tracking-tight text-secondary transition hover:border-border-emphasis hover:text-primary"
                  >
                    Upload
                  </button>
                  {personaImage && (
                    <button
                      type="button"
                      onClick={() => setPersonaImage(null)}
                      className="rounded-lg border border-border-subtle px-4 py-2 text-xs font-medium tracking-tight text-muted transition hover:border-border-default hover:text-secondary"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setPersonaImage(file ?? null);
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-error/30 bg-error/10 p-4">
                <p className="text-sm font-medium text-error">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              {!analysis ? (
                <button
                  onClick={handleAnalyze}
                  disabled={!vocalFile || analyzing}
                  className="flex-1 rounded-xl border border-border-default bg-elevated px-6 py-3.5 text-sm font-medium tracking-tight transition hover:bg-overlay hover:border-border-emphasis disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {analyzing ? 'Analyzing Voice...' : 'Analyze Voice'}
                </button>
              ) : (
                <button
                  onClick={handleCreatePersona}
                  disabled={!name || creating}
                  className="flex-1 rounded-xl bg-accent px-6 py-3.5 text-sm font-medium tracking-tight text-canvas transition hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? 'Cloning Voice...' : 'Clone & Save Persona'}
                </button>
              )}
              <button
                onClick={() => {
                  resetForm();
                  onClose();
                }}
                className="rounded-xl border border-border-default px-6 py-3.5 text-sm font-medium tracking-tight text-secondary transition hover:bg-overlay hover:text-primary"
              >
                Cancel
              </button>
            </div>

            {/* Info */}
            <div className="rounded-xl border border-border-default bg-elevated p-5">
              <p className="mb-3 text-sm font-medium text-secondary">How Voice Cloning Works:</p>
              <ul className="space-y-2 text-sm text-muted">
                <li className="flex gap-2">
                  <span className="text-accent">·</span>
                  <span>Upload clean vocal stems (isolated vocals work best)</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">·</span>
                  <span>AI analyzes pitch, timbre, vibrato, and voice characteristics</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">·</span>
                  <span>Voice profile is saved with neural embeddings</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">·</span>
                  <span>Generate unlimited vocals with any lyrics in this voice!</span>
                </li>
              </ul>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
