/**
 * Schema Validation with Zod
 */

import { z } from 'zod';

/**
 * Beat outline schema
 */
const BeatSchema = z.object({
  index: z.number(),
  name: z.string().min(1),
  goal: z.string().min(1),
  open_q: z.array(z.string()).optional()
});

/**
 * Sonnet Planner output schema
 */
export const SonnetPlannerSchema = z.object({
  outline: z.array(BeatSchema).min(1),
  checklist: z.array(z.string()),
  chapters: z.string().min(100),
  titles: z.array(z.string()).min(1),
  synopsis: z.string().min(50)
});

/**
 * Haiku Polish output schema
 */
export const HaikuPolishSchema = z.object({
  chapters: z.string().min(100),
  notes: z.object({
    repetition_rate_bigrams: z.number().min(0),
    pacing_flags: z.array(z.string()),
    checklist_resolution: z.array(z.string())
  })
});

/**
 * Validate Sonnet Planner response
 */
export function validateSonnetPlannerResponse(data) {
  try {
    return {
      success: true,
      data: SonnetPlannerSchema.parse(data),
      errors: []
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        data: null,
        errors: error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      };
    }
    return {
      success: false,
      data: null,
      errors: [{ path: 'unknown', message: error.message }]
    };
  }
}

/**
 * Validate Haiku Polish response
 */
export function validateHaikuPolishResponse(data) {
  try {
    return {
      success: true,
      data: HaikuPolishSchema.parse(data),
      errors: []
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        data: null,
        errors: error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      };
    }
    return {
      success: false,
      data: null,
      errors: [{ path: 'unknown', message: error.message }]
    };
  }
}

/**
 * Fix missing or invalid data with defaults
 */
export function fixInvalidData(data, validationResult) {
  if (validationResult.success) return data;

  const fixed = { ...data };

  validationResult.errors.forEach(error => {
    if (error.path === 'outline') {
      fixed.outline = fixed.outline || [];
    }
    if (error.path === 'checklist') {
      fixed.checklist = fixed.checklist || [];
    }
    if (error.path === 'chapters') {
      fixed.chapters = fixed.chapters || '';
    }
    if (error.path === 'titles') {
      fixed.titles = fixed.titles || ['Untitled Story'];
    }
    if (error.path === 'synopsis') {
      fixed.synopsis = fixed.synopsis || 'Synopsis unavailable';
    }
  });

  return fixed;
}
