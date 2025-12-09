/**
 * Monetization Gate - YouTube/TTS safety layer
 * Checks for explicit lexemes that may trigger demonetization
 */
console.log('[LOAD] monetizationGate.js');

/**
 * Language-specific sexual/explicit lexeme dictionaries
 * These are risky words for monetization, even if not forbidden
 */
const SEXUAL_LEXEMES = {
  'en-US': [
    // Body/anatomy
    'naked', 'nude', 'undress', 'lingerie', 'bra', 'panties', 'underwear',
    'breast', 'nipple', 'thigh', 'crotch', 'groin',
    // Actions
    'thrust', 'moan', 'groan', 'climax', 'orgasm', 'seduce', 'arouse',
    'fondle', 'caress', 'stroke', 'touch', 'kiss', 'lick',
    // Contexts
    'bedroom', 'bed', 'sheets', 'mattress', 'shower', 'bath',
    // Descriptors
    'desire', 'lust', 'passion', 'arousal', 'erotic', 'sensual',
    'sexy', 'hot', 'steamy', 'intimate'
  ],
  'uk-UA': [
    // Тіло/анатомія
    'голий', 'гола', 'роздягнути', 'білизна', 'бюстгальтер', 'труси',
    'груди', 'сосок', 'стегно', 'пах',
    // Дії
    'стогнати', 'стогін', 'оргазм', 'кульмінація', 'збудити', 'спокуса',
    'лагідити', 'гладити', 'торкатись', 'цілувати', 'лизати',
    // Контексти
    'спальня', 'ліжко', 'простирадло', 'матрац', 'душ', 'ванна',
    // Дескриптори
    'бажання', 'пристрасть', 'хтивість', 'збудження', 'еротичний', 'чуттєвий',
    'сексуальний', 'гарячий', 'інтимний'
  ],
  'pl-PL': [
    // Ciało/anatomia
    'nagi', 'naga', 'rozebrać', 'bielizna', 'biustonosz', 'majtki',
    'piersi', 'sutek', 'udo', 'krocze',
    // Działania
    'jęczeć', 'jęk', 'orgazm', 'kulminacja', 'podniecić', 'uwieść',
    'pieścić', 'głaskać', 'dotykać', 'całować', 'lizać',
    // Konteksty
    'sypialnia', 'łóżko', 'prześcieradło', 'materac', 'prysznic', 'wanna',
    // Deskryptory
    'pożądanie', 'namiętność', 'pożądliwość', 'podniecenie', 'erotyczny', 'zmysłowy',
    'seksowny', 'gorący', 'intymny'
  ]
};

/**
 * Forbidden terms for YouTube metadata (title/description/tags)
 */
const METADATA_FORBIDDEN = {
  'en-US': [
    'sex', 'sexy', 'naked', 'nude', 'threesome', 'fetish', 'xxx',
    'porn', 'erotic', 'orgasm', 'bondage', 'kinky', 'nsfw'
  ],
  'uk-UA': [
    'секс', 'сексуальний', 'голий', 'трійка', 'фетиш', 'порно',
    'еротика', 'оргазм', 'бондаж', 'nsfw'
  ],
  'pl-PL': [
    'seks', 'seksowny', 'nagi', 'trójkąt', 'fetysz', 'porno',
    'erotyczny', 'orgazm', 'bondage', 'nsfw'
  ]
};

/**
 * Allowed safe alternatives for metadata
 */
const METADATA_SAFE_ALTERNATIVES = [
  'affair', 'betrayal', 'jealousy', 'trust', 'marriage', 'pact',
  'boundary', 'infidelity', 'temptation', 'forbidden', 'secret',
  'зрада', 'ревнощі', 'довіра', 'шлюб', 'межі', 'спокуса', 'заборонений',
  'zdrada', 'zazdrość', 'zaufanie', 'małżeństwo', 'granice', 'pokusa'
];

/**
 * Extract all quoted text from story
 * Returns array of dialogue strings
 */
function extractQuotedText(text) {
  const quotes = [];

  // Match text between various quote styles
  const patterns = [
    /"([^"]+)"/g,      // English quotes
    /«([^»]+)»/g,      // Ukrainian quotes
    /„([^"]+)"/g,      // Polish quotes
    /'([^']+)'/g       // Single quotes
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      quotes.push(match[1]);
    }
  }

  return quotes;
}

/**
 * Count sexual lexemes per 1000 words
 * Returns { density, hits: [{word, count}] }
 */
