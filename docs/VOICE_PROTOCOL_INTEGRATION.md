# Voice Royalty Protocol Integration Map

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Phase 1: Core Provenance** | ✅ Complete | |
| Mmuo provenance registration | ✅ | `POST /api/voice-clone/register-provenance` |
| o8 VoiceDNA creation API | ✅ | `POST /api/identity/create` |
| Boveda o8 client | ✅ | `packages/rights/src/o8-client.ts` |
| **Phase 2: Hybrid Synthesis** | ✅ Complete | |
| Hybrid synthesis endpoint | ✅ | `POST /api/voice-clone/synthesize-hybrid` |
| Voice blending service | ✅ | `services/hybridSynthesis.ts` |
| Usage tracking | ✅ | `services/usageTracking.ts` |
| Usage API | ✅ | `GET/POST /api/usage/*` |
| **Phase 3: Imperium Settlement** | 🔲 Pending | |
| VoiceRegistry contract | 🔲 | Smart contract for voice assets |
| VoicePayoutModule | 🔲 | On-chain royalty distribution |
| Ledger-Imperium bridge | 🔲 | Settlement automation |
| **Shared Types** | ✅ Complete | |
| @chromox/voice-protocol | ✅ | `packages/voice-protocol/` |

## Overview

This document maps the integration between:
- **Mmuo** (Voice synthesis + marketplace)
- **o8** (Provenance + identity)
- **Boveda** (Character + rights)
- **Imperium** (On-chain royalty settlement)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VOICE ROYALTY PROTOCOL                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐           │
│  │   VÒXĀ   │────▶│    o8    │────▶│  BOVEDA  │────▶│ IMPERIUM │           │
│  │ Synthesis│     │Provenance│     │  Rights  │     │ Payments │           │
│  └──────────┘     └──────────┘     └──────────┘     └──────────┘           │
│       │                │                 │                │                 │
│       ▼                ▼                 ▼                ▼                 │
│  Voice Models    Voice DNA +      License Terms    On-chain USDC           │
│  + Detection     Fingerprint      + Royalty %      Settlement              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Mmuo → o8: Voice Registration

When a voice actor registers their voice on Mmuo, we stamp it with o8 provenance.

### Data Flow

```typescript
// Mmuo VoiceProfile → o8 VoiceDNA mapping
interface MmuoToO8Mapping {
  // Mmuo fields
  mmuo_persona_id: string;
  mmuo_embedding: number[];           // 256-dim from voiceAnalysis.ts
  mmuo_characteristics: {
    pitchRange: { min: number; max: number; mean: number };
    formants: number[];
    breathiness: number;
    brightness: number;
    vibratoRate: number;
  };
  mmuo_accent: AccentCategory;        // From voiceDetection.ts
  mmuo_voice_type: 'speech' | 'singing' | 'mixed';

  // Maps to o8 VoiceDNA (types.v2.ts)
  o8_voice_dna: {
    source: 'chromox';
    embedding: number[];              // Same 256-dim
    pitch: {
      range: 'bass' | 'baritone' | 'tenor' | 'alto' | 'soprano';
      average_hz: number;             // From pitchRange.mean
      variance: number;
    };
    timbre: {
      qualities: string[];            // ['warm', 'bright'] from brightness/breathiness
      formant_signature: number[];    // From formants
    };
    speech_patterns: string[];        // From accent detection
    rhythmic_quality: string;
    emotional_resonance: string;
    provider_ids: {
      chromox: string;                // mmuo_persona_id
      rvc?: string;
      elevenlabs?: string;
    };
  };
}
```

### API Endpoint (New)

```typescript
// POST /api/voice-clone/register-provenance
interface RegisterProvenanceRequest {
  persona_id: string;
  owner_wallet: string;              // Ethereum wallet for verification
  licensing_terms: {
    training_rights: boolean;
    derivative_rights: boolean;      // Allow hybrids
    commercial_rights: boolean;
    revenue_split: number;           // 0-1 (e.g., 0.4 = 40%)
  };
}

interface RegisterProvenanceResponse {
  o8_identity_id: string;
  ipfs_cid: string;
  voice_fingerprint: string;         // SHA-256 of reference audio
}
```

### Implementation Location

```
/home/sphinxy/chromox/backend/src/routes/voiceClone.ts
  → Add: POST /register-provenance

/home/sphinxy/chromox/backend/src/services/provenanceService.ts (NEW)
  → Calls o8 API to create CreatorIdentity with VoiceDNA
```

---

## 2. o8 → Boveda: Voice Licensing

Boveda characters reference o8-verified voices for synthesis.

### Data Flow

