import { useEffect, useRef, useState, useId } from 'react';
import { useAudioContext } from '../contexts/AudioContext';
import { PlayIcon, PauseIcon } from './Icons';

type Props = {
  src?: string;
  label?: string;
};

export function AudioPlayer({ src, label = 'Playback' }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const playerId = useId();
  const { currentlyPlayingId, stopOthers } = useAudioContext();

  // Stop this player if another one starts playing
  useEffect(() => {
    if (currentlyPlayingId && currentlyPlayingId !== playerId && playing) {
      if (audioRef.current) {
        audioRef.current.pause();
        setPlaying(false);
      }
    }
  }, [currentlyPlayingId, playerId, playing]);

  useEffect(() => {
    setError(false);
    if (audioRef.current && src) {
      audioRef.current.load();
    }
    setProgress(0);
    setDuration(0);
    setPlaying(false);
  }, [src]);

  function togglePlayback() {
    if (!audioRef.current || !src) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      stopOthers(playerId); // Stop all other players
      audioRef.current
        .play()
        .then(() => setPlaying(true))
        .catch((err) => {
          console.error('Audio playback failed:', err, 'src:', src);
          setPlaying(false);
          setError(true);
        });
    }
  }

  function formatTime(value: number) {
    if (!value || Number.isNaN(value)) return '0:00';
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioRef.current || !duration) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - bounds.left;
    const percent = clickX / bounds.width;
    const newTime = percent * duration;
    audioRef.current.currentTime = newTime;
    setProgress(newTime);
  }

  return (
    <div className="rounded-2xl border border-border-default bg-canvas p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlayback}
          disabled={!src}
          className={`flex h-10 w-10 items-center justify-center rounded-full border ${
            playing ? 'border-accent text-accent' : 'border-border-emphasis text-secondary'
          } disabled:cursor-not-allowed disabled:opacity-30`}
        >
          {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
        </button>
        <div className="flex-1">
          <div className="flex items-center justify-between text-[11px] tracking-tight text-muted">
            <span>{label}</span>
            <span>
              {formatTime(progress)} / {formatTime(duration)}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 w-full cursor-pointer rounded-full bg-elevated transition-all hover:h-2"
            onClick={handleProgressClick}
          >
            <div
              className="pointer-events-none h-full rounded-full bg-accent"
              style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>
      <audio
        ref={audioRef}
        className="hidden"
        onTimeUpdate={() => {
          if (audioRef.current) {
            setProgress(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
            setError(false);
          }
        }}
        onEnded={() => setPlaying(false)}
        onError={(e) => {
          console.error('Audio element error:', e, 'src:', src);
          setError(true);
          setPlaying(false);
        }}
        crossOrigin="anonymous"
        src={src || undefined}
      />

    </div>
  );
}
