/**
 * Artifact storage for debugging
 * Saves intermediate generation outputs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACTS_DIR = path.join(__dirname, '../../tmp/artifacts');

/**
 * Save artifact for debugging
 */
export async function saveArtifact(storyId, step, content) {
  try {
    // Create artifacts directory if needed
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    // Save artifact
    const filename = `${storyId}_${step}.txt`;
    const filepath = path.join(ARTIFACTS_DIR, filename);
    await fs.writeFile(filepath, content, 'utf-8');

    return filepath;
  } catch (error) {
    // Silent fail - artifacts are optional
    console.warn(`Failed to save artifact: ${error.message}`);
  }
}

/**
 * Load artifact
 */
export async function loadArtifact(storyId, step) {
  try {
    const filename = `${storyId}_${step}.txt`;
    const filepath = path.join(ARTIFACTS_DIR, filename);
    return await fs.readFile(filepath, 'utf-8');
  } catch (error) {
    return null;
  }
}

/**
 * Clear old artifacts (optional cleanup)
 */
export async function clearArtifacts(olderThanHours = 24) {
  try {
    const files = await fs.readdir(ARTIFACTS_DIR);
    const now = Date.now();
    const maxAge = olderThanHours * 60 * 60 * 1000;

    for (const file of files) {
      const filepath = path.join(ARTIFACTS_DIR, file);
      const stats = await fs.stat(filepath);

      if (now - stats.mtimeMs > maxAge) {
        await fs.unlink(filepath);
      }
    }
  } catch (error) {
    // Silent fail
  }
}
