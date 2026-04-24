import { Dialog } from '@headlessui/react';
import { useEffect, useRef, useState } from 'react';
import { StyleControls } from '../types';
import { generatePersonaIdea } from '../lib/api';
import { PaletteIcon } from './Icons';

const baseControls: StyleControls = {
  brightness: 0.5,
  breathiness: 0.5,
  energy: 0.5,
  formant: 0,
  vibratoDepth: 0.4,
  vibratoRate: 0.4,
  roboticism: 0.2,
  glitch: 0.1,
  stereoWidth: 0.5
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description: string;
    voice_model_key: string;
    provider: string;
    default_style_controls: StyleControls;
    image?: File | null;
    image_focus_x?: number;
    image_focus_y?: number;
  }) => void;
};

export function CreatePersonaModal({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [voiceKey, setVoiceKey] = useState('');
  const [provider, setProvider] = useState('camb-ai');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [randomizing, setRandomizing] = useState(false);
  const [useMononym, setUseMononym] = useState(false);
  const [imageFocus, setImageFocus] = useState({ x: 50, y: 50 });
  const [dragging, setDragging] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (image) {
      const url = URL.createObjectURL(image);
      setImagePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setImagePreview(null);
    setImageFocus({ x: 50, y: 50 });
  }, [image]);

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
    if (!imagePreview) return;
    setDragging(true);
    updateFocusFromPoint(clientX, clientY);
  }

  function handlePointerMove(clientX: number, clientY: number) {
    if (!dragging) return;
    updateFocusFromPoint(clientX, clientY);
  }

  function handleSubmit() {
    if (!name || !voiceKey) return;
    onSubmit({
      name,
      description,
      voice_model_key: voiceKey,
      provider,
      default_style_controls: baseControls,
      image,
      image_focus_x: imageFocus.x,
      image_focus_y: imageFocus.y
    });
    setName('');
    setDescription('');
    setVoiceKey('');
    setProvider('camb-ai');
    setImage(null);
    setImageFocus({ x: 50, y: 50 });
  }

  async function handleRandomize() {
    try {
      setRandomizing(true);
      const idea = await generatePersonaIdea({ seed: description, mononym: useMononym });
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
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Dialog.Title className="font-display text-2xl font-semibold">Forge Persona Artifact</Dialog.Title>
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
                disabled={randomizing}
                className="rounded-md border border-border-default px-3 py-1.5 text-[11px] font-medium tracking-tight text-secondary transition hover:border-border-emphasis disabled:cursor-not-allowed disabled:opacity-40"
              >
                {randomizing ? 'Weaving...' : 'AI Randomize'}
              </button>
            </div>
          </div>
          <div className="space-y-4">
            <label className="block text-sm text-secondary">
              Name
              <input
                className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-primary focus:border-accent focus:outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm text-secondary">
              Description
              <textarea
                className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-primary focus:border-accent focus:outline-none"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block text-sm text-secondary">
              Provider
              <select
                className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-primary focus:border-accent focus:outline-none"
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
            <label className="block text-sm text-secondary">
              Voice Model Key
              <input
                className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-primary focus:border-accent focus:outline-none"
                value={voiceKey}
                onChange={(e) => setVoiceKey(e.target.value)}
              />
            </label>
            <div>
              <label className="block text-sm text-secondary">Persona Image</label>
              <div className="mt-2 flex items-center gap-3">
                <div
                  ref={previewRef}
                  className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-border-default bg-elevated"
                  onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
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
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Persona preview"
                      className="h-full w-full select-none object-cover"
                      style={{ objectPosition: `${imageFocus.x}% ${imageFocus.y}%` }}
                    />
                  ) : (
                    <PaletteIcon className="text-muted" size={18} />
                  )}
                  {imagePreview && (
                    <div className="pointer-events-none absolute inset-0 border border-border-emphasis shadow-inner" />
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md border border-border-default px-3 py-2 text-xs font-medium tracking-tight text-secondary transition hover:border-border-emphasis"
                  >
                    Upload
                  </button>
                  {image && (
                    <button
                      type="button"
                      onClick={() => setImage(null)}
                      className="rounded-md border border-border-subtle px-3 py-2 text-xs font-medium tracking-tight text-muted transition hover:border-border-default hover:text-secondary"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {imagePreview && (
                <p className="mt-2 text-xs text-muted">Drag inside the square to set the saved framing.</p>
              )}
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
            <button
              onClick={handleSubmit}
              className="mt-4 w-full rounded-md bg-accent py-2 text-sm font-medium tracking-tight text-canvas transition hover:bg-accent-hover"
            >
              Forge Artifact
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
