/**
 * Audio Storage Utilities
 * Handles audio file storage in Supabase Storage with automatic numbering
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Admin client for backend operations (bypasses RLS)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const BUCKET_NAME = 'audio-generations';

/**
 * Get next audio number for user
 * @param {string} userId - User UUID
 * @returns {Promise<number>} Next audio number
 */
export async function getNextAudioNumber(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('get_next_audio_number', { p_user_id: userId });

    if (error) {
      console.error('[AUDIO] Error getting next audio number:', error);
      throw new Error('Failed to get next audio number');
    }

    return data;
  } catch (error) {
    console.error('[AUDIO] Exception in getNextAudioNumber:', error);
    throw error;
  }
}

/**
 * Generate storage path for audio file
 * @param {string} userId - User UUID
 * @param {number} audioNumber - Audio number
 * @returns {string} Storage path
 */
export function generateStoragePath(userId, audioNumber) {
  // Format: userId/audio_001.mp3
  const paddedNumber = String(audioNumber).padStart(3, '0');
  return `${userId}/audio_${paddedNumber}.mp3`;
}

/**
 * Upload audio file to Supabase Storage
 * @param {string} userId - User UUID
 * @param {number} audioNumber - Audio number
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} contentType - MIME type (default: audio/mpeg)
 * @returns {Promise<Object>} Upload result with path and public URL
 */
