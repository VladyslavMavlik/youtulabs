/**
 * Audio Storage Utilities - CloudFlare R2
 * S3-compatible storage with free egress and no file size limits
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase for database only
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'audio-generations';
const R2_ENDPOINT = process.env.R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.warn('⚠️  R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env');
}

// Initialize S3 client for R2
const r2Client = new S3Client({
  region: 'auto', // CloudFlare R2 uses 'auto' region
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

console.log('[R2] Initialized with endpoint:', R2_ENDPOINT);

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
      console.error('[AUDIO R2] Error getting next audio number:', error);
      throw new Error('Failed to get next audio number');
    }

    return data;
  } catch (error) {
    console.error('[AUDIO R2] Exception in getNextAudioNumber:', error);
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
 * Upload audio file to R2
 * @param {string} userId - User UUID
 * @param {number} audioNumber - Audio number
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} contentType - MIME type (default: audio/mpeg)
 * @returns {Promise<Object>} Upload result with path
 */
export async function uploadAudioFile(userId, audioNumber, audioBuffer, contentType = 'audio/mpeg') {
  try {
    const storagePath = generateStoragePath(userId, audioNumber);

    const fileSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(2);
    console.log(`[AUDIO R2] Uploading audio file: ${storagePath} (${fileSizeMB} MB)`);

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: storagePath,
      Body: audioBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // 1 year cache
    });

    await r2Client.send(command);

    console.log(`[AUDIO R2] ✅ Audio uploaded successfully: ${storagePath}`);

    return {
      path: storagePath,
      fullPath: `${R2_BUCKET_NAME}/${storagePath}`
    };
  } catch (error) {
    console.error('[AUDIO R2] Upload error:', error);
    throw new Error(`Failed to upload audio to R2: ${error.message}`);
  }
}

/**
 * Get signed URL for audio file (valid for specified duration)
 * @param {string} storagePath - Storage path
 * @param {number} expiresIn - Expiration in seconds (default: 3600 = 1 hour)
 * @param {string} filename - Optional filename for download (if not provided, extracted from path)
 * @returns {Promise<string>} Signed URL
 */
export async function getAudioSignedUrl(storagePath, expiresIn = 3600, filename = null) {
  try {
    // Extract filename from path if not provided (e.g., "user_id/audio_001.mp3" -> "audio_001.mp3")
    const downloadFilename = filename || storagePath.split('/').pop();

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: storagePath,
      ResponseContentDisposition: `attachment; filename="${downloadFilename}"`,
    });

    const signedUrl = await getSignedUrl(r2Client, command, { expiresIn });

    return signedUrl;
  } catch (error) {
    console.error('[AUDIO R2] Error creating signed URL:', error);
    throw new Error('Failed to create signed URL');
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
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: storagePath,
      // NO ResponseContentDisposition - allows inline playback and avoids CORS issues
    });

    const signedUrl = await getSignedUrl(r2Client, command, { expiresIn });

    return signedUrl;
  } catch (error) {
    console.error('[AUDIO R2] Error creating playback URL:', error);
    throw new Error('Failed to create playback URL');
  }
}

/**
 * Delete audio file from R2
 * @param {string} storagePath - Storage path
 * @returns {Promise<boolean>} Success status
 */
export async function deleteAudioFile(storagePath) {
  try {
    console.log(`[AUDIO R2] Deleting audio file: ${storagePath}`);

    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: storagePath,
    });

    await r2Client.send(command);

    console.log(`[AUDIO R2] ✅ Audio deleted successfully: ${storagePath}`);
    return true;
  } catch (error) {
    console.error('[AUDIO R2] Delete error:', error);
    throw new Error(`Failed to delete audio from R2: ${error.message}`);
  }
}

/**
 * Check if file exists in R2
 * @param {string} storagePath - Storage path
 * @returns {Promise<boolean>} True if exists
 */
export async function fileExists(storagePath) {
  try {
    const command = new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: storagePath,
    });

    await r2Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
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
      console.error('[AUDIO R2] Error creating record:', error);
      throw new Error('Failed to create audio generation record');
    }

    return data;
  } catch (error) {
    console.error('[AUDIO R2] Exception in createAudioGenerationRecord:', error);
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
      console.error('[AUDIO R2] Error fetching user audios:', error);
      throw new Error('Failed to fetch audio generations');
    }

    return data;
  } catch (error) {
    console.error('[AUDIO R2] Exception in getUserAudioGenerations:', error);
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
      console.error('[AUDIO R2] Error fetching audio:', error);
      throw new Error('Failed to fetch audio generation');
    }

    return data;
  } catch (error) {
    console.error('[AUDIO R2] Exception in getAudioGenerationByNumber:', error);
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

    // Delete from R2
    await deleteAudioFile(record.storage_path);

    // Delete from database
    const { error } = await supabaseAdmin
      .from('audio_generations')
      .delete()
      .eq('user_id', userId)
      .eq('audio_number', audioNumber);

    if (error) {
      console.error('[AUDIO R2] Error deleting record:', error);
      throw new Error('Failed to delete audio record');
    }

    console.log(`[AUDIO R2] ✅ Audio generation ${audioNumber} deleted for user ${userId.substring(0, 8)}...`);
    return true;
  } catch (error) {
    console.error('[AUDIO R2] Exception in deleteAudioGeneration:', error);
    throw error;
  }
}