export function checkSexualLexemeDensity(text, languageCode = 'en-US') {
  const lexemes = SEXUAL_LEXEMES[languageCode] || SEXUAL_LEXEMES['en-US'];
  const totalWords = text.split(/\s+/).length;

  const hits = [];
  let totalHits = 0;

  // Count each lexeme
  for (const lexeme of lexemes) {
    const regex = new RegExp(`\\b${lexeme}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches) {
      const count = matches.length;
      hits.push({ word: lexeme, count });
      totalHits += count;
    }
  }

  const density = (totalHits / totalWords) * 1000;

  return {
    density: parseFloat(density.toFixed(2)),
    totalHits,
    hits: hits.sort((a, b) => b.count - a.count).slice(0, 10), // Top 10
    threshold: density > 4 ? 'fail' : density > 2 ? 'warn' : 'pass'
  };
}

/**
 * Scan quoted dialogue for explicit terms
 * Returns { inQuotesHits, quotesWithIssues: [{quote, issues}] }
 */
export function scanInQuotes(text, languageCode = 'en-US') {
  const quotedTexts = extractQuotedText(text);
  const lexemes = SEXUAL_LEXEMES[languageCode] || SEXUAL_LEXEMES['en-US'];

  const quotesWithIssues = [];
  let totalInQuotesHits = 0;

  for (const quote of quotedTexts) {
    const issues = [];

    for (const lexeme of lexemes) {
      const regex = new RegExp(`\\b${lexeme}\\b`, 'gi');
      if (regex.test(quote)) {
        issues.push(lexeme);
        totalInQuotesHits++;
      }
    }

    if (issues.length > 0) {
      quotesWithIssues.push({
        quote: quote.length > 50 ? quote.substring(0, 50) + '...' : quote,
        issues
      });
    }
  }

  return {
    inQuotesHits: totalInQuotesHits,
    quotesWithIssues: quotesWithIssues.slice(0, 5), // Top 5 problematic quotes
    threshold: totalInQuotesHits > 3 ? 'warn' : 'pass'
  };
}

/**
 * Sanitize metadata (title/description/tags) for YouTube
 * Returns { text, sanitized: boolean, removedTerms: [] }
 */
export function sanitizeMetadata(text, languageCode = 'en-US') {
  const forbidden = METADATA_FORBIDDEN[languageCode] || METADATA_FORBIDDEN['en-US'];

  let sanitized = text;
  const removedTerms = [];

  for (const term of forbidden) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    if (regex.test(sanitized)) {
      sanitized = sanitized.replace(regex, '***');
      removedTerms.push(term);
    }
  }

  return {
    text: sanitized,
    sanitized: removedTerms.length > 0,
    removedTerms
  };
}

/**
 * Main monetization gate - check if text is safe for monetization
 * Returns { passed: 'passed'|'warn'|'fail', metrics, needsPatch }
 */
export function monetizationGate(text, languageCode = 'en-US', genreCode = null) {
  // Only apply to romance/drama genres
  const romanceGenres = ['romance', 'family_drama', 'noir_drama'];
  if (genreCode && !romanceGenres.includes(genreCode)) {
    return {
      passed: 'passed',
      metrics: {},
      needsPatch: false,
      reason: 'genre_exempted'
    };
  }

  // Check 1: Sexual lexeme density
  const densityCheck = checkSexualLexemeDensity(text, languageCode);

  // Check 2: In-quotes scan
  const quotesCheck = scanInQuotes(text, languageCode);

  // Determine overall status
  let passed = 'passed';
  let needsPatch = false;

  if (densityCheck.threshold === 'fail' || quotesCheck.threshold === 'warn') {
    passed = 'fail';
    needsPatch = true;
  } else if (densityCheck.threshold === 'warn') {
    passed = 'warn';
  }

  return {
    passed,
    metrics: {
      lexemeDensity: densityCheck.density,
      lexemeHits: densityCheck.totalHits,
      topLexemes: densityCheck.hits,
      inQuotesHits: quotesCheck.inQuotesHits,
      problematicQuotes: quotesCheck.quotesWithIssues
    },
    needsPatch,
    patchType: needsPatch ? 'implication_rewrite' : null
  };
}

/**
 * Check if genre requires monetization gate
 */
export function shouldApplyMonetizationGate(genreCode) {
  const romanceGenres = ['romance', 'family_drama', 'noir_drama'];
  return romanceGenres.includes(genreCode);
}
