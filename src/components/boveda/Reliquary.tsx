import { useState } from 'react';
import { RelicPackSummary } from '../../types';
import { unlockRelicPack } from '../../lib/api';
import { ShieldIcon } from '../Icons';

type Props = {
  packs: RelicPackSummary[];
  onUnlock: (packId: string) => void;
};

export function Reliquary({ packs, onUnlock }: Props) {
  const [password, setPassword] = useState('');
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  async function handleUnlock(packId: string) {
    if (!password.trim()) return;
    setUnlocking(true);
    setError(null);
    try {
      await unlockRelicPack(packId, password);
      setPassword('');
      setActivePackId(null);
      onUnlock(packId);
    } catch {
      setError('Incorrect password');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldIcon size={16} className="text-accent" />
        <h3 className="text-sm font-medium tracking-tight text-secondary">
          Reliquary
        </h3>
      </div>
      <p className="text-xs text-muted">
        Password-locked sonic relic packs. Enter the correct phrase to reveal hidden artifacts.
      </p>

      <div className="space-y-3">
        {packs.map((pack) => (
          <div
            key={pack.id}
            className={`rounded-xl border p-4 transition ${
              pack.unlocked
                ? 'border-accent/30 bg-accent/5'
                : 'border-border-default bg-surface'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-primary">{pack.name}</h4>
                <p className="mt-0.5 text-xs text-muted">{pack.description}</p>
                <p className="mt-1 text-[10px] text-muted">
                  {pack.relicCount} relic{pack.relicCount !== 1 ? 's' : ''}
                </p>
              </div>
              {pack.unlocked ? (
                <span className="rounded-full bg-accent/15 px-3 py-1 text-[10px] font-medium text-accent">
                  Unlocked
                </span>
              ) : (
                <button
                  onClick={() => setActivePackId(activePackId === pack.id ? null : pack.id)}
                  className="rounded-lg border border-border-default px-3 py-1.5 text-[11px] font-medium tracking-tight text-secondary transition hover:border-border-emphasis hover:text-primary"
                >
                  {activePackId === pack.id ? 'Cancel' : 'Unlock'}
                </button>
              )}
            </div>

            {activePackId === pack.id && !pack.unlocked && (
              <div className={`mt-3 ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter password..."
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUnlock(pack.id);
                    }}
                    className="flex-1 rounded-lg border border-border-default bg-canvas px-3 py-2 text-sm text-primary placeholder-disabled focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={() => handleUnlock(pack.id)}
                    disabled={unlocking || !password.trim()}
                    className="rounded-lg bg-accent px-4 py-2 text-xs font-medium tracking-tight text-canvas transition hover:bg-accent-hover disabled:opacity-40"
                  >
                    {unlocking ? 'Checking...' : 'Submit'}
                  </button>
                </div>
                {error && (
                  <p className="mt-2 text-xs text-error">{error}</p>
                )}
              </div>
            )}
          </div>
        ))}

        {packs.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-border-default bg-surface p-8 text-center">
            <ShieldIcon className="mx-auto mb-2 text-muted" size={24} />
            <p className="text-sm text-secondary">No relic packs available</p>
          </div>
        )}
      </div>
    </div>
  );
}
