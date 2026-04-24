import { useEffect, useState, useMemo } from 'react';
import { Persona, RenderHistoryItem, StyleControls, FolioClip } from './types';
import { StudioPanel } from './components/StudioPanel';
import { CreatePersonaModal } from './components/CreatePersonaModal';
import { VoiceCloneModal } from './components/VoiceCloneModal';
import {
  API_HOST,
  createPersona,
  createRelic,
  updatePersona,
  fetchPersonas,
  fetchRenderHistory,
  renderPerformance,
  replayRender,
  rewriteLyrics,
  previewPerformance,
  rateRenderJob,
  updateRenderLabel,
  updateRenderPersona,
  saveRenderAsGuide,
  sendSonicSignal
} from './lib/api';
import { DownloadsTab } from './components/DownloadsTab';
import { EditPersonaModal } from './components/EditPersonaModal';
import { VoiceTrainingModal } from './components/VoiceTrainingModal';
import { AudioProvider } from './contexts/AudioContext';
// Icons kept for a few functional spots inside tabs (persona tile
// affordances, empty-state illustrations). The sidebar nav is text-only
// per minimal-luxury register - never use these in the tab labels.
import { LogoIcon, MicIcon } from './components/Icons';
import { BovedaTab } from './components/boveda/BovedaTab';
import { VoiceLibraryTab } from './components/VoiceLibraryTab';
import { AdminFlowTab } from './components/AdminFlowTab';
import MmuoFixPanel from './components/MmuoFixPanel';

