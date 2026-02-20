# Chromox Voice Training Status

> Last updated: 2026-02-20 15:06 UTC

## CLAUDE: READ THIS ON STARTUP

So-VITS-SVC training is **paused at epoch ~1338** (target: 20,000). When the user opens Chromox, offer this:

> "So-VITS voice training is paused at epoch 1338 out of 20,000. Want me to resume it in the background? (batch_size=3 for quiet fans, ~17s/epoch). You can keep working while it trains."

If they say yes:
```bash
cd ~/chromox/backend/so_vits_svc && nohup .venv/bin/python train.py -c configs/config.json -m 44k > /tmp/sovits_train.log 2>&1 &
```

If they want full speed (louder fans), change batch_size back to 6 first:
```bash
# In configs/config.json, change "batch_size": 3 to "batch_size": 6
# Then run the training command above
```

---

## So-VITS-SVC 4.1 Training

**Status:** PAUSED at epoch ~1338 (stopped 2026-02-20 15:06 UTC)
**Resume:** `cd ~/chromox/backend/so_vits_svc && nohup .venv/bin/python train.py -c configs/config.json -m 44k > /tmp/sovits_train.log 2>&1 &`

| Field | Value |
|-------|-------|
| Current epoch | ~1338 (paused) |
| Target epochs | 20,000 |
| Last good checkpoint | G_4000.pth (epoch 1334) |
| Next checkpoint | G_4800.pth (epoch ~1600, saves every 800) |
| Epoch speed | ~17s/epoch (batch=3, quiet mode) |
| ETA to 20k | ~88 hours from epoch 1338 (batch=3) |
| GPU | RTX 4090 Laptop (16GB VRAM) |
| Batch size | 3 (reduced from 6 for quieter fans) |
| Learning rate | 0.0001 (decay 0.999875) |
| Speech encoder | vec768l12 (ContentVec 768-dim) |
| F0 predictor | RMVPE |
| Config | `configs/config.json` |
| Log | `logs/44k/train.log` |
| TensorBoard | `logs/44k/events.out.tfevents.*` |

### Training Data (expanded 2026-02-20)
- **Source:** 18 guide samples (WAV+MP3), 18.4 min total
- **Processed:** 107 clips sliced at -35dB → resampled to 127 WAVs, 12.4 min
- **Previous:** 20 clips, 2.5 min (5x increase)
- **Dataset:** `dataset/44k/persona/` (127 WAVs + 1016 feature files)
- **Prep script:** `prepare_training_data.py`

### Checkpoints Available
| Checkpoint | Epoch | Notes |
|-----------|-------|-------|
| G_0.pth | 0 | Pretrained base |
| G_2400.pth | 800 | Early training (old 2.5min data) |
| G_3200.pth | 1067 | Old data |
| G_4000.pth | 1334 | Last before crash + data expansion |
| G_4800.pth | ~~crashed~~ | Was corrupted, deleted. Will be recreated |

### Corrupted Checkpoint (fixed)
- `G_4800.pth` was 325MB (expected 599MB) — half-written during a crash on 2026-02-20 ~10:29
- Deleted. Training resumed from `G_4000.pth` with expanded dataset.

### Quality Milestones (estimated)
| Epoch | ~ Hours from now | Expected quality |
|-------|-----------------|-----------------|
| ~1600 | 0.7 | First checkpoint with new data |
| ~2667 | 4 | Noticeably better pitch accuracy |
| ~4000 | 8 | Good for most use cases |
| ~6667 | 16 | Near studio quality |
| 20000 | 57 | Full studio target |

### How to Monitor
```bash
# Training progress
tail -f ~/chromox/backend/so_vits_svc/logs/44k/train.log

# Check if still running
ps aux | grep train.py

# VRAM usage
nvidia-smi

# TensorBoard (optional)
cd ~/chromox/backend/so_vits_svc && .venv/bin/tensorboard --logdir logs/44k
```

### How to Resume After Crash
```bash
cd ~/chromox/backend/so_vits_svc
# Training auto-resumes from latest checkpoint in logs/44k/
.venv/bin/python train.py -c configs/config.json -m 44k
```

### How to Test a Checkpoint
```bash
# Stop training first (or use a different GPU)
# Start the service (it auto-loads latest G_*.pth)
cd ~/chromox/backend/so_vits_svc
.venv/bin/python -m uvicorn serve:app --host 0.0.0.0 --port 5014

# Test conversion
curl -X POST http://localhost:5014/convert \
  -F "audio=@/path/to/guide.wav" \
  -F "pitch_shift=0" \
  -F "f0_predictor=rmvpe" \
  -o output.wav
```

---

## DDSP-SVC Training

**Status:** COMPLETE (35k steps, no further training planned)

| Field | Value |
|-------|-------|
| Steps trained | 35,190 |
| Latest checkpoint | model_35000.pt |
| Loss | 0.054-0.081 (converged) |
| Experiment dir | `exp/reflow-persona/` |
| Training data | Same 107 clips copied to `data/train/audio/` |

### Note
DDSP was trained on the old 2.5min data to 35k steps. Could benefit from retraining on the expanded 12.4min dataset, but So-VITS is the priority since it has better voice similarity potential.

To retrain DDSP on new data:
```bash
cd ~/chromox/backend/ddsp_svc
# Preprocess new data first
.venv/bin/python preprocess.py -c configs/reflow.yaml
# Then train
.venv/bin/python train_reflow.py -c configs/reflow.yaml
```

---

## RVC Service

**Status:** READY (no training needed — uses spectral transfer, not neural vocoder)
- HuBERT: loaded from `rvc_install/Mangio-RVC-Fork/hubert_base.pt`
- RMVPE: available
- 1 trained model: `persona_d5ed82b8-98ae-4d8a-ad30-e4fea597d40a.pth`

---

## Post-Processing Pipeline (committed 2026-02-20)

Added `restoreVocal()` in `effectsProcessor.ts`:
- FFT denoise (30dB broadband)
- De-click (vocoder transient artifacts)
- Presence EQ (+5.5dB at 3.5kHz)
- Air shelf (+3.5dB at 10kHz+)
- De-ess safety (-1.5dB at 7.5kHz+)

Measured improvements on raw SVC output:
- HF recovery: 0.51x → 0.68x (DDSP), 0.59x → 0.82x (So-VITS)
- SNR: marginal (~1dB) — vocoder noise is structured, not white
- Pitch accuracy: unchanged (model problem, not post-processing)

---

## Service Ports
| Service | Port | Venv |
|---------|------|------|
| DDSP-SVC | 5013 | `backend/ddsp_svc/.venv` |
| So-VITS-SVC | 5014 | `backend/so_vits_svc/.venv` |
| RVC | 5012 | `backend/rvc_service/.venv` |
| Chromox backend | 4414 | Node.js |

## Waterfall Order
DDSP → So-VITS → RVC → ElevenLabs → Fish → CAMB → MiniMax → Kits → Local FFmpeg
