/**
 * Audio Generation Routes
 * Handles audio file upload, retrieval, and deletion
 */

import express from 'express';
// Switch between Supabase Storage and CloudFlare R2
// Use R2 for production (unlimited storage, free egress)
// Use Supabase for development/testing
const USE_R2 = process.env.R2_ACCESS_KEY_ID ? true : false;

const storageModule = USE_R2
  ? await import('../utils/audioStorageR2.js')
  : await import('../utils/audioStorage.js');

const {
  getNextAudioNumber,
  uploadAudioFile,
  getAudioSignedUrl,
  getAudioPlaybackUrl,
  createAudioGenerationRecord,
  getUserAudioGenerations,
  getAudioGenerationByNumber,
  deleteAudioGeneration
} = storageModule;

import { getStorageStats } from '../utils/audioCleanup.js';

console.log(`[AUDIO ROUTES] Using storage backend: ${USE_R2 ? 'CloudFlare R2' : 'Supabase Storage'}`);

const router = express.Router();

/**
 * POST /api/audio/upload
 * Upload audio file and create generation record
 *
 * Body:
 * - audioBuffer: Base64 encoded audio file
 * - metadata: { title, language, voice_id, duration_seconds, etc. }
 */
router.post('/upload', async (req, res) => {
  try {
    const userId = req.user.id;
    const { audioBuffer, metadata = {} } = req.body;

    if (!audioBuffer) {
      return res.status(400).json({ error: 'Audio buffer is required' });
    }

    console.log(`[AUDIO API] Upload request from user ${userId.substring(0, 8)}...`);

    // Get next audio number
    const audioNumber = await getNextAudioNumber(userId);

    // Decode base64 buffer
    const buffer = Buffer.from(audioBuffer, 'base64');
    const fileSizeBytes = buffer.length;

    // Upload to storage
    const { path: storagePath } = await uploadAudioFile(userId, audioNumber, buffer);

    // Create database record
    const record = await createAudioGenerationRecord({
      userId,
      audioNumber,
      storagePath,
      fileSizeBytes,
      durationSeconds: metadata.duration_seconds || null,
      metadata
    });

    // Get signed URL for immediate access
    const signedUrl = await getAudioSignedUrl(storagePath);

    console.log(`[AUDIO API] ✅ Audio ${audioNumber} uploaded successfully`);

    res.json({
      success: true,
      audio: {
        id: record.id,
        audio_number: audioNumber,
        storage_path: storagePath,
        signed_url: signedUrl,
        file_size_bytes: fileSizeBytes,
        metadata: record.metadata,
        created_at: record.created_at
      }
    });
  } catch (error) {
    console.error('[AUDIO API] Upload error:', error);
    res.status(500).json({
      error: 'Failed to upload audio',
      details: error.message
    });
  }
});

/**
 * GET /api/audio/list
 * Get all audio generations for authenticated user
 *
 * Query params:
 * - limit: Max number of records (default: 100)
 */
router.get('/list', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 100;

    const audios = await getUserAudioGenerations(userId, limit);

    // Generate playback URLs for all audios (without attachment header for streaming)
    const audiosWithUrls = await Promise.all(
      audios.map(async (audio) => ({
        ...audio,
        signed_url: await getAudioPlaybackUrl(audio.storage_path)
      }))
    );

    res.json({
      success: true,
      audios: audiosWithUrls,
      count: audiosWithUrls.length
    });
  } catch (error) {
    console.error('[AUDIO API] List error:', error);
    res.status(500).json({
      error: 'Failed to fetch audio list',
      details: error.message
    });
  }
});

/**
 * GET /api/audio/:number
 * Get specific audio generation by number
 *
 * Params:
 * - number: Audio number
 */
router.get('/:number', async (req, res) => {
  try {
    const userId = req.user.id;
    const audioNumber = parseInt(req.params.number);

    if (isNaN(audioNumber) || audioNumber < 1) {
      return res.status(400).json({ error: 'Invalid audio number' });
    }

    const audio = await getAudioGenerationByNumber(userId, audioNumber);

    if (!audio) {
      return res.status(404).json({ error: 'Audio generation not found' });
    }

    // Get playback URL (without attachment header for streaming)
    const signedUrl = await getAudioPlaybackUrl(audio.storage_path);

    res.json({
      success: true,
      audio: {
        ...audio,
        signed_url: signedUrl
      }
    });
  } catch (error) {
    console.error('[AUDIO API] Get error:', error);
    res.status(500).json({
      error: 'Failed to fetch audio',
      details: error.message
    });
  }
});

/**
 * DELETE /api/audio/:number
 * Delete audio generation (file + database record)
 *
 * Params:
 * - number: Audio number
 */
router.delete('/:number', async (req, res) => {
  try {
    const userId = req.user.id;
    const audioNumber = parseInt(req.params.number);

    if (isNaN(audioNumber) || audioNumber < 1) {
      return res.status(400).json({ error: 'Invalid audio number' });
    }

    await deleteAudioGeneration(userId, audioNumber);

    console.log(`[AUDIO API] ✅ Audio ${audioNumber} deleted for user ${userId.substring(0, 8)}...`);

    res.json({
      success: true,
      message: `Audio ${audioNumber} deleted successfully`
    });
  } catch (error) {
    console.error('[AUDIO API] Delete error:', error);
    res.status(500).json({
      error: 'Failed to delete audio',
      details: error.message
    });
  }
});

/**
 * GET /api/audio/download/:number
 * Download audio file directly (streams from R2 with proper headers)
 *
 * Params:
 * - number: Audio number
 */
router.get('/download/:number', async (req, res) => {
  try {
    const userId = req.user.id;
    const audioNumber = parseInt(req.params.number);

    if (isNaN(audioNumber) || audioNumber < 1) {
      return res.status(400).json({ error: 'Invalid audio number' });
    }

    const audio = await getAudioGenerationByNumber(userId, audioNumber);

    if (!audio) {
      return res.status(404).json({ error: 'Audio generation not found' });
    }

    // For R2, use signed URL with proper download headers
    const filename = `YoutuLabs_audio_${String(audioNumber).padStart(3, '0')}.mp3`;
    const signedUrl = await getAudioSignedUrl(audio.storage_path, 60, filename);

    // Fetch file from R2
    const response = await fetch(signedUrl);

    if (!response.ok) {
      throw new Error('Failed to fetch file from storage');
    }

    // Get buffer from response
    const buffer = await response.arrayBuffer();

    // Set download headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.byteLength);

    // Send the file
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('[AUDIO API] Download error:', error);
    res.status(500).json({
      error: 'Failed to download audio',
      details: error.message
    });
  }
});

/**
 * GET /api/audio/stats
 * Get user's audio storage statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;

    const userAudios = await getUserAudioGenerations(userId);
    const userSize = userAudios.reduce((sum, a) => sum + (a.file_size_bytes || 0), 0);

    res.json({
      success: true,
      user: {
        totalFiles: userAudios.length,
        totalBytes: userSize,
        totalMB: (userSize / (1024 * 1024)).toFixed(2)
      }
    });
  } catch (error) {
    console.error('[AUDIO API] Stats error:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      details: error.message
    });
  }
});

/**
 * GET /api/audio/global-stats
 * Get global storage statistics (all users)
 * Returns overall storage usage for monitoring
 */
router.get('/global-stats', async (req, res) => {
  try {
    const stats = await getStorageStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[AUDIO API] Global stats error:', error);
    res.status(500).json({
      error: 'Failed to get global statistics',
      details: error.message
    });
  }
});

export default router;