export async function uploadAudioFile(userId, audioNumber, audioBuffer, contentType = 'audio/mpeg') {
  try {
    const storagePath = generateStoragePath(userId, audioNumber);

    // Validate file size (50 MB limit on Supabase free tier)
    // To fit more audio: use lower bitrate in ElevenLabs
    // - 128 kbps: ~50 min
    // - 96 kbps: ~65 min (recommended for speech)
    // - 64 kbps: ~120 min
    // See AUDIO_OPTIMIZATION_GUIDE.md for details
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB (increase for PRO tier)
    if (audioBuffer.length > MAX_FILE_SIZE) {
      const sizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(2);
      throw new Error(`File too large: ${sizeMB} MB exceeds 50 MB limit. Use lower bitrate (96kbps or 64kbps) or split into chapters.`);
    }

    console.log(`[AUDIO] Uploading audio file: ${storagePath} (${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(storagePath, audioBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: false // Don't overwrite existing files
      });

    if (error) {
      console.error('[AUDIO] Upload error:', error);
      throw new Error(`Failed to upload audio: ${error.message}`);
    }

    console.log(`[AUDIO] ✅ Audio uploaded successfully: ${storagePath}`);

    return {
      path: data.path,
      fullPath: data.fullPath
    };
  } catch (error) {
    console.error('[AUDIO] Exception in uploadAudioFile:', error);
    throw error;
  }
}

/**
 * Get signed URL for audio file (valid for 1 hour)
 * @param {string} storagePath - Storage path
 * @param {number} expiresIn - Expiration in seconds (default: 3600 = 1 hour)
 * @returns {Promise<string>} Signed URL
 */
export async function getAudioSignedUrl(storagePath, expiresIn = 3600) {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error('[AUDIO] Error creating signed URL:', error);
      throw new Error('Failed to create signed URL');
    }

    return data.signedUrl;
  } catch (error) {
    console.error('[AUDIO] Exception in getAudioSignedUrl:', error);
    throw error;
  }
}

/**
 * Get signed URL for audio playback (without attachment header for streaming)
 * @param {string} storagePath - Storage path
 * @param {number} expiresIn - Expiration in seconds (default: 3600 = 1 hour)
 * @returns {Promise<string>} Signed URL for playback
 */
export async function getAudioPlaybackUrl(storagePath, expiresIn = 3600) {
  try {
    console.log(`[AUDIO] Creating playback URL for path: "${storagePath}" in bucket: "${BUCKET_NAME}"`);
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error(`[AUDIO] Error creating playback URL for path "${storagePath}":`, error);
      throw new Error('Failed to create playback URL');
    }

    return data.signedUrl;
  } catch (error) {
    console.error('[AUDIO] Exception in getAudioPlaybackUrl:', error);
    throw error;
  }
}

/**
 * Delete audio file from storage
 * @param {string} storagePath - Storage path
 * @returns {Promise<boolean>} Success status
 */
export async function deleteAudioFile(storagePath) {
  try {
    console.log(`[AUDIO] Deleting audio file: ${storagePath}`);

    const { error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      console.error('[AUDIO] Delete error:', error);
      throw new Error(`Failed to delete audio: ${error.message}`);
    }

    console.log(`[AUDIO] ✅ Audio deleted successfully: ${storagePath}`);
    return true;
  } catch (error) {
    console.error('[AUDIO] Exception in deleteAudioFile:', error);
    throw error;
  }
}

/**
 * Create audio generation record in database
 * @param {Object} params - Audio generation parameters
 * @returns {Promise<Object>} Created record
 */
export async function createAudioGenerationRecord({
  userId,
  audioNumber,
  storagePath,
  fileSizeBytes,
  durationSeconds,
  metadata = {}
}) {
  try {
    const { data, error } = await supabaseAdmin
      .from('audio_generations')
      .insert({
        user_id: userId,
        audio_number: audioNumber,
        storage_path: storagePath,
        file_size_bytes: fileSizeBytes,
        duration_seconds: durationSeconds,
        metadata
      })
      .select()
      .single();

    if (error) {
      console.error('[AUDIO] Error creating record:', error);
      throw new Error('Failed to create audio generation record');
    }

    return data;
  } catch (error) {
    console.error('[AUDIO] Exception in createAudioGenerationRecord:', error);
    throw error;
  }
}

/**
 * Get user's audio generations
 * @param {string} userId - User UUID
 * @param {number} limit - Max number of records (default: 100)
 * @returns {Promise<Array>} Array of audio generations
 */
export async function getUserAudioGenerations(userId, limit = 100) {
  try {
    const { data, error } = await supabaseAdmin
      .from('audio_generations')
      .select('*')
      .eq('user_id', userId)
      .order('audio_number', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AUDIO] Error fetching user audios:', error);
      throw new Error('Failed to fetch audio generations');
    }

    return data;
  } catch (error) {
    console.error('[AUDIO] Exception in getUserAudioGenerations:', error);
    throw error;
  }
}

/**
 * Get specific audio generation by number
 * @param {string} userId - User UUID
 * @param {number} audioNumber - Audio number
 * @returns {Promise<Object|null>} Audio generation record or null
 */
export async function getAudioGenerationByNumber(userId, audioNumber) {
  try {
    const { data, error } = await supabaseAdmin
      .from('audio_generations')
      .select('*')
      .eq('user_id', userId)
      .eq('audio_number', audioNumber)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      console.error('[AUDIO] Error fetching audio:', error);
      throw new Error('Failed to fetch audio generation');
    }

    return data;
  } catch (error) {
    console.error('[AUDIO] Exception in getAudioGenerationByNumber:', error);
    throw error;
  }
}

/**
 * Delete audio generation (both file and record)
 * @param {string} userId - User UUID
 * @param {number} audioNumber - Audio number
 * @returns {Promise<boolean>} Success status
 */
export async function deleteAudioGeneration(userId, audioNumber) {
  try {
    // Get record first
    const record = await getAudioGenerationByNumber(userId, audioNumber);
    if (!record) {
      throw new Error('Audio generation not found');
    }

    // Delete from storage
    await deleteAudioFile(record.storage_path);

    // Delete from database
    const { error } = await supabaseAdmin
      .from('audio_generations')
      .delete()
      .eq('user_id', userId)
      .eq('audio_number', audioNumber);

    if (error) {
      console.error('[AUDIO] Error deleting record:', error);
      throw new Error('Failed to delete audio record');
    }

    console.log(`[AUDIO] ✅ Audio generation ${audioNumber} deleted for user ${userId.substring(0, 8)}...`);
    return true;
  } catch (error) {
    console.error('[AUDIO] Exception in deleteAudioGeneration:', error);
    throw error;
  }
}
