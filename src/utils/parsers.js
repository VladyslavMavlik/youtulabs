/**
 * Parsers for extracting structured data from Claude responses
 */

/**
 * Extract content between markers with robust fallback
 * Tries ASCII markers first (more reliable), then Unicode
 */
function extractBlock(text, startMarker, endMarker) {
  // Try ASCII markers first if Unicode markers provided
  const asciiStart = startMarker.replace(/⟪/g, '<<<').replace(/⟫/g, '>>>');
  const asciiEnd = endMarker.replace(/⟪/g, '<<<').replace(/⟫/g, '>>>');

  // Escape special regex characters in markers
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Try ASCII first
  let result = tryExtract(text, asciiStart, asciiEnd, escapeRegex);
  if (result) return result;

  // Fallback to Unicode
  result = tryExtract(text, startMarker, endMarker, escapeRegex);
  return result;
}

function tryExtract(text, startMarker, endMarker, escapeRegex) {
  const startPattern = new RegExp(`${escapeRegex(startMarker)}\\s*\\n?`, 'is');
  const endPattern = new RegExp(`\\s*${escapeRegex(endMarker)}`, 'is');

  const startMatch = text.search(startPattern);
  if (startMatch === -1) return null;

  const contentStart = startMatch + text.match(startPattern)[0].length;
  const remainingText = text.substring(contentStart);

  const endMatch = remainingText.search(endPattern);
  if (endMatch === -1) {
    // If no end marker, take until next start marker or end of text
    return remainingText.trim();
  }

  return remainingText.substring(0, endMatch).trim();
}

/**
 * Parse Sonnet Planner response
 */
