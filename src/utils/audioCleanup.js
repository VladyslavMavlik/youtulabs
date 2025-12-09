/**
 * Audio Storage Cleanup Utilities
 * Automatic cleanup of old audio files to manage storage limits
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Delete audio files older than specified days
 * Useful for FREE tier to stay within 1 GB limit
 *
 * @param {number} daysToKeep - Keep files newer than this many days (default: 30)
 * @returns {Promise<Object>} Cleanup statistics
 */
export async function cleanupOldAudioFiles(daysToKeep = 30) {
  try {
    console.log(`[CLEANUP] Starting cleanup of audio files older than ${daysToKeep} days...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    // Get old audio records from database
    const { data: oldAudios, error: fetchError } = await supabaseAdmin
      .from('audio_generations')
      .select('*')
      .lt('created_at', cutoffDate.toISOString());

    if (fetchError) {
      console.error('[CLEANUP] Error fetching old audios:', fetchError);
      throw fetchError;
    }

    if (!oldAudios || oldAudios.length === 0) {
      console.log('[CLEANUP] No old audio files to clean up');
      return { deleted: 0, freedSpace: 0 };
    }

    console.log(`[CLEANUP] Found ${oldAudios.length} old audio files to delete`);

    let deletedCount = 0;
    let freedSpace = 0;

    // Delete each file from storage and database
    for (const audio of oldAudios) {
      try {
        // Delete from storage
        const { error: storageError } = await supabaseAdmin.storage
          .from('audio-generations')
          .remove([audio.storage_path]);

        if (storageError) {
          console.error(`[CLEANUP] Error deleting storage file ${audio.storage_path}:`, storageError);
          continue;
        }

        // Delete from database
        const { error: dbError } = await supabaseAdmin
          .from('audio_generations')
          .delete()
          .eq('id', audio.id);

        if (dbError) {
          console.error(`[CLEANUP] Error deleting DB record ${audio.id}:`, dbError);
          continue;
        }

        deletedCount++;
        freedSpace += audio.file_size_bytes || 0;

        console.log(`[CLEANUP] ✅ Deleted: ${audio.storage_path}`);
      } catch (err) {
        console.error(`[CLEANUP] Error processing ${audio.storage_path}:`, err);
      }
    }

    const freedSpaceMB = (freedSpace / (1024 * 1024)).toFixed(2);
    console.log(`[CLEANUP] ✅ Cleanup complete: ${deletedCount} files deleted, ${freedSpaceMB} MB freed`);

    return {
      deleted: deletedCount,
      freedSpace: freedSpace,
      freedSpaceMB: freedSpaceMB
    };
  } catch (error) {
    console.error('[CLEANUP] Cleanup failed:', error);
    throw error;
  }
}

/**
 * Delete oldest audio files to free specified amount of space
 * Useful when approaching storage limit
 *
 * @param {number} targetFreeMB - Target MB to free
 * @returns {Promise<Object>} Cleanup statistics
 */
export async function cleanupToFreeSpace(targetFreeMB) {
  try {
    const targetBytes = targetFreeMB * 1024 * 1024;
    console.log(`[CLEANUP] Freeing ${targetFreeMB} MB of storage...`);

    // Get audios ordered by creation date (oldest first)
    const { data: audios, error: fetchError } = await supabaseAdmin
      .from('audio_generations')
      .select('*')
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('[CLEANUP] Error fetching audios:', fetchError);
      throw fetchError;
    }

    if (!audios || audios.length === 0) {
      console.log('[CLEANUP] No audio files to clean up');
      return { deleted: 0, freedSpace: 0 };
    }

    let deletedCount = 0;
    let freedSpace = 0;

    // Delete oldest files until target is reached
    for (const audio of audios) {
      if (freedSpace >= targetBytes) {
        break; // Target reached
      }

      try {
        // Delete from storage
        const { error: storageError } = await supabaseAdmin.storage
          .from('audio-generations')
          .remove([audio.storage_path]);

        if (storageError) {
          console.error(`[CLEANUP] Error deleting storage file ${audio.storage_path}:`, storageError);
          continue;
        }

        // Delete from database
        const { error: dbError } = await supabaseAdmin
          .from('audio_generations')
          .delete()
          .eq('id', audio.id);

        if (dbError) {
          console.error(`[CLEANUP] Error deleting DB record ${audio.id}:`, dbError);
          continue;
        }

        deletedCount++;
        freedSpace += audio.file_size_bytes || 0;

        console.log(`[CLEANUP] ✅ Deleted: ${audio.storage_path}`);
      } catch (err) {
        console.error(`[CLEANUP] Error processing ${audio.storage_path}:`, err);
      }
    }

    const freedSpaceMB = (freedSpace / (1024 * 1024)).toFixed(2);
    console.log(`[CLEANUP] ✅ Cleanup complete: ${deletedCount} files deleted, ${freedSpaceMB} MB freed`);

    return {
      deleted: deletedCount,
      freedSpace: freedSpace,
      freedSpaceMB: freedSpaceMB
    };
  } catch (error) {
    console.error('[CLEANUP] Cleanup failed:', error);
    throw error;
  }
}

/**
 * Get total storage usage statistics
 * @returns {Promise<Object>} Storage statistics
 */
export async function getStorageStats() {
  try {
    const { data: audios, error } = await supabaseAdmin
      .from('audio_generations')
      .select('file_size_bytes, created_at, user_id');

    if (error) {
      console.error('[CLEANUP] Error fetching stats:', error);
      throw error;
    }

    const totalFiles = audios.length;
    const totalBytes = audios.reduce((sum, a) => sum + (a.file_size_bytes || 0), 0);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
    const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(3);

    // Count unique users
    const uniqueUsers = new Set(audios.map(a => a.user_id)).size;

    // Storage limit (FREE tier: 1 GB)
    const limitBytes = 1 * 1024 * 1024 * 1024; // 1 GB
    const usagePercent = ((totalBytes / limitBytes) * 100).toFixed(2);
    const remainingMB = ((limitBytes - totalBytes) / (1024 * 1024)).toFixed(2);

    return {
      totalFiles,
      totalBytes,
      totalMB,
      totalGB,
      uniqueUsers,
      usagePercent,
      remainingMB,
      limitMB: 1024,
      nearLimit: usagePercent > 80 // Warning if over 80%
    };
  } catch (error) {
    console.error('[CLEANUP] Failed to get stats:', error);
    throw error;
  }
}

/**
 * Automatic cleanup when storage is near limit
 * Call this periodically (e.g., daily cron job)
 */
export async function autoCleanup() {
  try {
    const stats = await getStorageStats();

    console.log(`[AUTO-CLEANUP] Storage usage: ${stats.usagePercent}% (${stats.totalMB} MB / ${stats.limitMB} MB)`);

    if (stats.usagePercent < 80) {
      console.log('[AUTO-CLEANUP] Storage OK, no cleanup needed');
      return { cleaned: false, stats };
    }

    console.log('[AUTO-CLEANUP] ⚠️ Storage over 80%, starting cleanup...');

    // Free 20% of storage (200 MB for 1 GB limit)
    const targetFreeMB = stats.limitMB * 0.2;
    const result = await cleanupToFreeSpace(targetFreeMB);

    console.log(`[AUTO-CLEANUP] ✅ Freed ${result.freedSpaceMB} MB`);

    return {
      cleaned: true,
      ...result,
      newStats: await getStorageStats()
    };
  } catch (error) {
    console.error('[AUTO-CLEANUP] Auto cleanup failed:', error);
    throw error;
  }
}
