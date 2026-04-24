import { Dialog } from '@headlessui/react';
import { useEffect, useRef, useState } from 'react';
import { Persona } from '../types';
import { API_HOST, generatePersonaIdea } from '../lib/api';
import { MicIcon } from './Icons';

type Props = {
  open: boolean;
  persona: Persona | null;
  onClose: () => void;
  onSubmit: (
    id: string,
    data: {
      name: string;
      description: string;
      provider: string;
      voice_model_key: string;
      image?: File | null;
      image_focus_x?: number;
      image_focus_y?: number;
    }
  ) => void | Promise<void>;
};

export function EditPersonaModal({ open, persona, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState('kits-ai');
  const [voiceKey, setVoiceKey] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [randomizing, setRandomizing] = useState(false);
  const [useMononym, setUseMononym] = useState(false);
  const [imageFocus, setImageFocus] = useState({ x: 50, y: 50 });
  const [dragging, setDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dropzoneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!persona) return;
    setName(persona.name);
    setDescription(persona.description);
    setProvider(persona.provider);
    setVoiceKey(persona.voice_model_key);
    setImage(null);
    setPreview(persona.image_url ? `${API_HOST}${persona.image_url}` : null);
    setUseMononym(false);
    setImageFocus({
      x: persona.image_focus_x ?? 50,
      y: persona.image_focus_y ?? 50
    });
  }, [persona?.id]);

  useEffect(() => {
    if (image) {
      const url = URL.createObjectURL(image);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    if (!image && persona?.image_url) {
      setPreview(`${API_HOST}${persona.image_url}`);
    } else if (!image) {
      setPreview(null);
    }
  }, [image, persona?.image_url]);

  useEffect(() => {
    function stopDragging() {
      setDragging(false);
    }
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchend', stopDragging);
    return () => {
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchend', stopDragging);
    };
  }, []);

  function updateFocusFromPoint(clientX: number, clientY: number) {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    setImageFocus({
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y))
    });
  }

  function handlePointerDown(clientX: number, clientY: number) {
    if (!preview) return;
    setDragging(true);
    updateFocusFromPoint(clientX, clientY);
  }

  function handlePointerMove(clientX: number, clientY: number) {
    if (!dragging) return;
    updateFocusFromPoint(clientX, clientY);
  }

  function handleSubmit() {
    if (!persona) return;
    onSubmit(persona.id, {
      name,
      description,
      provider,
      voice_model_key: voiceKey,
      image,
      image_focus_x: imageFocus.x,
      image_focus_y: imageFocus.y
    });
  }

  async function handleRandomize() {
    if (!persona) return;
    try {
      setRandomizing(true);
      const idea = await generatePersonaIdea({ seed: persona.description, mononym: useMononym });
      setName(idea.name);
      setDescription(idea.description);
    } finally {
      setRandomizing(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md rounded-2xl border border-border-default bg-canvas p-6 shadow-2xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Dialog.Title className="font-display text-xl font-semibold">Edit Persona</Dialog.Title>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] tracking-tight text-muted">
                <input
                  type="checkbox"
                  checked={useMononym}
                  onChange={(e) => setUseMononym(e.target.checked)}
                  className="accent-blue-300"
                />
                Mononym
              </label>
              <button
                type="button"
                onClick={handleRandomize}
                disabled={!persona || randomizing}
                className="rounded-md border border-border-default px-3 py-1.5 text-[11px] font-medium tracking-tight text-secondary transition hover:border-border-emphasis disabled:cursor-not-allowed disabled:opacity-40"
              >
                {randomizing ? 'Weaving...' : 'AI Randomize'}
              </button>
            </div>
          </div>
          {persona ? (
            <div className="space-y-4 text-sm text-secondary">
              <label className="block">
                <span className="text-xs tracking-tight text-muted">Name</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs tracking-tight text-muted">Description</span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs tracking-tight text-muted">Provider</span>
                <select
                  className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="so-vits">So-VITS-SVC (Best Voice Match)</option>
                  <option value="ddsp">DDSP-SVC (Fast)</option>
                  <option value="rvc">RVC (Spectral Transfer)</option>
                  <option value="camb-ai">CAMB.AI MARS8 (Ultra Clone)</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="fish-audio">Fish Audio</option>
                  <option value="minimax">MiniMax Audio</option>
                  <option value="kits-ai">Kits AI</option>
                  <option value="openai-voice">OpenAI Voice</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs tracking-tight text-muted">Voice Model Key</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                  value={voiceKey}
                  onChange={(e) => setVoiceKey(e.target.value)}
                />
              </label>
              <div>
                <p className="text-xs tracking-tight text-muted">Portrait</p>
                {/* Drag & Drop Zone */}
                <div
                  ref={dropzoneRef}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(true);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith('image/')) {
                      setImage(file);
                    }
                  }}
                  onClick={() => !preview && fileInputRef.current?.click()}
                  className={`mt-2 flex cursor-pointer flex-col items-center justify-center border-2 border-dashed p-6 transition ${
                    isDragOver
                      ? 'border-primary bg-accent-subtle'
                      : preview
                        ? 'border-transparent p-0'
                        : 'border-border-default hover:border-primary'
                  }`}
                >
                  {preview ? (
                    <div className="flex w-full items-center gap-4">
                      {/* Preview Image */}
                      <div
                        ref={previewRef}
                        className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-default bg-overlay"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handlePointerDown(e.clientX, e.clientY);
                        }}
                        onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          const touch = e.touches[0];
                          handlePointerDown(touch.clientX, touch.clientY);
                        }}
                        onTouchMove={(e) => {
                          e.preventDefault();
                          const touch = e.touches[0];
                          handlePointerMove(touch.clientX, touch.clientY);
                        }}
                      >
                        <img
                          src={preview}
                          alt="Persona preview"
                          className="h-full w-full select-none object-cover"
                          style={{ objectPosition: `${imageFocus.x}% ${imageFocus.y}%` }}
                        />
                        <div className="pointer-events-none absolute inset-0 rounded-full border border-border-emphasis" />
                      </div>
                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          className="border border-border-default px-3 py-2 text-[11px] font-medium tracking-tight text-secondary transition hover:border-border-emphasis"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setImage(null);
                            if (!persona?.image_url) setPreview(null);
                          }}
                          className="border border-border-subtle px-3 py-2 text-[11px] font-medium tracking-tight text-muted transition hover:border-border-default hover:text-secondary"
                        >
                          Remove
                        </button>
                        <p className="text-[10px] text-muted">Drag image to reframe</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <MicIcon className="mb-2 text-muted" size={32} />
                      <p className="text-sm text-secondary">Drop image here</p>
                      <p className="mt-1 text-xs text-muted">or click to browse</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    setImage(file ?? null);
                  }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border-default px-4 py-2 text-xs font-medium tracking-tight text-secondary transition hover:border-border-emphasis"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="rounded-lg bg-accent px-4 py-2 text-xs font-medium tracking-tight text-canvas transition hover:bg-accent-hover"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-secondary">Select a persona to edit.</p>
          )}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