```typescript
// Boveda VoiceProfile links to o8 identity
interface BovedaVoiceProfile {
  id: string;
  characterId: string;

  // o8 provenance link
  o8_identity_id: string;            // Links to verified voice owner
  o8_voice_dna_cid: string;          // IPFS CID of voice DNA

  // Provider routing (populated from o8)
  providerVoiceId: string;
  provider: 'chromox' | 'elevenlabs' | 'rvc';

  // Licensing (fetched from o8)
  license: {
    owner_wallet: string;
    training_rights: boolean;
    derivative_rights: boolean;
    commercial_rights: boolean;
    revenue_split: number;
  };
}
```

### Boveda License Validation (Existing)

```typescript
// packages/rights/src/index.ts - Already exists!
// Add: Fetch license terms from o8

import { getO8License } from './o8-client';

export async function validateVoiceUsage(
  o8_identity_id: string,
  action: 'synthesize' | 'train' | 'create_hybrid'
): Promise<ValidationResult> {
  const o8License = await getO8License(o8_identity_id);

  switch (action) {
    case 'synthesize':
      return { allowed: o8License.commercial_rights, reason: '...' };
    case 'train':
      return { allowed: o8License.training_rights, reason: '...' };
    case 'create_hybrid':
      return { allowed: o8License.derivative_rights, reason: '...' };
  }
}
```

### Implementation Location

```
/home/sphinxy/boveda/packages/rights/src/o8-client.ts (NEW)
  → Fetches license terms from o8 API

/home/sphinxy/boveda/packages/voice/src/providers/chromox.ts
  → Update to validate license before synthesis
```

---

## 3. Boveda → Mmuo: Synthesis Requests

When Boveda generates audio, it routes through Mmuo for synthesis.

### Data Flow

```typescript
// Boveda requests synthesis from Mmuo
interface SynthesisRequest {
  // Character context
  character_id: string;
  genome_id: string;

  // Voice selection
  base_voice_ids: string[];          // One or more o8 voice IDs
  hybrid_weights?: number[];         // For blended voices

  // Content
  text: string;
  emotion: string;

  // Auto-detect routing hints
  voice_type_hint?: 'speech' | 'singing';
  accent_preserve?: boolean;         // Lock diaspora accent
}

// Mmuo returns
interface SynthesisResponse {
  audio_url: string;
  duration_seconds: number;

  // Usage tracking for royalties
  usage_breakdown: {
    voice_id: string;
    seconds_used: number;
    rate_per_second: number;         // From o8 license
  }[];

  // Provenance stamp
  provenance: {
    o8_declaration_id: string;
    audio_fingerprint: string;
  };
}
```

### Hybrid Voice Generation (New Mmuo Feature)

```typescript
// POST /api/voice-clone/synthesize-hybrid
interface HybridSynthesisRequest {
  voices: {
    o8_identity_id: string;
    weight: number;                  // 0-1, must sum to 1
  }[];
  text: string;
  accent_lock?: string;              // e.g., 'jamaican-patois'
  routing_mode: 'auto' | 'rvc' | 'camb-ai' | 'elevenlabs';
}

// Implementation uses Mmuo's auto-detect to route to best provider
// RVC for singing hybrids, CAMB.AI for speech with accent lock
```

### Implementation Location

```
/home/sphinxy/chromox/backend/src/routes/voiceClone.ts
  → Add: POST /synthesize-hybrid

/home/sphinxy/chromox/backend/src/services/hybridSynthesis.ts (NEW)
  → Blends multiple voice embeddings
  → Routes to optimal provider based on detection
```

---

## 4. Boveda Ledger → Imperium: Royalty Settlement

Usage events from Boveda's ledger trigger Imperium on-chain payouts.

### Data Flow

```typescript
// Boveda Ledger UsageEvent → Imperium Payout
interface LedgerToImperiumMapping {
  // Boveda event
  boveda_event: {
    id: string;
    eventType: 'VOICE_SYNTHESIS';
    voiceProfileId: string;
    seconds: number;
    revenueCents: number;
    createdAt: Date;
  };

  // Maps to Imperium
  imperium_payout: {
    // Voice is registered like a "song" in Imperium
    voiceAssetId: number;            // Imperium registry ID

    // Splits configured from o8 license
    splits: {
      recipient: string;             // Wallet address
      percentage: number;            // Basis points (4000 = 40%)
      role: string;                  // 'voice_actor' | 'creator' | 'platform' | 'o8_protocol'
    }[];

    // Payout amount (USDC)
    amountCents: number;
  };
}
```

### Imperium Voice Asset Registry (New)

Extend Imperium's SongRegistry to support voice assets:

```solidity
// New: VoiceRegistry.sol (extends pattern from SongRegistry)
struct VoiceAsset {
    string o8IdentityId;           // Links to o8 provenance
    string voiceFingerprint;       // SHA-256 of reference audio
    address primaryOwner;          // Voice actor wallet
    bool verified;                 // o8 verification status
    uint256 ratePerSecondCents;    // Licensing rate
}

// Events
event VoiceAssetRegistered(uint256 indexed assetId, string o8IdentityId, address owner);
event VoiceSynthesisRoyalty(uint256 indexed assetId, uint256 seconds, uint256 amountCents);
```

### Settlement Flow

```
1. Boveda synthesizes audio (60 seconds)
2. Boveda Ledger logs UsageEvent with voice breakdown
3. Monthly settlement job runs
4. For each voice used:
   a. Fetch o8 license → get revenue_split
   b. Fetch Imperium VoiceAsset → get wallet addresses
   c. Call Imperium.PayoutModule.distributeRoyalty()
5. USDC lands in voice actor wallet instantly
```

### Implementation Location

```
/home/sphinxy/imperium/contracts/VoiceRegistry.sol (NEW)
  → Voice asset registration

/home/sphinxy/imperium/contracts/VoicePayoutModule.sol (NEW)
  → Voice-specific payout logic

/home/sphinxy/boveda/packages/ledger/src/imperium-bridge.ts (NEW)
  → Connects ledger settlements to Imperium contracts
```

---

## 5. Integration APIs

### Shared Types (New Package)

Create `@violet-sphinx/voice-protocol` shared package:

```typescript
// packages/voice-protocol/src/types.ts

export interface VoiceAsset {
  id: string;
  o8_identity_id: string;
  owner_wallet: string;

  // Provenance
  voice_fingerprint: string;
  ipfs_cid: string;

  // Licensing
  rate_per_second_cents: number;
  licensing_terms: LicensingTerms;

  // Routing
  preferred_provider: 'chromox' | 'rvc' | 'camb-ai' | 'elevenlabs';
  accent_category?: AccentCategory;
  voice_type: 'speech' | 'singing' | 'mixed';
}

export interface SynthesisUsage {
  voice_asset_id: string;
  seconds: number;
  provider_used: string;
  timestamp: string;

  // For hybrid
  blend_weight?: number;
}

export interface RoyaltyEvent {
  usage_id: string;
  voice_asset_id: string;
  amount_cents: number;

  // Splits
  voice_actor_cents: number;
  creator_cents: number;
  platform_cents: number;
  o8_protocol_cents: number;

  // On-chain reference
  imperium_tx_hash?: string;
}
```

---

## 6. Implementation Phases

### Phase 1: Core Integration (Week 1-2)

1. **Mmuo**: Add `POST /register-provenance` endpoint
2. **o8**: Implement VoiceDNA creation from Mmuo data
3. **Boveda**: Add o8 license fetching to rights package
4. **Test**: Register voice → verify provenance

### Phase 2: Synthesis Pipeline (Week 3-4)

1. **Mmuo**: Add `POST /synthesize-hybrid` endpoint
2. **Mmuo**: Implement voice blending with accent lock
3. **Boveda**: Update ChromoxProvider to use new endpoint
4. **Test**: Character synthesis → usage tracking

### Phase 3: Royalty Settlement (Week 5-6)

1. **Imperium**: Deploy VoiceRegistry contract
2. **Imperium**: Deploy VoicePayoutModule contract
3. **Boveda**: Build ledger → Imperium bridge
4. **Test**: End-to-end synthesis → USDC payout

### Phase 4: Marketplace (Week 7-8)

1. **Mmuo**: Voice marketplace UI
2. **Mmuo**: Browse licensed voices
3. **Mmuo**: Hybrid voice creator
4. **Test**: Full creator → consumer flow

---

## 7. API Contracts

### o8 API (Required Endpoints)

```
POST /api/identity/create
  → Creates CreatorIdentity with VoiceDNA

GET /api/identity/:id
  → Fetches identity with licensing terms

POST /api/declaration/stamp
  → Stamps synthesis output with provenance
```

### Imperium API (Required Endpoints)

```
POST /api/voice/register
  → Registers voice asset on-chain

POST /api/voice/:id/configure-splits
  → Sets up royalty splits

POST /api/voice/:id/payout
  → Triggers royalty distribution
```

---

## 8. Security Considerations

1. **Wallet Verification**: Voice actors must sign message to prove wallet ownership
2. **License Validation**: Every synthesis must validate license before proceeding
3. **Rate Limiting**: Prevent abuse of synthesis endpoints
4. **Audit Trail**: All usage events logged immutably
5. **Split Locking**: Once splits are locked, cannot be changed (protects voice actors)