export function parseSonnetPlannerResponse(responseText) {
  const outline = extractBlock(responseText, '⟪OUTLINE_JSON⟫', '⟪/OUTLINE_JSON⟫');
  const checklist = extractBlock(responseText, '⟪CHECKLIST⟫', '⟪/CHECKLIST⟫');
  const chapters = extractBlock(responseText, '⟪CHAPTERS⟫', '⟪/CHAPTERS⟫');
  const titles = extractBlock(responseText, '⟪TITLES⟫', '⟪/TITLES⟫');
  const synopsis = extractBlock(responseText, '⟪SYNOPSIS⟫', '⟪/SYNOPSIS⟫');

  // Aggressive fallback for chapters
  let chaptersText = chapters;
  if (!chaptersText || chaptersText.length < 100) {
    console.log('Sonnet: Primary chapter extraction failed, trying fallback...');

    // Find boundaries - try both ASCII and Unicode markers
    const boundaries = [
      '<<<TITLES>>>', '⟪TITLES⟫',
      '<<<SYNOPSIS>>>', '⟪SYNOPSIS⟫',
      '<<<END_CHAPTERS>>>', '⟪/CHAPTERS⟫'
    ];

    let endIndex = Infinity;
    for (const boundary of boundaries) {
      const idx = responseText.indexOf(boundary);
      if (idx > 0 && idx < endIndex) {
        endIndex = idx;
      }
    }

    const searchText = endIndex < Infinity ? responseText.substring(0, endIndex) : responseText;

    // Multilingual chapter detection: Chapter, Rozdział (PL), Розділ (UK), Kapitel (DE)
    const chapterPattern = /^#\s*(Chapter|Rozdział|Розділ|Kapitel|Глава)\s+\d+/im;
    const firstChapter = searchText.match(chapterPattern);

    if (firstChapter) {
      chaptersText = searchText.substring(firstChapter.index).trim();
      console.log(`Sonnet: Fallback succeeded with pattern "${firstChapter[0]}", extracted ${chaptersText.length} chars`);
    } else {
      // Last resort: any markdown heading
      const anyHeading = searchText.match(/^# .+$/im);
      if (anyHeading) {
        chaptersText = searchText.substring(anyHeading.index).trim();
        console.log(`Sonnet: Using text from first heading (${chaptersText.length} chars)`);
      }
    }
  }

  // Parse JSON outline
  let outlineJson = { beats: [], motifs: {} };
  if (outline) {
    try {
      // Sanitize: remove control markers that may have leaked into JSON
      let sanitized = outline
        .replace(/⟪[A-Z_\/]+⟫/g, '')        // Remove unicode markers
        .replace(/<<<[A-Z_\/]+>>>/g, '')    // Remove ASCII markers
        .replace(/^\s*```json\s*|\s*```\s*$/g, '')  // Remove code fences
        .replace(/,\s*([}\]])/g, '$1')      // Remove trailing commas
        .trim();

      // Find the actual JSON boundaries more aggressively
      let jsonStart = -1;
      let jsonEnd = -1;

      // Find first [ or {
      for (let i = 0; i < sanitized.length; i++) {
        if (sanitized[i] === '[' || sanitized[i] === '{') {
          jsonStart = i;
          break;
        }
      }

      if (jsonStart !== -1) {
        // Find matching closing bracket
        const openChar = sanitized[jsonStart];
        const closeChar = openChar === '[' ? ']' : '}';
        let depth = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = jsonStart; i < sanitized.length; i++) {
          const char = sanitized[i];

          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === '\\') {
            escapeNext = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === openChar || (openChar === '[' && char === '{') || (openChar === '{' && char === '[')) {
              depth++;
            } else if (char === closeChar || (closeChar === ']' && char === '}') || (closeChar === '}' && char === ']')) {
              depth--;
              if (depth === 0) {
                jsonEnd = i;
                break;
              }
            }
          }
        }

        if (jsonEnd !== -1) {
          sanitized = sanitized.substring(jsonStart, jsonEnd + 1);
        }
      }

      const parsed = JSON.parse(sanitized);

      // Handle both old format (array) and new format (object with beats/chapters)
      if (Array.isArray(parsed)) {
        // Legacy format: just beats array
        outlineJson = { beats: parsed, chapters: [] };
      } else if (parsed.beats && Array.isArray(parsed.beats)) {
        // New format: object with beats and chapters
        outlineJson = {
          beats: parsed.beats,
          chapters: parsed.chapters || []
        };
      } else {
        // Unknown format
        console.warn('Unknown outline JSON format:', parsed);
        outlineJson = { beats: [], chapters: [] };
      }
    } catch (e) {
      console.error('Failed to parse outline JSON:', e);
      console.error('Raw outline:', outline?.substring(0, 200));
      outlineJson = { beats: [], chapters: [] };
    }
  }

  // Parse checklist (array of items)
  const checklistItems = checklist
    ? checklist.split('\n').filter(line => line.trim().startsWith('-')).map(line => line.trim().substring(1).trim())
    : [];

  // Parse titles (array)
  const titlesList = titles
    ? titles.split('\n').filter(line => line.trim().startsWith('-')).map(line => line.trim().substring(1).trim())
    : [];

  return {
    outline: outlineJson,
    checklist: checklistItems,
    chapters: chaptersText || '',
    titles: titlesList,
    synopsis: synopsis || ''
  };
}

/**
 * Parse Haiku Polish response
 */
