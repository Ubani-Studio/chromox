import { useState, DragEvent } from 'react';

type Props = {
  onFile: (file: File) => void;
};

export function GuideDropzone({ onFile }: Props) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      onFile(droppedFile);
    }
  }

  return (
    <div
      className={`flex h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-all ${
        dragging
          ? 'border-accent bg-accent/10'
          : file
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
          const selectedFile = (e.target as HTMLInputElement).files?.[0];
          if (selectedFile) {
            setFile(selectedFile);
            onFile(selectedFile);
          }
        };
        input.click();
      }}
    >
      {file ? (
        <div>
          <p className="text-sm font-medium text-accent">{file.name}</p>
          <p className="mt-1 text-xs text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium text-secondary">Drop guide vocal or click</p>
          <p className="mt-1 text-xs tracking-tight text-muted">WAV · MP3 · AIFF</p>
        </div>
      )}
    </div>
  );
}