---

## 9. Revenue Model

| Party | Share | Justification |
|-------|-------|---------------|
| Voice Actor | 40-60% | They own the voice |
| Creator (using voice) | 20-30% | They create content |
| Mmuo Platform | 10-15% | Synthesis infrastructure |
| Boveda Platform | 5-10% | Character + rights |
| o8 Protocol | 5% | Provenance infrastructure |

*Splits configurable per voice asset*

---

## 10. File References

| Project | Key Files |
|---------|-----------|
| **Mmuo** | `backend/src/services/voiceAnalysis.ts`, `backend/src/services/voiceDetection.ts` |
| **o8** | `src/core/types.v2.ts` (VoiceDNA, LicensingTerms, ChromoxToO8Mapping) |
| **Boveda** | `packages/rights/src/index.ts`, `packages/ledger/src/index.ts`, `packages/voice/src/providers/chromox.ts` |
| **Imperium** | `contracts/RoyaltySplit.sol`, `contracts/PayoutModule.sol` |

---

## 11. Implemented Endpoints (Mmuo)

### Voice Clone API (`/api/voice-clone`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/detect` | POST | Quick voice type/accent detection |
| `/analyze` | POST | Full voice profile analysis |
| `/create-persona` | POST | Create cloned persona with auto-routing |
| `/retrain/:personaId` | POST | Retrain with additional samples |
| `/register-provenance` | POST | Register voice with o8 protocol |
| `/validate-usage` | POST | Validate voice usage rights |
| `/synthesize-hybrid` | POST | Synthesize hybrid voice blend |
| `/preview-hybrid` | POST | Preview blend without synthesizing |

### Usage Tracking API (`/api/usage`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/stats` | GET | Overall usage statistics |
| `/voice/:personaId` | GET | Per-voice usage history |
| `/pending` | GET | Pending settlement events |
| `/settlement/:month` | GET | Monthly settlement summary |
| `/prepare-batch` | POST | Prepare settlement batch |
| `/confirm-settlement` | POST | Confirm with Imperium tx hash |
| `/imperium-payload` | POST | Generate on-chain payload |

---

## 12. Implemented Services (Mmuo)

### `provenanceService.ts`
- `registerVoiceProvenance()` - Register voice with o8
- `mapToVoiceDNA()` - Convert Mmuo profile to o8 VoiceDNA
- `generateAudioFingerprint()` - SHA-256 fingerprint
- `validateVoiceUsage()` - Check o8 license

### `hybridSynthesis.ts`
- `synthesizeHybrid()` - Main hybrid synthesis function
- `createBlendedProfile()` - Blend multiple voice embeddings
- `determineOptimalProvider()` - Auto-route based on voice type
- `calculateUsageBreakdown()` - Per-voice royalty calculation
- `validateHybridLicenses()` - Check derivative rights

### `usageTracking.ts`
- `recordSingleUsage()` - Track single voice synthesis
- `recordHybridUsage()` - Track hybrid synthesis
- `getVoiceUsage()` - Query per-voice history
- `getPendingSettlements()` - Get unsettled events
- `getMonthlySettlement()` - Monthly aggregation
- `markEventsForSettlement()` - Batch preparation
- `markEventsSettled()` - Confirm with tx hash

---

## 13. Shared Types Package

**Package**: `@chromox/voice-protocol`
**Location**: `/home/sphinxy/chromox/packages/voice-protocol`

### Key Types

```typescript
// Voice DNA
VoiceDNA, PitchRange, VoiceType, AccentCategory

// Licensing
LicensingTerms, LicenseType, RoyaltySplits, VerificationLevel

// o8 Identity
O8Identity, CreatorInfo, AudioFingerprint

// Synthesis
VoiceProvider, CloneMode, VoiceComponent, StyleControls
HybridSynthesisRequest, HybridSynthesisResult

// Usage Tracking
VoiceUsageEvent, SettlementSummary, SynthesisType, SettlementStatus

// Imperium
ImperiumRecipient, ImperiumPayload, ImperiumTransactionResult

// Constants
DEFAULT_LICENSING_TERMS, DEFAULT_ROYALTY_SPLITS, DIASPORA_ACCENTS
```

### Usage

```typescript
import {
  VoiceDNA,
  LicensingTerms,
  HybridSynthesisRequest,
  VoiceUsageEvent,
  ImperiumPayload,
  DEFAULT_LICENSING_TERMS,
} from '@chromox/voice-protocol';
```