export function parseHaikuPolishResponse(responseText) {
  const chapters = extractBlock(responseText, '⟪CHAPTERS⟫', '⟪/CHAPTERS⟫');
  const notes = extractBlock(responseText, '⟪NOTES⟫', '⟪/NOTES⟫');

  // Aggressive fallback for chapters - try multiple strategies
  let chaptersText = chapters;

  if (!chaptersText || chaptersText.length < 100) {
    console.log('Haiku: Primary marker extraction failed, trying fallback strategies...');

    // Find NOTES boundary (both ASCII and Unicode)
    const notesBoundaries = ['<<<NOTES>>>', '⟪NOTES⟫', '<<<END_CHAPTERS>>>', '⟪/CHAPTERS⟫'];
    let notesIndex = -1;
    for (const boundary of notesBoundaries) {
      const idx = responseText.indexOf(boundary);
      if (idx > 0 && (notesIndex === -1 || idx < notesIndex)) {
        notesIndex = idx;
      }
    }

    const searchText = notesIndex > 0 ? responseText.substring(0, notesIndex) : responseText;

    // Strategy 1: Multilingual chapter detection
    const chapterPattern = /^#\s*(Chapter|Rozdział|Розділ|Kapitel|Глава)\s+\d+/im;
    const firstChapter = searchText.match(chapterPattern);

    if (firstChapter) {
      chaptersText = searchText.substring(firstChapter.index).trim();
      console.log(`Haiku: Fallback strategy 1 succeeded with "${firstChapter[0]}": extracted ${chaptersText.length} chars`);
    }

    // Strategy 2: If still nothing, take everything before NOTES or whole text
    if (!chaptersText || chaptersText.length < 100) {
      if (notesIndex > 0) {
        chaptersText = responseText.substring(0, notesIndex).trim();
        console.log(`Haiku: Fallback strategy 2: taking text before NOTES (${chaptersText.length} chars)`);
      } else {
        // Last resort: use whole response as chapters
        chaptersText = responseText.trim();
        console.log(`Haiku: Fallback strategy 3: using entire response (${chaptersText.length} chars)`);
      }
    }
  }

  // Parse notes
  const notesObj = {
    repetition_rate_bigrams: 0,
    pacing_flags: [],
    checklist_resolution: []
  };

  if (notes) {
    const lines = notes.split('\n');
    lines.forEach(line => {
      if (line.includes('repetition_rate_bigrams:')) {
        const match = line.match(/(\d+\.?\d*)/);
        if (match) notesObj.repetition_rate_bigrams = parseFloat(match[1]);
      } else if (line.includes('pacing_flags:')) {
        const content = line.substring(line.indexOf(':') + 1).trim();
        if (content !== 'none' && content !== '[]') {
          notesObj.pacing_flags = content.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(s => s);
        }
      } else if (line.includes('checklist_resolution:')) {
        const content = line.substring(line.indexOf(':') + 1).trim();
        notesObj.checklist_resolution = content.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(s => s);
      }
    });
  }

  return {
    chapters: chaptersText || '',
    notes: notesObj
  };
}

/**
 * Parse Sonnet Assembler response
 */
