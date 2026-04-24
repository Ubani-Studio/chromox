import { Relic } from '../../types';
import { API_HOST } from '../../lib/api';
import { AudioPlayer } from '../AudioPlayer';

type Props = {
  relic: Relic;
  variant?: 'generated' | 'pack';
};

const tierColors: Record<number, string> = {
  1: 'border-border-default bg-surface',
  2: 'border-accent/30 bg-accent/5',
  3: 'border-yellow-500/30 bg-yellow-500/5',
  4: 'border-purple-500/30 bg-purple-500/5'
};

const tierLabels: Record<number, string> = {
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Legendary'
};

export function RelicCard({ relic, variant = 'generated' }: Props) {
  const colorClass = tierColors[relic.tier] ?? tierColors[1];
  const tierLabel = tierLabels[relic.tier] ?? 'Common';

  return (
    <div className={`rounded-xl border p-4 transition ${colorClass}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-lg">
          {relic.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-medium text-primary">{relic.name}</h4>
            <span className={`shrink-0 rounded-md px-2 py-0.5 text-[9px] font-medium tracking-tight ${
              relic.tier >= 3 ? 'bg-yellow-500/15 text-yellow-500' :
              relic.tier >= 2 ? 'bg-accent/15 text-accent' :
              'bg-elevated text-muted'
            }`}>
              {tierLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-secondary">{relic.description}</p>
          {relic.lore && (
            <p className="mt-1.5 text-[11px] italic text-muted">{relic.lore}</p>
          )}
        </div>
      </div>

      {relic.audioUrl && (
        <div className="mt-3">
          <AudioPlayer
            src={relic.audioUrl.startsWith('http') ? relic.audioUrl : `${API_HOST}${relic.audioUrl}`}
            label={relic.name}
          />
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 text-[9px] text-muted">
        {variant === 'generated' && <span>Auto-generated</span>}
        {variant === 'pack' && <span>Relic Pack</span>}
        {relic.created_at && (
          <span>{new Date(relic.created_at).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}
