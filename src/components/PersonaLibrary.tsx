import { Persona } from '../types';
import { PersonaCard } from './PersonaCard';
import { LogoIcon } from './Icons';

type PersonaLibraryProps = {
  personas: Persona[];
  activePersonaId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onCloneVoice: () => void;
};

export function PersonaLibrary({ personas, activePersonaId, onSelect, onCreate, onCloneVoice }: PersonaLibraryProps) {
  return (
    <section className="rounded-3xl border border-border-default bg-surface p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-tight text-muted">Persona Vault</p>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Voice Collection</h2>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCloneVoice}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-canvas transition hover:bg-accent-hover"
          >
            <LogoIcon size={14} /> Clone Voice
          </button>
          <button
            onClick={onCreate}
            className="rounded-xl border border-border-default bg-surface px-4 py-2.5 text-sm font-medium text-secondary transition hover:bg-overlay hover:border-border-emphasis"
          >
            + New Persona
          </button>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {personas.map((persona) => (
          <PersonaCard
            key={persona.id}
            persona={persona}
            active={persona.id === activePersonaId}
            onSelect={onSelect}
          />
        ))}
        {personas.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-default bg-surface p-12">
            <LogoIcon className="mb-3 text-muted" size={36} />
            <p className="text-sm font-medium text-secondary">No personas yet</p>
            <p className="mt-1 text-xs text-muted">Clone a voice or forge a new persona to begin</p>
          </div>
        )}
      </div>
    </section>
  );
}