export function parseSonnetAssemblerResponse(responseText) {
  if (!responseText || responseText.trim().length === 0) {
    console.error('[PARSER] Empty response from assembler');
    return { markdown: '', metadata: {} };
  }

  // Extract markdown code block
  const markdownMatch = responseText.match(/```markdown\s*\n([\s\S]*?)```/);
  let markdown = markdownMatch ? markdownMatch[1].trim() : '';

  // Fallback: If no markdown block found, try to extract everything after a heading
  if (!markdown || markdown.length === 0) {
    console.warn('[PARSER] No markdown block found, attempting fallback extraction');

    // Try to find content starting with a chapter heading
    const chapterMatch = responseText.match(/^(#\s+.+[\s\S]*)/m);
    if (chapterMatch) {
      markdown = chapterMatch[1].trim();
      console.warn('[PARSER] Fallback: Extracted content starting with chapter heading');
    } else {
      // Last resort: use entire response text (remove code block markers if present)
      markdown = responseText
        .replace(/```(?:markdown|json)?\s*\n?/g, '')
        .replace(/```\s*$/g, '')
        .trim();
      console.warn('[PARSER] Fallback: Using entire response text', {
        length: markdown.length,
        preview: markdown.substring(0, 200)
      });
    }
  }

  // Extract JSON code block
  const jsonMatch = responseText.match(/```json\s*\n([\s\S]*?)```/);
  let metadata = {};
  if (jsonMatch) {
    try {
      metadata = JSON.parse(jsonMatch[1]);
    } catch (e) {
      console.error('Failed to parse assembler metadata JSON:', e);
    }
  }

  // Final validation
  if (!markdown || markdown.length === 0) {
    console.error('[PARSER] Failed to extract any markdown content from response', {
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 500)
    });
  }

  return {
    markdown,
    metadata
  };
}

/**
 * Count words in text with language awareness
 * - Japanese/Chinese/Thai: count characters ÷ density factor (no spaces)
 * - Korean/Arabic/European: count space-separated words
 */
export function countWords(text, language = null) {
  if (!text || text.trim().length === 0) return 0;

  const trimmed = text.trim();

  // Detect languages without spaces between words
  // Japanese/Chinese: no spaces, count characters
  // Thai: no spaces, count characters
  // Korean: HAS spaces, use normal word count
  const isJapaneseChinese = language === 'ja-JP' || language === 'ja' || language === 'zh-CN' || language === 'zh';
  const isThai = language === 'th-TH' || language === 'th';

  // Auto-detect Japanese/Chinese/Thai if language not specified
  const hasJapaneseChars = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(trimmed);
  const hasThaiChars = /[\u0E00-\u0E7F]/.test(trimmed);

  if (isJapaneseChinese || isThai || hasJapaneseChars || hasThaiChars) {
    // For Japanese/Chinese/Thai: count characters (excluding punctuation and spaces)
    // Remove spaces, punctuation, and control characters
    const contentChars = trimmed
      .replace(/[\s\p{P}\p{C}]/gu, '') // Remove whitespace, punctuation, control chars
      .length;

    // Character density conversion factor
    // Japanese/Chinese: ~2.5 characters per English word equivalent
    // Thai: ~4 characters per English word equivalent (shorter words)
    const densityFactor = (isThai || hasThaiChars) ? 4 : 2.5;
    return Math.round(contentChars / densityFactor);
  }

  // For languages with spaces (including Korean, Arabic, all European languages):
  // count space-separated words
  return trimmed.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Extract chapters from markdown
 */
export function extractChapters(markdown) {
  const chapters = [];
  const chapterRegex = /^#\s+(.+?)$/gm;
  let lastIndex = 0;
  let match;

  const matches = [...markdown.matchAll(chapterRegex)];

  matches.forEach((match, i) => {
    const title = match[1].trim();
    const startIndex = match.index + match[0].length;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : markdown.length;
    const text = markdown.substring(startIndex, endIndex).trim();

    chapters.push({
      title,
      text,
      wordCount: countWords(text)
    });
  });

  return chapters;
}

/**
 * Remove ALL control markers from final text
 * This is the FINAL sanitization before returning to user
 */
export function sanitizeControlMarkers(text) {
  if (!text) return text;

  return text
    // Remove CAMERA control lines (entire line with POV/TENSE markers)
    .replace(/^⟪CAMERA:[^⟫]+⟫\s*$/gm, '')
    // Remove AUDIO_BEAT markers (entire line)
    .replace(/^⟪AUDIO_BEAT⟫\s*$/gm, '')
    // Remove all Unicode markers ⟪...⟫ (fallback for any remaining)
    .replace(/⟪[A-Z_:;\/]+[^⟫]*⟫/g, '')
    // Remove all ASCII markers <<<...>>>
    .replace(/<<<[A-Z_\/]+>>>/g, '')
    // Remove markdown code fences
    .replace(/^\s*```[a-z]*\s*$/gm, '')
    // Remove markdown chapter headers (multilingual support)
    .replace(/^#\s+(Chapter|Rozdział|Розділ|Kapitel|Глава)\s+\d+:.*$/gm, '')
    // Clean up multiple blank lines (max 2 consecutive)
    .replace(/\n{4,}/g, '\n\n\n')
    // Clean up spaces at line ends
    .replace(/[ \t]+$/gm, '')
    // Trim start and end
    .trim();
}
