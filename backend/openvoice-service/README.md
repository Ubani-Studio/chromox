# chromox-openvoice

Python microservice for OpenVoice V2. Sits next to the RVC service and
provides real speaker-embedding fusion so a percentage-slider blend of two
voices produces a single fused speaker, not a chorus.

**Status: scaffold.** The service defines routes and a `/health` that reports
`scaffold: true`. `/synthesize` and `/blend_synthesize` return `501 Not Implemented`.
Bringing it online is the gated Phase 2 heavy step.

See `/home/sphinxy/Ibis - Phase 2 Voicehybrids.md` for the full plan.

## Ports

- OpenVoice: `5013` (override via `OPENVOICE_PORT`)
- RVC (for reference): `5012`

## Heavy step (gated)

```bash
cd chromox/backend/openvoice-service
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn python-multipart torch --extra-index-url https://download.pytorch.org/whl/cu121
pip install git+https://github.com/myshell-ai/OpenVoice.git
# download V2 checkpoints (~600 MB) into ./checkpoints_v2/
python main.py
```

Do not run this yet. Wait for explicit go-ahead.
