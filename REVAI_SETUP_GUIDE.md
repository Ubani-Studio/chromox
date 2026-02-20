# Rev.ai Speech Recognition Setup Guide

## Overview

Chromox now includes **Rev.ai integration** for superior accent-aware transcription of guide vocals. This is especially powerful for challenging accents like:

- **Jamaican Patois** - Caribbean English with creole influences
- **Cockney** - London East End dialect
- **AAVE** (African American Vernacular English)
- **Scottish, Irish, Australian** accents
- **Regional US/UK dialects**
- **Non-native English speakers** with various accents

Rev.ai provides:
✅ Higher accuracy than Whisper for difficult accents
✅ Word-level confidence scores
✅ Accent detection metadata
✅ Professional-grade transcription quality
✅ Automatic fallback to Whisper if Rev.ai is unavailable

---

## Why Rev.ai?

**Problem**: When you upload a guide vocal with a Jamaican Patois accent and match it to a persona, the synthesized output might sound "Chinese or Russian" instead of matching the original accent/pronunciation.

**Solution**: Rev.ai accurately transcribes difficult accents and provides **accent metadata** that Chromox uses to:
1. Correctly transcribe the lyrics from the guide vocal
2. Detect the accent/dialect
3. Apply pronunciation hints to the persona voice synthesis
4. Prevent mismatched accent artifacts in the rendered output

---

## Setup Instructions

### Step 1: Get Your Rev.ai API Key

