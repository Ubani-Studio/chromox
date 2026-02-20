import { Router } from 'express';
import { findPersona } from '../services/personaStore';
import { createRenderJob, listRenderJobs } from '../services/renderStore';
import { resolveProvider } from '../services/provider/providerRegistry';
import { ChromaticCorePipeline } from '../services/renderPipeline';
import { defaultEffectSettings } from '../services/effectsProcessor';
import { StyleControls } from '../types';

const router = Router();

const defaultControls: StyleControls = {
  brightness: 0.5,
  breathiness: 0.5,
  energy: 0.6,
  formant: 0,
  vibratoDepth: 0.4,
  vibratoRate: 0.5,
  roboticism: 0,
  glitch: 0,
  stereoWidth: 0.5
};

// Admin auth check
function isAdmin(req: any): boolean {
  const adminKey = req.headers['x-admin-key'];
  const envKey = process.env.ADMIN_SECRET_KEY || 'chromox-admin-2026';
  return adminKey === envKey;
}

/**
 * Direct render - no validation, fast path for admin use.
 * Renders new lyrics using a guide sample's style.
 */
router.post('/admin/direct-render', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const {
      personaId,
      lyrics,
      guideSampleId,
      stylePrompt = 'natural delivery',
      skipEffects = false,
      lowQuality = false,
      label
    } = req.body;

    if (!personaId || !lyrics) {
      return res.status(400).json({ error: 'personaId and lyrics are required' });
    }

    const persona = findPersona(personaId);
    if (!persona) {
      return res.status(404).json({ error: 'Persona not found' });
    }

    // Find guide sample if specified
    const guideSample = guideSampleId
      ? persona.guide_samples?.find(s => s.id === guideSampleId)
      : undefined;

    const controls = { ...defaultControls };
    const effects = skipEffects
      ? { ...defaultEffectSettings, bypassEffects: true }
      : { ...defaultEffectSettings };

    // Use lower quality settings for fast iteration
    const previewSeconds = lowQuality ? 8 : undefined;

    const provider = resolveProvider(persona.provider);
    const pipeline = new ChromaticCorePipeline(provider);

    console.log(`[AdminRender] Direct render for ${persona.name}, guide: ${guideSample?.name || 'none'}`);

    const resultPath = await pipeline.run({
      personaId,
      voiceModelKey: persona.voice_model_key,
      lyrics,
      stylePrompt,
      controls,
      effects,
      guideFilePath: guideSample?.path,
      guideSampleId,
      previewSeconds,
      // Pass phonetic data from guide if available
      phoneticLyrics: guideSample?.phoneticTranscript,
      pronunciationHints: guideSample?.pronunciationHints,
      prosodyHints: guideSample?.prosodyHints,
      detectedAccent: guideSample?.accentMetadata?.detected
    });

    const fileName = resultPath.split('/').pop();
    const audioUrl = `http://localhost:4414/renders/${fileName}`;

    const renderRecord = createRenderJob({
      personaId,
      personaName: persona.name,
      lyrics,
      stylePrompt,
      controls,
      effects,
      audioPath: resultPath,
      audioUrl,
      label: label || `Admin: ${new Date().toLocaleTimeString()}`,
      guideFilePath: guideSample?.path,
      personaImage: persona.image_url,
      guideSampleId
    });

    res.json({
      audioUrl,
      render: renderRecord,
      mode: 'admin-direct'
    });
  } catch (error) {
    console.error('[AdminRender] Direct render failed:', error);
    res.status(500).json({ error: 'Render failed', details: (error as Error).message });
  }
});

/**
 * Batch render - queue multiple lyric variations.
 */
router.post('/admin/batch-render', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const {
      personaId,
      lyricsVariations,
      guideSampleId,
      stylePrompt = 'natural delivery',
      skipEffects = false
    } = req.body;

    if (!personaId || !lyricsVariations || !Array.isArray(lyricsVariations)) {
      return res.status(400).json({ error: 'personaId and lyricsVariations array required' });
    }

    if (lyricsVariations.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 variations per batch' });
    }

    const persona = findPersona(personaId);
    if (!persona) {
      return res.status(404).json({ error: 'Persona not found' });
    }

    const guideSample = guideSampleId
      ? persona.guide_samples?.find(s => s.id === guideSampleId)
      : undefined;

    const controls = { ...defaultControls };
    const effects = skipEffects
      ? { ...defaultEffectSettings, bypassEffects: true }
      : { ...defaultEffectSettings };

    const provider = resolveProvider(persona.provider);
    const pipeline = new ChromaticCorePipeline(provider);

    console.log(`[AdminRender] Batch render: ${lyricsVariations.length} variations`);

    const results = [];

    for (let i = 0; i < lyricsVariations.length; i++) {
      const lyrics = lyricsVariations[i];
      try {
        const resultPath = await pipeline.run({
          personaId,
          voiceModelKey: persona.voice_model_key,
          lyrics,
          stylePrompt,
          controls,
          effects,
          guideFilePath: guideSample?.path,
          guideSampleId,
          previewSeconds: 12, // Keep batch renders short
          phoneticLyrics: guideSample?.phoneticTranscript,
          pronunciationHints: guideSample?.pronunciationHints,
          prosodyHints: guideSample?.prosodyHints,
          detectedAccent: guideSample?.accentMetadata?.detected
        });

        const fileName = resultPath.split('/').pop();
        const audioUrl = `http://localhost:4414/renders/${fileName}`;

        const renderRecord = createRenderJob({
          personaId,
          personaName: persona.name,
          lyrics,
          stylePrompt,
          controls,
          effects,
          audioPath: resultPath,
          audioUrl,
          label: `Batch ${i + 1}/${lyricsVariations.length}`,
          guideFilePath: guideSample?.path,
          personaImage: persona.image_url,
          guideSampleId
        });

        results.push({ success: true, audioUrl, render: renderRecord });
      } catch (err) {
        results.push({ success: false, error: (err as Error).message, lyrics });
      }
    }

    res.json({
      total: lyricsVariations.length,
      successful: results.filter(r => r.success).length,
      results,
      mode: 'admin-batch'
    });
  } catch (error) {
    console.error('[AdminRender] Batch render failed:', error);
    res.status(500).json({ error: 'Batch render failed', details: (error as Error).message });
  }
});

/**
 * Get admin render history (recent admin renders only).
 */
router.get('/admin/renders', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // For now, return recent renders - could filter by label prefix later
  const jobs = listRenderJobs();
  const adminJobs = jobs
    .filter((j: any) => j.label?.startsWith('Admin:') || j.label?.startsWith('Batch'))
    .slice(0, 50);

  res.json(adminJobs);
});

export default router;
