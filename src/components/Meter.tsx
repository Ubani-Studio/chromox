import { useEffect, useState, useRef } from 'react';
import { API_HOST } from '../lib/api';

type MeterProps = {
  active?: boolean;
};

type ProgressEvent = {
  stage: string;
  percent: number;
  detail?: string;
};

export function Meter({ active }: MeterProps) {
  const [progress, setProgress] = useState(0);
  const [detail, setDetail] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      setDetail('');
      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    // Connect to SSE endpoint
    const es = new EventSource(`${API_HOST}/api/render/progress`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        setProgress(data.percent / 100);
        if (data.detail) setDetail(data.detail);
      } catch {}
    };

    es.onerror = () => {
      // Connection lost — don't crash, just keep showing last state
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [active]);

  const pct = Math.max(active ? 3 : 0, Math.round(progress * 100));

  return (
    <div className="space-y-1">
      <div className="relative h-3 w-full overflow-hidden rounded-full border border-border-default bg-canvas">
        <div
          className="relative z-10 h-full rounded-full bg-accent transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {active && detail && (
        <p className="text-[10px] text-muted">{detail}</p>
      )}
    </div>
  );
}
