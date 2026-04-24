import { Dialog } from '@headlessui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Persona } from '../types';
import { API_HOST } from '../lib/api';

type TrainingSample = {
  id: string;
  originalName: string;
  duration: number;
  addedAt: string;
  weight: number;
  isOutlier: boolean;
};

type TrainingStatus = {
  fidelityScore: number;
  trainingVersion: number;
  lastCalibratedAt?: string;
  totalSamples: number;
  totalDuration: number;
  samples: TrainingSample[];
  outlierCount: number;
};

type Props = {
  open: boolean;
  persona: Persona | null;
  onClose: () => void;
  onUpdate: () => void;
};

export function VoiceTrainingModal({ open, persona, onClose, onUpdate }: Props) {
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!persona) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_HOST}/api/voice-clone/training-status/${persona.id}`);
      const data = await res.json();
      if (data.success) {
        setStatus(data);
      } else {
        setError(data.error || 'Failed to load training status');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [persona?.id]);

  useEffect(() => {
    if (open && persona) {
      fetchStatus();
      setSuccessMessage(null);
    }
  }, [open, persona?.id, fetchStatus]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || !persona) return;

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('vocals', file);
    });

    try {
      const res = await fetch(`${API_HOST}/api/voice-clone/train/${persona.id}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage(
          `Added ${data.samples.length} sample(s). Fidelity ${data.totalFidelityDelta > 0 ? '+' : ''}${data.totalFidelityDelta.toFixed(1)}`
        );
        await fetchStatus();
        onUpdate();
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Failed to upload samples');
    } finally {
      setUploading(false);
    }
  }

  async function handleCalibrate() {
    if (!persona) return;

    setCalibrating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`${API_HOST}/api/voice-clone/calibrate/${persona.id}`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        const msg = data.outlierCount > 0
          ? `Calibrated. Found ${data.outlierCount} outlier(s). Fidelity ${data.fidelityDelta > 0 ? '+' : ''}${data.fidelityDelta.toFixed(1)}`
          : `Calibrated. All samples consistent. Fidelity ${data.fidelityDelta > 0 ? '+' : ''}${data.fidelityDelta.toFixed(1)}`;
        setSuccessMessage(msg);
        await fetchStatus();
        onUpdate();
      } else {
        setError(data.error || 'Calibration failed');
      }
    } catch (err) {
      setError('Failed to calibrate');
    } finally {
      setCalibrating(false);
    }
  }

  async function handleRemoveSample(sampleId: string) {
    if (!persona) return;

    try {
      const res = await fetch(`${API_HOST}/api/voice-clone/sample/${persona.id}/${sampleId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage('Sample removed');
        await fetchStatus();
        onUpdate();
      } else {
        setError(data.error || 'Failed to remove sample');
      }
    } catch (err) {
      setError('Failed to remove sample');
    }
  }

  function getFidelityLabel(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Training';
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-primary/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-lg border border-border-default bg-canvas p-6 shadow-2xl">
          <Dialog.Title className="mb-4 font-display text-xl font-semibold text-primary">
            Voice Training
          </Dialog.Title>

          {persona && (
            <div className="space-y-5">
              {/* Persona Header */}
              <div className="flex items-center gap-3 border border-border-default bg-surface p-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden bg-elevated">
                  {persona.image_url ? (
                    <img
                      src={`${API_HOST}${persona.image_url}`}
                      alt={persona.name}
                      className="h-full w-full object-cover"
                      style={{
                        objectPosition: `${persona.image_focus_x ?? 50}% ${persona.image_focus_y ?? 50}%`
                      }}
                    />
                  ) : (
                    <span className="text-lg font-semibold text-primary">
                      {persona.name.charAt(0)}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-medium text-primary">{persona.name}</h3>
                  <p className="text-xs text-muted">Cloned Voice</p>
                </div>
              </div>

              {/* Status Messages */}
              {error && (
                <div className="border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-primary">
                  {error}
                </div>
              )}
              {successMessage && (
                <div className="border border-border-emphasis bg-surface px-4 py-2 text-sm text-primary">
                  {successMessage}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin border-2 border-primary border-t-transparent" />
                </div>
              ) : status ? (
                <>
                  {/* Fidelity Score */}
                  <div className="border border-border-default bg-surface p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs tracking-tight text-muted">Fidelity Score</span>
                      <span className="text-sm font-medium text-primary">
                        {getFidelityLabel(status.fidelityScore)}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-semibold text-primary">
                        {status.fidelityScore}
                      </span>
                      <span className="text-sm text-muted">/100</span>
                    </div>
                    <div className="mt-3 h-1 bg-elevated">
                      <div
                        className="h-1 bg-primary transition-all"
                        style={{ width: `${status.fidelityScore}%` }}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-primary">{status.totalSamples}</span> sample{status.totalSamples !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-primary">{status.totalDuration.toFixed(1)}s</span> audio
                      </span>
                      <span className="flex items-center gap-1">
                        v<span className="font-medium text-primary">{status.trainingVersion}</span>
                      </span>
                      {status.outlierCount > 0 && (
                        <span className="text-secondary">
                          {status.outlierCount} outlier{status.outlierCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[10px] text-muted">
                      Add more consistent samples to increase fidelity. Calibrate to optimize weights.
                    </p>
                  </div>

                  {/* Training Samples List */}
                  {status.samples.length > 0 && (
                    <div className="border border-border-default bg-surface p-4">
                      <h4 className="mb-3 text-xs tracking-tight text-muted">Training Samples</h4>
                      <div className="max-h-40 space-y-2 overflow-y-auto">
                        {status.samples.map((sample) => (
                          <div
                            key={sample.id}
                            className={`flex items-center justify-between border px-3 py-2 ${
                              sample.isOutlier
                                ? 'border-border-emphasis bg-elevated'
                                : 'border-border-subtle bg-canvas'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-primary">{sample.originalName}</p>
                              <div className="flex items-center gap-2 text-xs text-muted">
                                <span>{sample.duration.toFixed(1)}s</span>
                                <span>weight: {(sample.weight * 100).toFixed(0)}%</span>
                                {sample.isOutlier && (
                                  <span className="text-secondary">outlier</span>
                                )}
                              </div>
                            </div>
                            {status.samples.length > 1 && (
                              <button
                                onClick={() => handleRemoveSample(sample.id)}
                                className="ml-2 px-2 py-1 text-xs text-muted transition hover:bg-elevated hover:text-primary"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add Samples Dropzone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      handleUpload(e.dataTransfer.files);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`cursor-pointer border-2 border-dashed p-6 text-center transition ${
                      isDragOver
                        ? 'border-primary bg-elevated'
                        : 'border-border-default hover:border-primary'
                    }`}
                  >
                    {uploading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-4 w-4 animate-spin border-2 border-primary border-t-transparent" />
                        <span className="text-sm text-secondary">Uploading...</span>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-secondary">Add Training Samples</p>
                        <p className="mt-1 text-xs text-muted">
                          Drop audio files here or click to browse (up to 5)
                        </p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files)}
                  />

                  {/* Calibrate Button */}
                  {status.totalSamples >= 2 && (
                    <button
                      onClick={handleCalibrate}
                      disabled={calibrating}
                      className="w-full border border-border-default bg-surface py-3 text-sm font-medium tracking-tight text-primary transition hover:bg-elevated hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {calibrating ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="h-4 w-4 animate-spin border-2 border-primary border-t-transparent" />
                          Calibrating...
                        </span>
                      ) : (
                        <>Calibrate Voice Model</>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <p className="py-8 text-center text-sm text-muted">
                  No training data found for this persona.
                </p>
              )}

              {/* Close Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={onClose}
                  className="border border-border-default px-4 py-2 text-xs font-medium tracking-tight text-secondary transition hover:border-primary hover:text-primary"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
