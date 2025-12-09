/**
 * Audio Storage API - CloudFlare R2 integration
 * Upload and retrieve audio generations from R2 storage
 */

const API_URL = import.meta.env.VITE_API_URL ?? '';

export interface AudioGeneration {
  id: string;
  audio_number: number;
  storage_path: string;
  signed_url: string;
  file_size_bytes: number;
  duration_seconds?: number;
  metadata?: {
    title?: string;
    language?: string;
    voice_id?: string;
    characterCount?: number;
  };
  created_at: string;
}

export interface UploadAudioResult {
  success: boolean;
  audio: AudioGeneration;
}

/**
 * Upload audio file to R2 storage
 * @param audioBlob - Audio file as Blob
 * @param metadata - Optional metadata (title, language, etc.)
 * @param accessToken - JWT access token
 * @returns Upload result with audio generation info
 */
export async function uploadAudioToR2(
  audioBlob: Blob,
  metadata: {
    title?: string;
    language?: string;
    voice_id?: string;
    duration_seconds?: number;
    characterCount?: number;
  } = {},
  accessToken: string
): Promise<UploadAudioResult> {
  try {
    // Convert blob to base64
    const arrayBuffer = await audioBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const binaryString = Array.from(bytes).map(byte => String.fromCharCode(byte)).join('');
    const base64Audio = btoa(binaryString);

    console.log(`[AUDIO API] Uploading audio (${(audioBlob.size / (1024 * 1024)).toFixed(2)} MB)...`);

    const response = await fetch(`${API_URL}/api/audio/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        audioBuffer: base64Audio,
        metadata: {
          ...metadata,
          uploaded_at: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Failed to upload audio');
    }

    const result = await response.json();
    console.log(`[AUDIO API] ✅ Uploaded successfully: audio_${String(result.audio.audio_number).padStart(3, '0')}.mp3`);

    return result;
  } catch (error: any) {
    console.error('[AUDIO API] Upload error:', error);
    throw new Error(`Failed to upload audio: ${error.message}`);
  }
}

/**
 * Get list of user's audio generations
 * @param accessToken - JWT access token
 * @param limit - Max number of audios to fetch (default: 100)
 * @returns Array of audio generations
 */
export async function getUserAudioList(
  accessToken: string,
  limit: number = 100
): Promise<AudioGeneration[]> {
  try {
    console.log('[AUDIO API] Fetching audio list...');

    const response = await fetch(`${API_URL}/api/audio/list?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Failed to fetch audio list');
    }

    const result = await response.json();
    console.log(`[AUDIO API] ✅ Fetched ${result.count} audio generations`);

    return result.audios || [];
  } catch (error: any) {
    console.error('[AUDIO API] Fetch list error:', error);
    throw new Error(`Failed to fetch audio list: ${error.message}`);
  }
}

/**
 * Get specific audio generation by number
 * @param audioNumber - Audio number (1, 2, 3, ...)
 * @param accessToken - JWT access token
 * @returns Audio generation with signed URL
 */
export async function getAudioByNumber(
  audioNumber: number,
  accessToken: string
): Promise<AudioGeneration> {
  try {
    const response = await fetch(`${API_URL}/api/audio/${audioNumber}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Failed to fetch audio');
    }

    const result = await response.json();
    return result.audio;
  } catch (error: any) {
    console.error('[AUDIO API] Fetch audio error:', error);
    throw new Error(`Failed to fetch audio: ${error.message}`);
  }
}

/**
 * Delete audio generation
 * @param audioNumber - Audio number to delete
 * @param accessToken - JWT access token
 */
export async function deleteAudio(
  audioNumber: number,
  accessToken: string
): Promise<void> {
  try {
    console.log(`[AUDIO API] Deleting audio_${String(audioNumber).padStart(3, '0')}.mp3...`);

    const response = await fetch(`${API_URL}/api/audio/${audioNumber}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Failed to delete audio');
    }

    console.log(`[AUDIO API] ✅ Audio deleted successfully`);
  } catch (error: any) {
    console.error('[AUDIO API] Delete error:', error);
    throw new Error(`Failed to delete audio: ${error.message}`);
  }
}

/**
 * Download audio file directly
 * @param audioNumber - Audio number
 * @param accessToken - JWT access token
 * @returns Download URL
 */
export function getAudioDownloadUrl(audioNumber: number, accessToken: string): string {
  return `${API_URL}/api/audio/download/${audioNumber}`;
}

/**
 * Get user's audio storage statistics
 * @param accessToken - JWT access token
 */
export async function getAudioStats(accessToken: string) {
  try {
    const response = await fetch(`${API_URL}/api/audio/stats`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Failed to fetch stats');
    }

    const result = await response.json();
    return result.user;
  } catch (error: any) {
    console.error('[AUDIO API] Stats error:', error);
    throw new Error(`Failed to fetch stats: ${error.message}`);
  }
}
