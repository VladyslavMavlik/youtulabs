/**
 * Audio Scaffold Utilities
 * Ensures time bridges, audio beats, and removes meta intrusions
 */

const AUDIO_BEAT_MARKER = '[AUDIO_BEAT]';

// Chapter heading regex - supports multiple languages and heading levels
const CHAPTER_HEADING_RE = /^#{1,3}\s*(Chapter|Розділ|Rozdział|Kapitel|Глава)\s+\d+/i;

/**
 * Strip meta lines (marketing/synopsis text) from body
 */
export function stripMetaLines(markdown) {
  const lines = markdown.split('\n');
  const cleaned = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip lines that look like marketing copy or meta-description
    if (
      // Headers
      trimmed.match(/^(Logline|Synopsis|Tagline|Summary)\s*:/i) ||
      // Common meta patterns
      trimmed.match(/^(The story explores|This is a story|This story|The narrative|Through|Set against|In this)/i) ||
      // Character intros as if describing a book
      trimmed.match(/^(Samantha and Marcus|Both characters|The two|Our protagonists)/i) ||
      // Book-jacket language
      trimmed.match(/(explores themes|examines how|captures the|backdrop of|unfolds over)/i)
    ) {
      continue; // Skip meta line
    }

    cleaned.push(line);
  }

  return cleaned.join('\n').trim();
}

/**
 * Ensure time bridges at scene transitions
 */
export function ensureTimeBridges(markdown, timeBridges, language) {
  if (!timeBridges || timeBridges.length === 0) {
    console.log('[AUDIO_SCAFFOLD] ensureTimeBridges: no timeBridges provided');
    return markdown;
  }

  const lines = markdown.split('\n');
  const result = [];
  let chapterWords = 0;
  let lastWasChapter = false;
  let needsBridge = false;
  let bridgesAdded = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is a chapter heading
    if (line.match(CHAPTER_HEADING_RE)) {
      result.push(line);
      lastWasChapter = true;
      chapterWords = 0;
      needsBridge = false;
      continue;
    }

    // Skip empty lines after chapter
    if (lastWasChapter && !line.trim()) {
      result.push(line);
      continue;
    }

    // First real content after chapter heading
    if (lastWasChapter && line.trim()) {
      lastWasChapter = false;

      // Check if this line or the next few lines already have a time bridge
      const contextLines = lines.slice(i, i + 5).join(' ').toLowerCase();
      const hasTimeBridge = timeBridges.some(bridge =>
        contextLines.includes(bridge.toLowerCase())
      );

      if (!hasTimeBridge && chapterWords === 0) {
        // Add random time bridge (use a small subset to avoid repetition)
        const bridge = timeBridges[Math.floor(Math.random() * Math.min(5, timeBridges.length))];
        result.push('');
        result.push(bridge);
        result.push('');
        bridgesAdded++;
        needsBridge = false;
      }
    }

    result.push(line);

    // Count words
    if (line.trim()) {
      chapterWords += line.split(/\s+/).filter(w => w.length > 0).length;
    }
  }

  console.log(`[AUDIO_SCAFFOLD] ensureTimeBridges: added ${bridgesAdded} time bridges`);
  return result.join('\n');
}

/**
 * Ensure audio beats at regular intervals
 * Target: ~80-140 words between beats
 */
export function ensureAudioBeats(markdown) {
  const TARGET_WORDS_PER_BEAT = 110;
  const MIN_WORDS_PER_BEAT = 80;

  const lines = markdown.split('\n');
  const result = [];
  let wordsSinceLastBeat = 0;
  let inChapterHeading = false;
  let beatsAdded = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if chapter heading
    if (trimmed.match(CHAPTER_HEADING_RE)) {
      result.push(line);
      inChapterHeading = true;
      wordsSinceLastBeat = 0;
      continue;
    }

    // Check if already a beat marker
    if (trimmed === AUDIO_BEAT_MARKER) {
      result.push(line);
      wordsSinceLastBeat = 0;
      continue;
    }

    // Skip empty lines
    if (!trimmed) {
      result.push(line);
      continue;
    }

    // Reset chapter heading flag
    if (inChapterHeading && trimmed) {
      inChapterHeading = false;
    }

    // Count words in this line
    const wordsInLine = trimmed.split(/\s+/).filter(w => w.length > 0).length;
    wordsSinceLastBeat += wordsInLine;

    // Add the line
    result.push(line);

    // Check if we need to insert a beat AFTER this line
    if (wordsSinceLastBeat >= MIN_WORDS_PER_BEAT) {
      // Don't insert beat right after dialogue
      const isDialogue = trimmed.match(/^["—–-]/) || trimmed.match(/[""]$/);

      // Check if next line is chapter heading
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      const nextIsChapter = nextLine.match(CHAPTER_HEADING_RE);

      if (!isDialogue && !nextIsChapter) {
        result.push('');
        result.push(AUDIO_BEAT_MARKER);
        result.push('');
        beatsAdded++;
        wordsSinceLastBeat = 0;
      }
    }
  }

  console.log(`[AUDIO_SCAFFOLD] ensureAudioBeats: added ${beatsAdded} audio beats`);
  return result.join('\n');
}

/**
 * Remove all audio beat markers (for final export)
 * Also removes any malformed "audiobeat" words that leaked into text
 */
export function stripAudioBeats(markdown) {
  return markdown
    .split('\n')
    .filter(line => line.trim() !== AUDIO_BEAT_MARKER)
    .join('\n')
    // Remove any "audiobeat" words that leaked into text (case-insensitive)
    .replace(/\b(audio[\s_-]?beat|audiobeat)\b/gi, '')
    // Remove orphaned brackets that might remain
    .replace(/\[\s*\]/g, '')
    // Clean up excessive spaces
    .replace(/\s{3,}/g, ' ')
    // Clean up excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
