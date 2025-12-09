/**
 * Sonnet Assembler Prompt Builder (for long mode - joins multiple acts)
 */
import { ROMANCE_ASSEMBLY_STYLE, shouldApplyRomanceSafety } from './romanceSafetyModule.js';
import { buildPOVDirectives } from './povDirectives.js';
import { stylePolicyForGenre } from './stylePolicy.js';

export function buildSonnetAssemblerPrompt({ allActsMarkdown, language, genre, pov = 'third' }) {
  // Add POV directives
  const povDirectives = `

${buildPOVDirectives(pov, process.env.POV_TENSE || 'auto', language)}`;

  // Add style policy
  const stylePolicyEnabled = process.env.STYLE_POLICY === 'on' || process.env.STYLE_POLICY === 'conditional';
  const stylePolicy = stylePolicyEnabled ? `

${stylePolicyForGenre(genre)}` : '';

  const systemPrompt = `You are an Assembler. Return exactly two blocks: MARKDOWN book, then JSON metadata.${povDirectives}${stylePolicy}`;

  // Add romance assembly style if needed
  const romanceAssemblyGuidance = shouldApplyRomanceSafety(genre) ? `

${ROMANCE_ASSEMBLY_STYLE}` : '';

  const userPrompt = `ACTS_MARKDOWN (in order):

${allActsMarkdown.map((act, i) => `=== ACT ${i + 1} ===\n${act}\n`).join('\n')}

TASKS:
- Normalize tense/voice/style across all acts for consistency
- Maintain the same POV as specified in [POV_RULES] throughout all chapters
- RESPECT ⟪CAMERA:...⟫ lines from source acts; keep internal access ONLY to that character
- DO NOT normalize to omniscient narrator during assembly; keep interior monologue tethered to CAMERA owner
- Join as chapters with continuous numbering (Chapter 1, 2, 3... across all acts)
- Smooth any jarring transitions between acts
- Produce a table of contents with per-chapter word counts
- Write a one-sentence logline for each chapter
- Write a ~200-word synopsis of the complete story${romanceAssemblyGuidance}

OUTPUT FORMAT:

\`\`\`markdown
# Chapter 1: [Title]

[Text...]

# Chapter 2: [Title]

[Text...]

[... all chapters ...]
\`\`\`

\`\`\`json
{
  "total_words": 18000,
  "chapter_word_counts": {
    "Chapter 1": 1200,
    "Chapter 2": 1350,
    ...
  },
  "chapter_loglines": {
    "Chapter 1": "One sentence summary",
    "Chapter 2": "One sentence summary",
    ...
  },
  "synopsis": "~200 word complete story summary"
}
\`\`\``;

  return { systemPrompt, userPrompt };
}