1. Go to [https://www.rev.ai/](https://www.rev.ai/)
2. Sign up for a free account (includes free trial credits)
3. Navigate to **Settings** → **API Keys**
4. Create a new API key and copy it

### Step 2: Configure Chromox

Edit `chromox/backend/.env` and update the Rev.ai configuration:

```bash
# Rev.ai Speech-to-Text API (for accent-aware transcription)
REVAI_API_KEY=your_actual_revai_api_key_here
REVAI_ENABLE_ACCENT_DETECTION=true
REVAI_DEFAULT_LANGUAGE=en
```

**Important**: Replace `your_revai_api_key_here` with your actual API key!

### Step 3: Restart Chromox Backend

```bash
cd chromox/backend
npm run dev
```

Or if using the full stack:

```bash
cd chromox
./stop-all.sh
./start-all.sh
```

---

## How It Works

### 1. Automatic Transcription Pipeline

When you upload a guide vocal, Chromox now:

```
Guide Audio Upload
    ↓
Rev.ai Transcription (with accent detection)
    ↓ (if fails)
Whisper Fallback
    ↓
Accent Metadata Extraction
    ↓
Persona Voice Synthesis (with pronunciation hints)
```

### 2. Accent Detection

Rev.ai automatically detects accents like:

- `jamaican_patois` - Jamaican Creole English
- `cockney` - London East End
- `us_southern_aave` - African American Vernacular English
- `scottish`, `irish`, `australian` - Commonwealth variants
- `british`, `american` - Standard variants

### 3. Pronunciation Guidance

Based on the detected accent, Chromox applies pronunciation hints:

```typescript
// Example: Jamaican Patois
{
  accentHint: 'jamaican_patois',
  pronunciationGuide: 'Caribbean English with creole influences, dropped consonants, melodic intonation'
}
```

This helps the persona voice engine maintain the correct accent characteristics.

---

## Testing with Challenging Accents

### Test Case 1: Jamaican Patois

1. **Upload a guide vocal** with Jamaican Patois lyrics (e.g., dancehall vocals)
2. **Check the logs** for accent detection:
   ```
   [RevAI] Detected accent: {"detected":"jamaican","confidence":0.92,"language":"en","dialect":"patois"}
   [AudioAnalysis] Accent detected: jamaican_patois
   ```
3. **Render with a persona** - the output should preserve Patois pronunciation patterns
4. **Compare** to previous renders without Rev.ai - notice improved accent matching

### Test Case 2: Cockney/Grime Vocals

1. Upload UK Grime or Cockney vocals
2. Rev.ai should detect `en-gb` with `cockney` dialect
3. Rendered output maintains glottal stops and London pronunciation

### Test Case 3: AAVE/Southern US

1. Upload African American Vernacular English vocals
2. Rev.ai detects `us_southern_aave`
3. Persona rendering preserves AAVE pronunciation patterns

---

## Checking Transcription Results

### View Guide Sample Metadata

Guide samples now include accent metadata:

```typescript
{
  id: "guide-123",
  name: "Patois Hook",
  transcript: "Mi nuh care wha dem say",  // ✅ Correctly transcribed
  accentMetadata: {
    detected: "jamaican",
    confidence: 0.92,
    language: "en",
    dialect: "patois"
  },
  transcriptionProvider: "revai",
  transcriptionConfidence: 0.89
}
```

### Check Logs

Watch the backend logs for transcription info:

```bash
cd chromox
./view-logs.sh
```

Look for:
```
[RevAI] Starting transcription for: /path/to/guide.wav
[RevAI] Language: en, Accent detection: true
[RevAI] Job submitted: abc123
[RevAI] Transcription completed for job: abc123
[RevAI] Detected accent: {"detected":"jamaican",...}
[GuideMetadata] Transcription via revai: "Mi nuh care wha dem say..."
[GuideMetadata] Detected accent: jamaican (0.92)
```

---

## Fallback Behavior

### When Rev.ai is Not Available

Chromox automatically falls back to Whisper if:
- No Rev.ai API key is configured
- Rev.ai API is down
- Rev.ai quota is exhausted
- Network error occurs

```
[RevAI] API key not configured, skipping Rev.ai transcription
[AudioAnalysis] Rev.ai transcription failed, falling back to Whisper
```

### Hybrid Mode

You can use both services:
- **Rev.ai**: For difficult accents (Patois, regional dialects)
- **Whisper**: Fast fallback for standard English

---

## Troubleshooting

### "API key not configured" Error

**Problem**: Backend logs show `[RevAI] API key not configured`

**Solution**:
1. Check `chromox/backend/.env`
2. Ensure `REVAI_API_KEY` is set (not `your_revai_api_key_here`)
3. Restart the backend

### Transcription Takes Too Long

**Problem**: Rev.ai jobs timeout after 5 minutes

**Solution**:
- Rev.ai processes async, typical jobs take 30-60 seconds
- Check your Rev.ai quota at [rev.ai dashboard](https://www.rev.ai/dashboard)
- If quota exhausted, Chromox falls back to Whisper

### Accent Not Detected

**Problem**: `accentMetadata` is `undefined` in guide sample

**Solution**:
1. Ensure `REVAI_ENABLE_ACCENT_DETECTION=true` in `.env`
2. Some accents may not be detected if audio quality is low
3. Rev.ai works best with clear vocal recordings (not heavily processed)

### Wrong Accent Detected

**Problem**: Rev.ai detects `en-us` instead of `jamaican`

**Solution**:
- Rev.ai's accent detection improves with longer audio samples
- Try uploading a longer guide vocal (15-30 seconds)
- Very heavy processing (autotune, distortion) can confuse accent detection
- Use clean/dry vocal stems for best results

---

## API Costs

Rev.ai pricing (as of 2024):
- **Free tier**: 5 hours of transcription per month
- **Paid**: ~$0.02-0.05 per minute of audio

For typical chromox usage (12-30 second guide vocals), the free tier supports:
- **1000+ guide vocal uploads per month**

Monitor usage at: [https://www.rev.ai/dashboard](https://www.rev.ai/dashboard)

---

## Advanced Configuration

### Custom Language Models

Add to `.env` for non-English vocals:

```bash
REVAI_DEFAULT_LANGUAGE=es  # Spanish
REVAI_DEFAULT_LANGUAGE=fr  # French
```

Supported languages: `en`, `es`, `fr`, `de`, `it`, `pt`, `nl`, `hi`, `ja`, `ko`, `zh`

### Disable Accent Detection

To reduce API costs:

```bash
REVAI_ENABLE_ACCENT_DETECTION=false
```

This still uses Rev.ai for transcription but skips accent metadata.

---

## What's Next?

Future enhancements:
- [ ] Auto-select personas based on detected accent
- [ ] Accent blending controls in UI
- [ ] Support for code-switching detection (multiple accents in one vocal)
- [ ] Custom pronunciation dictionaries for slang/adlibs

---

## Support

- **Rev.ai Docs**: [https://docs.rev.ai/](https://docs.rev.ai/)
- **Chromox Issues**: Check backend logs with `./view-logs.sh`
- **Accent Detection**: Review `accentMetadata` in guide sample JSON

---

**🎤 Now your Jamaican Patois, Cockney, and AAVE vocals will sound authentic when matched to personas!**
