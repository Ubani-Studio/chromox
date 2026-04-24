import { Persona } from '../types';
import { LogoIcon } from './Icons';

type PersonaCardProps = {
  persona: Persona;
  active?: boolean;
  onSelect?: (id: string) => void;
};

export function PersonaCard({ persona, active, onSelect }: PersonaCardProps) {
  return (
    <button
      onClick={() => onSelect?.(persona.id)}
      className={`group relative overflow-hidden rounded-2xl border bg-surface p-5 text-left transition ${
        active ? 'border-accent bg-accent/10' : 'border-border-default hover:bg-overlay hover:border-border-emphasis'
      }`}
    >
      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {persona.is_cloned && (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15">
                <LogoIcon className="text-accent" size={14} />
              </div>
            )}
            <span className="text-xs font-medium tracking-tight text-muted">
              {persona.is_cloned ? 'Cloned' : 'Persona'}
            </span>
          </div>
          <span className="font-mono text-[10px] text-muted">#{persona.id.slice(0, 6)}</span>
        </div>

        {/* Name */}
        <h3 className="mb-2 font-display text-lg font-medium tracking-tight">{persona.name}</h3>

        {/* Description */}
        <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-secondary">{persona.description}</p>

        {/* Voice Stats (if cloned) */}
        {persona.is_cloned && persona.voice_profile && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border-subtle bg-canvas p-3">
            <div>
              <p className="text-[10px] tracking-tight text-muted">Pitch</p>
              <p className="text-xs font-medium text-accent">
                {persona.voice_profile.characteristics.pitchRange.mean.toFixed(0)} Hz
              </p>
            </div>
            <div>
              <p className="text-[10px] tracking-tight text-muted">Brightness</p>
              <p className="text-xs font-medium text-accent">
                {(persona.voice_profile.characteristics.brightness * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border-subtle pt-3 text-xs text-muted">
          <span>{new Date(persona.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Active Indicator */}
      {active && (
        <div className="absolute right-3 top-3">
          <div className="h-2 w-2 rounded-full bg-accent" />
        </div>
      )}
    </button>
  );
}
