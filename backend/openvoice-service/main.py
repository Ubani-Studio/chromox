"""
OpenVoice V2 microservice for Chromox.

This is the scaffold. The model is not loaded, weights are not downloaded,
and the synthesis routes return 501 Not Implemented. Bringing this service
online is the Phase 2 heavy step, deliberately gated so the TS side can be
wired up end-to-end without paying the install cost yet.

See: /home/sphinxy/Ibis - Phase 2 Voicehybrids.md
"""
from __future__ import annotations

import os
from typing import List

try:
    # FastAPI is imported lazily-friendly so `python main.py --check` can
    # be run without deps installed, which matters for the scaffold phase.
    from fastapi import FastAPI, HTTPException, UploadFile, File
    from pydantic import BaseModel
    import uvicorn
except ImportError:  # pragma: no cover
    FastAPI = None  # type: ignore[assignment]
    HTTPException = Exception  # type: ignore[assignment]
    UploadFile = None  # type: ignore[assignment]
    File = None  # type: ignore[assignment]
    BaseModel = object  # type: ignore[assignment]
    uvicorn = None  # type: ignore[assignment]


MODEL_LOADED = False  # Flipped to True once OpenVoice V2 checkpoints load.
PORT = int(os.environ.get("OPENVOICE_PORT", "5013"))


if FastAPI is not None:
    app = FastAPI(title="chromox-openvoice", version="0.1.0-scaffold")

    class ToneColorWeight(BaseModel):
        tone_color_path: str
        weight: float

    class SynthesizeRequest(BaseModel):
        text: str
        base_speaker_id: str = "en-default"
        tone_color_path: str

    class BlendSynthesizeRequest(BaseModel):
        text: str
        base_speaker_id: str = "en-default"
        tone_colors: List[ToneColorWeight]

    @app.get("/health")
    def health() -> dict:
        return {
            "status": "ok",
            "model_loaded": MODEL_LOADED,
            "scaffold": True,
            "note": "Phase 2 scaffold. Deps + weights not installed yet.",
        }

    @app.post("/encode_tone_color")
    async def encode_tone_color(audio: UploadFile = File(...)) -> dict:
        """Accept a wav, encode to a tone-color tensor, cache by sha256,
        return the cached path. Not implemented until heavy step."""
        raise HTTPException(status_code=501, detail="scaffold: encode_tone_color not wired")

    @app.post("/synthesize")
    async def synthesize(_req: SynthesizeRequest) -> dict:
        """Single-voice synthesis with a given tone color. Not implemented."""
        raise HTTPException(status_code=501, detail="scaffold: synthesize not wired")

    @app.post("/blend_synthesize")
    async def blend_synthesize(_req: BlendSynthesizeRequest) -> dict:
        """Linearly interpolate N tone-color tensors at the supplied weights,
        then decode once. The whole point of Phase 2. Not implemented yet."""
        raise HTTPException(status_code=501, detail="scaffold: blend_synthesize not wired")


def main() -> None:
    if FastAPI is None or uvicorn is None:
        print(
            "[openvoice-service] fastapi/uvicorn not installed. "
            "This is the scaffold. Run the Phase 2 heavy step (venv + install + weights) "
            "before starting the service."
        )
        return
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")


if __name__ == "__main__":
    main()
