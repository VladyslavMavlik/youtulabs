/**
 * Voice Synthesis API Routes
 *
 * Проксі-роути для інтеграції з Voice API (voiceapi.csv666.ru)
 * Документація API: https://voiceapi.csv666.ru/docs
 */

import express from 'express';
import {
  authenticateUser,
  checkAndDeductBalance,
  refundBalance,
  calculateAudioCost,
  supabaseAdmin
} from '../server.js';

const router = express.Router();

// Voice API Configuration
const VOICE_API_URL = process.env.VOICE_API_URL || 'https://voiceapi.csv666.ru';
const VOICE_API_KEY = process.env.VOICE_API_KEY;

if (!VOICE_API_KEY) {
  console.warn('[VOICE_API] ⚠️  VOICE_API_KEY not configured. Voice synthesis will be unavailable.');
}

// Middleware для перевірки API ключа
function requireVoiceAPI(req, res, next) {
  if (!VOICE_API_KEY) {
    return res.status(503).json({
      error: 'Voice API not configured',
      detail: 'VOICE_API_KEY environment variable is not set'
    });
  }
  next();
}

/**
 * GET /api/voice/templates
 * Отримати список доступних шаблонів голосів користувача
 */
router.get('/templates', requireVoiceAPI, async (req, res) => {
  try {
    console.log('[VOICE_API] Fetching templates...');

    const response = await fetch(`${VOICE_API_URL}/templates`, {
      method: 'GET',
      headers: {
        'X-API-Key': VOICE_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      console.error('[VOICE_API] Templates fetch failed:', response.status, errorData);
      return res.status(response.status).json({
        error: 'Failed to fetch templates',
        detail: errorData.detail || 'Unknown error',
        status: response.status
      });
    }

    const templates = await response.json();
    console.log('[VOICE_API] ✅ Templates fetched:', templates.length);

    res.json(templates);
  } catch (error) {
    console.error('[VOICE_API] Templates fetch error:', error);
    res.status(500).json({
      error: 'Internal server error',
      detail: error.message
    });
  }
});

/**
 * GET /api/voice/balance
 * Отримати поточний баланс користувача
 */
router.get('/balance', requireVoiceAPI, async (req, res) => {
  try {
    console.log('[VOICE_API] Fetching balance...');

    const response = await fetch(`${VOICE_API_URL}/balance`, {
      method: 'GET',
      headers: {
        'X-API-Key': VOICE_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      console.error('[VOICE_API] Balance fetch failed:', response.status, errorData);
      return res.status(response.status).json({
        error: 'Failed to fetch balance',
        detail: errorData.detail || 'Unknown error',
        status: response.status
      });
    }

    const balanceData = await response.json();

    // Voice API повертає баланс в символах (з пробілами)
    // Перераховуємо хвилини за стандартом ElevenLabs: 1000 символів = 1 хвилина
    const balanceInCharacters = balanceData.balance;
    const estimatedMinutes = Math.floor(balanceInCharacters / 1000);

    // Форматуємо відповідь з правильними хвилинами
    const formattedResponse = {
      telegram_id: balanceData.telegram_id,
      balance: balanceInCharacters,
      balance_text: `${balanceInCharacters.toLocaleString('ru-RU')} символів (~${estimatedMinutes} хв)`
    };

    console.log('[VOICE_API] ✅ Balance fetched:', formattedResponse.balance_text);

    res.json(formattedResponse);
  } catch (error) {
    console.error('[VOICE_API] Balance fetch error:', error);
    res.status(500).json({
      error: 'Internal server error',
      detail: error.message
    });
  }
});

/**
 * POST /api/voice/synthesize
 * Створити задачу на синтез мовлення (з оплатою кристалами)
 *
 * Body:
 * {
 *   text: string (required) - текст для озвучення
 *   voice_name?: string - назва голосу
 *   chunk_size?: number (500-2000) - розмір чанків
 *   pause_settings?: object
 *   stress_settings?: object
 * }
 */
router.post('/synthesize', authenticateUser, requireVoiceAPI, async (req, res) => {
  try {
    const { text, voice_id, voice_name, chunk_size, pause_settings, stress_settings } = req.body;
    const userId = req.user.id;
    const userToken = req.userToken;

    // Валідація
    if (!text || typeof text !== 'string' || text.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        detail: 'Text is required and must be a non-empty string'
      });
    }

    if (text.length > 50000) {
      return res.status(400).json({
        error: 'Text too long',
        detail: 'Maximum text length is 50,000 characters'
      });
    }

    if (chunk_size && (chunk_size < 500 || chunk_size > 2000)) {
      return res.status(400).json({
        error: 'Invalid chunk_size',
        detail: 'chunk_size must be between 500 and 2000'
      });
    }

    // Розрахунок вартості в кристалах
    // Формула: 100 символів = 1 кристал (округлення вгору)
    const characterCount = text.length;
    const crystalsCost = calculateAudioCost(characterCount);

    console.log('[VOICE_API] Creating synthesis task...');
    console.log(`[VOICE_API] User ID: ${userId}`);
    console.log(`[VOICE_API] Text length: ${characterCount} chars`);
    console.log(`[VOICE_API] Crystals cost: ${crystalsCost} crystals`);

    // Списання кристалів перед генерацією
    const deductResult = await checkAndDeductBalance(
      userId,
      crystalsCost,
      `Audio generation: ${characterCount} characters`,
      userToken
    );

    if (!deductResult.success) {
      console.error('[VOICE_API] ❌ Balance deduction failed:', deductResult.error);
      return res.status(402).json({
        error: 'Insufficient balance',
        detail: deductResult.error,
        required: crystalsCost,
        current: deductResult.currentBalance || 0
      });
    }

    console.log(`[VOICE_API] ✅ Deducted ${crystalsCost} crystals. New balance: ${deductResult.newBalance}`);

    // Пошук шаблону голосу
    if (voice_name) console.log(`[VOICE_API] Voice Name: ${voice_name}`);

    // Find template by voice name (templates match voice names)
    let template_uuid = null;
    if (voice_name) {
      try {
        const templatesResponse = await fetch(`${VOICE_API_URL}/templates`, {
          headers: { 'X-API-Key': VOICE_API_KEY }
        });

        if (templatesResponse.ok) {
          const templates = await templatesResponse.json();
          const matchingTemplate = templates.find(t => t.name === voice_name);
          if (matchingTemplate) {
            template_uuid = matchingTemplate.uuid;
            console.log(`[VOICE_API] ✅ Found template UUID: ${template_uuid}`);
          } else {
            console.log(`[VOICE_API] ⚠️  No template found for voice: ${voice_name}, using default`);
          }
        }
      } catch (err) {
        console.error('[VOICE_API] Error fetching templates:', err);
      }
    }

    const requestBody = {
      text,
      template_uuid: template_uuid || null,
      chunk_size: chunk_size || null,
      pause_settings: pause_settings || null,
      stress_settings: stress_settings || null
    };

    const response = await fetch(`${VOICE_API_URL}/tasks`, {
      method: 'POST',
      headers: {
        'X-API-Key': VOICE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    // Handle non-OK responses
    if (!response.ok) {
      const responseText = await response.text();
      let errorDetail = 'Unknown error';
      let errorData = null;

      try {
        errorData = JSON.parse(responseText);
        errorDetail = errorData.detail || errorDetail;
      } catch {
        // If response is not JSON, use the text directly
        errorDetail = responseText || errorDetail;
      }

      // Special handling for rate limit errors
      if (response.status === 429) {
        errorDetail = 'Too many requests to Voice API. Please wait a moment and try again.';
      }

      console.error('[VOICE_API] Synthesis creation failed:', response.status, errorDetail);

      // Повернути кристали при помилці API
      await refundBalance(userId, crystalsCost, `Audio generation failed: ${errorDetail}`);
      console.log(`[VOICE_API] ⚠️  Refunded ${crystalsCost} crystals due to API error`);

      return res.status(response.status).json({
        error: 'Failed to create synthesis task',
        detail: errorDetail,
        errors: errorData?.errors || null,
        status: response.status
      });
    }

    // Parse successful response
    const responseData = await response.json();

    const taskId = responseData.task_id;
    console.log('[VOICE_API] ✅ Synthesis task created:', taskId);

    // Зберегти task в БД для відстеження
    try {
      const { error: dbError } = await supabaseAdmin
        .from('audio_tasks')
        .insert({
          task_id: taskId,
          user_id: userId,
          status: 'waiting',
          text: text,
          voice_template_id: template_uuid || 'default',
          character_count: characterCount,
          crystals_cost: crystalsCost,
          crystals_refunded: false
        });

      if (dbError) {
        console.error('[VOICE_API] ⚠️  Failed to save task to DB:', dbError);
        // Продовжуємо навіть якщо не вдалося зберегти в БД
      } else {
        console.log('[VOICE_API] ✅ Task saved to database');
      }
    } catch (dbError) {
      console.error('[VOICE_API] Database error:', dbError);
    }

    res.json({
      task_id: taskId,
      message: responseData.message,
      crystals_cost: crystalsCost,
      character_count: characterCount
    });
  } catch (error) {
    console.error('[VOICE_API] Synthesis creation error:', error);

    // Повернути кристали при серверній помилці
    try {
      await refundBalance(userId, crystalsCost, `Audio generation error: ${error.message}`);
      console.log(`[VOICE_API] ⚠️  Refunded ${crystalsCost} crystals due to server error`);
    } catch (refundError) {
      console.error('[VOICE_API] Failed to refund crystals:', refundError);
    }

    res.status(500).json({
      error: 'Internal server error',
      detail: error.message
    });
  }
});

/**
 * GET /api/voice/status/:taskId
 * Отримати статус задачі синтезу (з автоматичним поверненням кристалів при помилці)
 *
 * Можливі статуси:
 * - waiting: Ожидание очереди
 * - processing: Обработка
 * - ending: Ожидание отправки результата
 * - ending_processed: Заказ завершён (результат готовий)
 * - error: Возникла ошибка (кристали повертаються автоматично)
 * - error_handled: Баланс за ошибку уже вернули
 */
router.get('/status/:taskId', requireVoiceAPI, async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId || isNaN(parseInt(taskId))) {
      return res.status(400).json({
        error: 'Invalid task ID',
        detail: 'Task ID must be a valid number'
      });
    }

    const response = await fetch(`${VOICE_API_URL}/tasks/${taskId}/status`, {
      method: 'GET',
      headers: {
        'X-API-Key': VOICE_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));

      if (response.status === 404) {
        return res.status(404).json({
          error: 'Task not found',
          detail: `Task with ID ${taskId} does not exist`
        });
      }

      console.error('[VOICE_API] Status check failed:', response.status, errorData);
      return res.status(response.status).json({
        error: 'Failed to check task status',
        detail: errorData.detail || 'Unknown error',
        status: response.status
      });
    }

    const statusData = await response.json();
    const currentStatus = statusData.status;

    // Оновити статус в БД
    try {
      const { data: taskRecord } = await supabaseAdmin
        .from('audio_tasks')
        .select('*')
        .eq('task_id', taskId)
        .single();

      if (taskRecord) {
        // Оновити статус
        await supabaseAdmin
          .from('audio_tasks')
          .update({
            status: currentStatus,
            ...(currentStatus === 'processing' && !taskRecord.started_at ? { started_at: new Date().toISOString() } : {}),
            ...(currentStatus === 'ending_processed' && !taskRecord.completed_at ? { completed_at: new Date().toISOString() } : {}),
            ...(statusData.result ? { result: statusData.result } : {}),
            ...(statusData.error ? { error: statusData.error } : {})
          })
          .eq('task_id', taskId);

        // Якщо статус = error і кристали ще не повернуті - повернути
        if (currentStatus === 'error' && !taskRecord.crystals_refunded) {
          await refundBalance(
            taskRecord.user_id,
            taskRecord.crystals_cost,
            `Audio generation failed for task ${taskId}`
          );

          await supabaseAdmin
            .from('audio_tasks')
            .update({ crystals_refunded: true })
            .eq('task_id', taskId);

          console.log(`[VOICE_API] ⚠️  Auto-refunded ${taskRecord.crystals_cost} crystals for failed task ${taskId}`);
        }
      }
    } catch (dbError) {
      console.error('[VOICE_API] Database update error:', dbError);
      // Продовжуємо навіть при помилці БД
    }

    res.json(statusData);
  } catch (error) {
    console.error('[VOICE_API] Status check error:', error);
    res.status(500).json({
      error: 'Internal server error',
      detail: error.message
    });
  }
});

/**
 * GET /api/voice/result/:taskId
 * Отримати результат синтезу (аудіо файл MP3 або ZIP)
 *
 * Умови:
 * - Задача повинна бути в статусі ending або ending_processed
 * - Файл результату повинен існувати
 *
 * Після успішного отримання задача переходить в статус ending_processed
 */
router.get('/result/:taskId', requireVoiceAPI, async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId || isNaN(parseInt(taskId))) {
      return res.status(400).json({
        error: 'Invalid task ID',
        detail: 'Task ID must be a valid number'
      });
    }

    console.log(`[VOICE_API] Fetching result for task ${taskId}...`);

    const response = await fetch(`${VOICE_API_URL}/tasks/${taskId}/result`, {
      method: 'GET',
      headers: {
        'X-API-Key': VOICE_API_KEY
      }
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();

        if (response.status === 202) {
          return res.status(202).json({
            error: 'Result not ready',
            detail: 'The audio is still being generated. Please try again later.',
            status: 'processing'
          });
        }

        if (response.status === 404) {
          return res.status(404).json({
            error: 'Task not found',
            detail: `Task with ID ${taskId} does not exist`
          });
        }

        if (response.status === 500) {
          return res.status(500).json({
            error: 'Result file not found',
            detail: 'The synthesis completed but the audio file is missing. Please contact support.'
          });
        }

        console.error('[VOICE_API] Result fetch failed:', response.status, errorData);
        return res.status(response.status).json({
          error: 'Failed to fetch result',
          detail: errorData.detail || 'Unknown error',
          status: response.status
        });
      }

      // Non-JSON error response
      return res.status(response.status).json({
        error: 'Failed to fetch result',
        detail: response.statusText,
        status: response.status
      });
    }

    // Успішна відповідь - аудіо файл
    const contentType = response.headers.get('content-type');

    console.log(`[VOICE_API] ✅ Result fetched for task ${taskId}`);
    console.log(`[VOICE_API] Content-Type: ${contentType}`);

    // Передаємо файл клієнту з кастомною назвою
    const customFilename = `audio_youtulabs_${taskId}.mp3`;
    console.log(`[VOICE_API] Setting filename: ${customFilename}`);
    res.setHeader('Content-Type', contentType || 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${customFilename}"`);

    // Get audio as buffer and send to client
    const audioBuffer = await response.arrayBuffer();
    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error('[VOICE_API] Result fetch error:', error);
    res.status(500).json({
      error: 'Internal server error',
      detail: error.message
    });
  }
});

export default router;
