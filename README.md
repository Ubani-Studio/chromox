# CHROMOX

Chromox is a standalone AI persona forge built around the Nebula Tone Network. It blends a fashion-tech aesthetic with a compact Ableton-inspired UI to let artists craft vocal personas, guide AI singing renders, and manipulate timbral controls from a desktop shell using Tauri.

## Stack
- **Desktop Shell:** Tauri 2 + Rust launcher
- **Frontend:** React + TypeScript + TailwindCSS + Radix primitives
- **Backend:** Node.js (Express) REST API with Kits AI provider adapter
- **AI Layers:**
  - Persona Synth Kernel (Chromatic-Core pipeline) for DSP + rendering
  - Kits AI provider adapter (pluggable interface)
  - LLM helper stubs for lyric rewriting + style-to-parameter conversion

## Features
- Persona library with cards + forge modal for storing persona artifacts
- **Voice Cloning** - Upload vocal stems, extract voice characteristics, and save voice personas
  - Deep voice analysis (pitch, formants, timbre, vibrato, etc.)
  - 256-dimensional neural voice embeddings
  - Multi-provider support (RVC, ElevenLabs, OpenAI)
  - Style-preserving synthesis with unlimited lyrics
  - See [VOICE_CLONING.md](VOICE_CLONING.md) for full documentation
- Chromox Studio panel with lyrics editor, guide vocal dropzone, style prompt, slider grid, render flow, and Ableton-inspired meter + audio monitor
- Rendering API orchestrating:
  - Upload handling + storage
  - Vocal stem + pitch/timing extraction
  - Voice characteristic analysis and cloning
  - Whisper-like transcription stub
  - LLM rewriting + tone control inference
  - Multi-provider synthesis (Kits AI, RVC, ElevenLabs, OpenAI)

## Project Structure
```
chromox/
├─ backend/
│  ├─ src/
│  │  ├─ routes/ (personas, render, llm)
│  │  ├─ services/
│  │  │  ├─ provider/ (Kits AI adapter)
│  │  │  ├─ dsp stubs, llm helper, render pipeline
│  │  ├─ config.ts, index.ts, types.ts
│  └─ package.json, tsconfig.json
├─ src/ (React app)
│  ├─ components/ (library, studio, sliders, modal, meter, etc.)
│  ├─ lib/api.ts
│  ├─ types.ts, App.tsx, main.tsx, styles.css
├─ src-tauri/ (Rust launcher + config)
├─ package.json, tsconfig*, tailwind.config.js, vite.config.ts
└─ README.md
```

## Getting Started
### 1. Install dependencies
```bash
cd chromox
npm install
(cd backend && npm install)
cargo install tauri-cli # if not already installed
```

### 2. Environment
```bash
# .env (root or exported before running backend)
CHROMOX_PORT=4414

# Voice Cloning Providers (optional - falls back to demo mode without keys)
KITS_AI_API_KEY=demo-key        # Kits AI singing synthesis
ELEVENLABS_API_KEY=demo-key     # ElevenLabs voice cloning
OPENAI_API_KEY=demo-key         # OpenAI voice synthesis
RVC_PATH=/opt/RVC               # Path to RVC installation (optional)

# Guide Intelligence / CLAP embeddings
CLAP_API_URL=http://localhost:5011/embed/audio
# CLAP_API_KEY=optional-shared-secret  # matches backend/clap_service CLAP_SHARED_SECRET

# LLM for lyric rewriting
LLM_API_KEY=demo-llm
```
With `demo-key`, providers fall back to mock synthesis so you can test without API keys.

### 3. Run services
Start the backend API:
```bash
cd backend
npm run dev
```

Boot the CLAP embedding microservice (optional but recommended for guide intelligence):
```bash
cd backend/clap_service
uvicorn server:app --port 5011 --reload
```

Run the Tauri shell + frontend:
```bash
cd ..
npm run tauri
```
Or run the web dev server alone:
```bash
npm run dev
```

### 4. Build for production
```bash
cd backend && npm run build
cd .. && npm run build && npm run tauri:build
```

## API Overview
- `POST /api/personas` — create persona artifact
- `GET /api/personas` — list personas
- `GET /api/personas/:id` — inspect persona
- `POST /api/voice-clone/analyze` — analyze vocal stem and extract voice profile
- `POST /api/voice-clone/create-persona` — create cloned voice persona from vocal stem
- `POST /api/voice-clone/train/:id` — add training samples to improve clone fidelity
- `POST /api/voice-clone/calibrate/:id` — recalibrate voice model (detect outliers, optimize weights)
- `GET /api/voice-clone/training-status/:id` — get training samples and fidelity score
- `DELETE /api/voice-clone/sample/:personaId/:sampleId` — remove a training sample
- `POST /api/llm/rewrite` — rewrite lyrics via LLM stub
- `POST /api/render` — full Chromatic-Core rendering pipeline (multipart w/ optional `guide` file)

## Extending
- Implement new providers by extending `SingingProvider` and wiring into `render.ts`
- Replace DSP stubs in `services/dsp.ts` with real separation/pitch/timing engines
- Swap lyric rewriting with actual GPT/Claude calls within `services/llm.ts`
- Adjust UI theming in `tailwind.config.js` and component classes to evolve the industrial aesthetic

Chromox is intentionally compact but production-ready, inviting deeper integration of advanced DSP, LLM, and singing models as you scale the Nebula Tone Network.