type TabId = 'studio' | 'library' | 'fix' | 'downloads' | 'boveda' | 'admin';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('studio');
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activePersonaId, setActivePersonaId] = useState<string | undefined>(undefined);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [renderHistory, setRenderHistory] = useState<RenderHistoryItem[]>([]);
  const [prefillJob, setPrefillJob] = useState<RenderHistoryItem | null>(null);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [trainingPersona, setTrainingPersona] = useState<Persona | null>(null);
  const [tasteProfileVersion, setTasteProfileVersion] = useState(0);
  // Brand locked to Mmuo. Splurgle toggle was a brand-exploration
  // artefact; removed once Mmuo was chosen.
  const [adminMode, setAdminMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chromox_admin') === 'true';
    }
    return false;
  });

  function handlePrefillConsumed() {
    setPrefillJob(null);
  }

  useEffect(() => {
    refresh();
    refreshDownloads();
  }, []);

  // Admin mode keyboard shortcut: Ctrl+Shift+A
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setAdminMode(prev => {
          const newVal = !prev;
          localStorage.setItem('chromox_admin', String(newVal));
          console.log(`[Chromox] Admin mode ${newVal ? 'enabled' : 'disabled'}`);
          return newVal;
        });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function refresh() {
    const data = await fetchPersonas();
    setPersonas(data);
    if (!activePersonaId && data.length) {
      setActivePersonaId(data[0].id);
    }
  }

  async function handleCreate(payload: {
    name: string;
    description: string;
    voice_model_key: string;
    provider: string;
    default_style_controls: StyleControls;
    image?: File | null;
  }) {
    const persona = await createPersona(payload);
    setPersonas((prev) => [...prev, persona]);
    setForgeOpen(false);
  }

  async function handleEditPersona(
    id: string,
    payload: {
      name: string;
      description: string;
      provider: string;
      voice_model_key: string;
      image?: File | null;
      image_focus_x?: number;
      image_focus_y?: number;
    }
  ) {
    const updated = await updatePersona(id, payload);
    setPersonas((prev) => prev.map((persona) => (persona.id === updated.id ? updated : persona)));
    setEditingPersona(null);
  }

  async function refreshDownloads() {
    const history = await fetchRenderHistory();
    setRenderHistory(history);
  }

  async function handleSaveAsGuide(personaId: string, renderId: string, name?: string) {
    await saveRenderAsGuide(personaId, renderId, name);
    sendSonicSignal('use_guide', renderId, { personaId, source: 'render' });
    await refresh(); // Refresh to update guide samples
  }

  function handleRenderComplete(job: RenderHistoryItem) {
    setRenderHistory((prev) => [job, ...prev]);
  }

  function handleLoadJob(job: RenderHistoryItem) {
    setActivePersonaId(job.personaId);
    setPrefillJob(job);
    setActiveTab('studio');
  }

  async function handleRateRender(jobId: string, rating: 'like' | 'dislike' | 'neutral') {
    await rateRenderJob(jobId, rating);
    setRenderHistory((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, rating } : job))
    );
    setTasteProfileVersion((prev) => prev + 1);
    if (rating === 'like' || rating === 'dislike') {
      sendSonicSignal(rating, jobId);
    }
  }

  async function handleRenameRender(jobId: string, label: string) {
    await updateRenderLabel(jobId, label);
    setRenderHistory((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, label } : job))
    );
  }

  async function handleChangeRenderPersona(jobId: string, personaId: string) {
    const updated = await updateRenderPersona(jobId, personaId);
    setRenderHistory((prev) =>
      prev.map((job) => (job.id === jobId ? updated : job))
    );
  }

  const activePersona = personas.find((p) => p.id === activePersonaId);
  const activePersonaImage = activePersona?.image_url ? `${API_HOST}${activePersona.image_url}` : undefined;

  // Collect guide samples from all personas as clips (for StudioPanel compatibility)
  const allClips = useMemo(() => {
    const guideSamplesAsClips: FolioClip[] = [];

    for (const persona of personas) {
      if (persona.guide_samples && persona.guide_samples.length > 0) {
        for (const sample of persona.guide_samples) {
          const audioUrl = sample.url || sample.path || '';
          guideSamplesAsClips.push({
            id: `guide_${persona.id}_${sample.id}`,
            name: sample.name || sample.originalName,
            audioPath: sample.path || '',
            audioUrl: audioUrl,
            source: 'upload' as const,
            sourcePersonaName: persona.name,
            tags: sample.tags || ['guide-sample'],
            added_at: sample.uploaded_at || new Date().toISOString(),
          });
        }
      }
    }

    return guideSamplesAsClips;
  }, [personas]);

  const objectPositionStyle = (persona?: Persona) => ({
    objectPosition: `${persona?.image_focus_x ?? 50}% ${persona?.image_focus_y ?? 50}%`
  });

  const totalGuideSamples = personas.reduce((sum, p) => sum + (p.guide_samples?.length ?? 0), 0);

  // Sidebar labels: title case (capital letter, rest lowercase). No
  // all-caps, no icons - the text is the affordance.
  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'studio', label: 'Studio' },
    { id: 'library', label: 'Voice library', count: totalGuideSamples },
    { id: 'fix', label: 'Fix' },
    { id: 'downloads', label: 'Downloads', count: renderHistory.length },
    { id: 'boveda', label: 'Boveda' },
    ...(adminMode ? [{ id: 'admin' as TabId, label: 'Admin' }] : []),
  ];

  return (
    <AudioProvider>
      <div className="flex min-h-screen text-primary bg-canvas">
        {/* Left sidebar - vertical nav, masquerade register. No emojis,
            no gradients, no rounded tiles. Canela title + Sohne labels,
            tyrian accent on the active row. */}
        <aside className="fixed top-0 left-0 h-screen w-56 border-r border-border-default bg-canvas flex flex-col z-50">
          <div className="px-6 pt-8 pb-6 border-b border-border-default">
            <h1 className="font-display text-2xl font-semibold tracking-tight select-none text-primary">
              Mmuo
            </h1>
          </div>

          <nav className="flex-1 px-3 pt-4 flex flex-col gap-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-between px-3 py-2 text-sm font-medium tracking-tight transition-colors text-left ${
                  activeTab === tab.id
                    ? 'text-accent bg-accent-subtle border-l-2 border-accent -ml-[2px] pl-[14px]'
                    : 'text-secondary hover:text-primary hover:bg-overlay border-l-2 border-transparent -ml-[2px] pl-[14px]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-[10px] font-mono text-muted">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Sidebar footer actions - text only, no icons */}
          <div className="px-3 py-4 border-t border-border-default flex flex-col gap-1">
            <button
              onClick={() => setCloneOpen(true)}
              className="px-3 py-2 text-sm font-medium text-accent hover:bg-accent-subtle border border-accent/40 transition-colors text-left"
            >
              Clone voice
            </button>
            <button
              onClick={() => setForgeOpen(true)}
              className="px-3 py-2 text-sm font-medium text-secondary hover:text-primary hover:bg-overlay transition-colors text-left"
            >
              New persona
            </button>
          </div>
        </aside>

        {/* Main content shifts right of the 224px sidebar */}
        <main className="flex-1 ml-56">
          {/* Studio Tab */}
          {activeTab === 'studio' && (
            <div className="mx-auto flex max-w-[1800px] gap-6 p-6">
              {/* Left Column: Persona Selector */}
              <aside className="w-80 shrink-0">
                <div className="sticky top-6 rounded-2xl border border-border-default bg-surface p-4">
                  <div className="mb-4">
                    <h2 className="text-xs font-medium tracking-tight text-muted">Personas</h2>
                    <p className="text-xs text-muted">{personas.length} voice{personas.length !== 1 ? 's' : ''}</p>
                  </div>

                  <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                    {personas.map((persona) => {
                      const imageSrc = persona.image_url ? `${API_HOST}${persona.image_url}` : undefined;
                      return (
                        <button
                          key={persona.id}
                          onClick={() => setActivePersonaId(persona.id)}
                          className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                            activePersonaId === persona.id
                              ? 'border-accent bg-accent/10'
                              : 'border-border-default bg-surface hover:bg-overlay hover:border-border-emphasis'
                          }`}
                        >
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg ${
                              imageSrc
                                ? 'border border-border-default bg-canvas'
                                : persona.is_cloned
                                  ? 'bg-accent/15'
                                  : 'bg-elevated'
                            }`}
                          >
                            {imageSrc ? (
                              <img
                                src={imageSrc}
                                alt={`${persona.name} avatar`}
                                className="h-full w-full object-cover"
                                style={objectPositionStyle(persona)}
                                loading="lazy"
                              />
                            ) : persona.is_cloned ? (
                              <LogoIcon className="text-accent" size={14} />
                            ) : (
                              <MicIcon className="text-secondary" size={14} />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="truncate text-sm font-medium text-primary">{persona.name}</h3>
                              {activePersonaId === persona.id && (
                                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                              )}
                            </div>
                            <p className="truncate text-xs text-muted">{persona.description}</p>

                            <div className="mt-1.5 flex gap-1">
                              {persona.is_cloned && (
                                <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                                  Cloned
                                </span>
                              )}
                              {(persona.relics?.length ?? 0) > 0 && (
                                <span className="rounded-md bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-medium text-yellow-600">
                                  {persona.relics!.length} relic{persona.relics!.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {personas.length === 0 && (
                      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-default bg-surface p-8 text-center">
                        <LogoIcon className="mb-2 text-muted" size={32} />
                        <p className="text-sm font-medium text-secondary">No personas yet</p>
                        <p className="mt-1 text-xs text-muted">Clone a voice to begin</p>
                      </div>
                    )}
                  </div>
                </div>
              </aside>

              {/* Right Column: Studio Panel */}
              <div className="min-w-0 flex-1">
                {activePersona ? (
                  <div className="rounded-2xl border border-border-default bg-surface p-6">
                    <div className="mb-6 border-b border-border-default pb-6">
                      <div className="flex flex-col items-center text-center">
                        <div className="mb-4 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-border-default bg-overlay">
                          {activePersonaImage ? (
                            <img
                              src={activePersonaImage}
                              alt={`${activePersona.name} avatar`}
                              className="h-full w-full object-cover"
                              style={objectPositionStyle(activePersona)}
                            />
                          ) : activePersona.is_cloned ? (
                            <LogoIcon className="text-accent" size={40} />
                          ) : (
                            <MicIcon className="text-secondary" size={40} />
                          )}
                        </div>
                        <h2 className="font-display text-2xl font-semibold tracking-tight">{activePersona.name}</h2>
                        <p className="mt-1 max-w-md text-sm text-secondary">{activePersona.description}</p>
                        <div className="mt-4 flex items-center gap-3">
                          {activePersona.is_cloned && (
                            <span className="border border-border-default px-3 py-1 text-xs font-medium tracking-tight text-secondary">
                              Voice Clone
                            </span>
                          )}
                          <button
                            onClick={() => setEditingPersona(activePersona)}
                            className="border border-border-default px-4 py-1.5 text-xs font-medium tracking-tight text-secondary transition hover:border-border-emphasis hover:text-primary"
                          >
                            Edit Persona
                          </button>
                          {activePersona.is_cloned && (
                            <button
                              onClick={() => setTrainingPersona(activePersona)}
                              className="border border-accent/30 bg-accent/5 px-4 py-1.5 text-xs font-medium tracking-tight text-accent transition hover:bg-accent/10 hover:border-accent/50"
                            >
                              Train Voice
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <StudioPanel
                      personas={personas}
                      activePersonaId={activePersonaId}
                      onPersonaChange={setActivePersonaId}
                      onRewrite={rewriteLyrics}
                      onRender={renderPerformance}
                      onRenderComplete={handleRenderComplete}
                      prefill={prefillJob}
                      onPrefillConsumed={handlePrefillConsumed}
                      onPreview={previewPerformance}
                      onGuideLibraryUpdated={refresh}
                      onRateRender={handleRateRender}
                      tasteProfileVersion={tasteProfileVersion}
                      folioClips={allClips}
                    />
                  </div>
                ) : (
                  <div className="flex h-[600px] flex-col items-center justify-center rounded-2xl border border-border-default bg-surface p-12 text-center">
                    <LogoIcon className="mb-4 text-muted" size={48} />
                    <h3 className="font-display text-xl font-semibold">No Persona Selected</h3>
                    <p className="mt-2 text-sm text-secondary">
                      Select a persona from the left or create a new one
                    </p>
                    <div className="mt-6 flex gap-3">
                      <button
                        onClick={() => setCloneOpen(true)}
                        className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-canvas transition hover:bg-accent-hover"
                      >
                        <LogoIcon size={14} /> Clone Voice
                      </button>
                      <button
                        onClick={() => setForgeOpen(true)}
                        className="rounded-lg border border-border-default bg-surface px-5 py-2.5 text-sm font-medium text-secondary transition hover:bg-overlay hover:border-border-emphasis"
                      >
                        + New Persona
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Voice Library Tab */}
          {activeTab === 'library' && (
            <VoiceLibraryTab
              personas={personas}
              onRefresh={refresh}
            />
          )}

          {/* Fix Tab - Suno persona lyric regeneration */}
          {activeTab === 'fix' && <MmuoFixPanel />}

          {/* Downloads Tab */}
          {activeTab === 'downloads' && (
            <DownloadsTab
              jobs={renderHistory}
              personas={personas}
              onSelectJob={handleLoadJob}
              onReplay={async (jobId) => {
                const result = await replayRender(jobId);
                handleRenderComplete(result.render);
                return result;
              }}
              refreshJobs={refreshDownloads}
              onRateJob={handleRateRender}
              onRenameJob={handleRenameRender}
              onChangePersona={handleChangeRenderPersona}
              onSaveAsGuide={handleSaveAsGuide}
            />
          )}

          {/* Boveda Tab */}
          {activeTab === 'boveda' && (
            <BovedaTab
              personas={personas}
              onCreatePersona={async (data) => {
                const persona = await createPersona({
                  name: data.name,
                  description: data.bio,
                  voice_model_key: 'default',
                  provider: 'chromox-labs',
                  default_style_controls: {
                    brightness: 0.5, breathiness: 0.5, energy: 0.5, formant: 0,
                    vibratoDepth: 0.4, vibratoRate: 0.5, roboticism: 0, glitch: 0,
                    stereoWidth: 0.5,
                  },
                });
                setPersonas((prev) => [...prev, persona]);
              }}
              onCreateRelic={async (personaId, relic) => {
                await createRelic(personaId, relic);
              }}
            />
          )}

          {/* Admin Tab (hidden unless admin mode enabled) */}
          {activeTab === 'admin' && adminMode && (
            <AdminFlowTab
              personas={personas}
              onRenderComplete={handleRenderComplete}
            />
          )}
        </main>

        {/* Modals */}
        <CreatePersonaModal open={forgeOpen} onClose={() => setForgeOpen(false)} onSubmit={handleCreate} />
        <VoiceCloneModal open={cloneOpen} onClose={() => setCloneOpen(false)} onPersonaCreated={refresh} />
        <EditPersonaModal
          open={Boolean(editingPersona)}
          persona={editingPersona}
          onClose={() => setEditingPersona(null)}
          onSubmit={handleEditPersona}
        />
        <VoiceTrainingModal
          open={Boolean(trainingPersona)}
          persona={trainingPersona}
          onClose={() => setTrainingPersona(null)}
          onUpdate={refresh}
        />
      </div>
    </AudioProvider>
  );
}
