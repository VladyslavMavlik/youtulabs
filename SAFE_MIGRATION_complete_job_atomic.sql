-- ============================================================================
-- БЕЗПЕЧНА МІГРАЦІЯ: complete_job_atomic
-- ============================================================================
-- Дата: 2025-12-09
-- Мета: Додати atomic completion function для запобігання race conditions
--
-- ⚠️  ВАЖЛИВО:
-- - Ця міграція НЕ видаляє існуючі функції
-- - Ця міграція НЕ змінює таблиці
-- - Ця міграція ТІЛЬКИ створює/оновлює одну функцію
-- - Існуючі функції (refund_balance_atomic, refund_job_atomic) НЕ ЧІПАЮТЬСЯ
-- ============================================================================

-- Перевірка чи існує таблиця story_jobs (має існувати)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'story_jobs') THEN
    RAISE EXCEPTION 'Таблиця story_jobs не існує! Міграція неможлива.';
  END IF;
END $$;

-- Створення/оновлення функції complete_job_atomic
-- CREATE OR REPLACE = безпечно перестворює функцію якщо існує, створює якщо немає
CREATE OR REPLACE FUNCTION complete_job_atomic(
  p_job_id TEXT,
  p_story_id UUID,
  p_generation_time NUMERIC,
  p_quality_score NUMERIC,
  p_word_count INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  -- CRITICAL: Lock the job row for the duration of this transaction
  -- This prevents two workers from completing the same job simultaneously
  SELECT status INTO v_current_status
  FROM story_jobs
  WHERE job_id = p_job_id
  FOR UPDATE;

  -- If job not found, return error
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Job not found',
      'job_id', p_job_id
    );
  END IF;

  -- If job is already completed, skip update (idempotency protection)
  IF v_current_status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'error', 'Job already completed',
      'job_id', p_job_id,
      'status', v_current_status,
      'was_duplicate', true
    );
  END IF;

  -- If job was already failed/refunded, don't overwrite (protection)
  IF v_current_status = 'failed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Job already failed and refunded - cannot complete',
      'job_id', p_job_id,
      'status', v_current_status,
      'was_stalled', true
    );
  END IF;

  -- Job is in 'processing' status - proceed with completion
  UPDATE story_jobs
  SET
    status = 'completed',
    completed_at = NOW(),
    story_id = p_story_id,
    result = jsonb_build_object(
      'storyId', p_story_id,
      'generationTime', p_generation_time,
      'quality', p_quality_score,
      'words', p_word_count
    )
  WHERE job_id = p_job_id
    AND status = 'processing';  -- Conditional update: only if still processing

  -- Check if update was successful
  IF NOT FOUND THEN
    -- Status changed between our check and update (rare edge case)
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Job status changed during update',
      'job_id', p_job_id
    );
  END IF;

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'story_id', p_story_id,
    'completed', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Надання прав service_role (backend worker)
-- REVOKE перед GRANT гарантує чисті права
REVOKE ALL ON FUNCTION complete_job_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_job_atomic TO service_role;

-- Коментар для документації
COMMENT ON FUNCTION complete_job_atomic IS 'Atomically completes a story generation job with race condition protection. Used by backend worker only.';

-- ============================================================================
-- ТЕСТУВАННЯ (виконай ці запити після міграції)
-- ============================================================================

-- Тест 1: Спроба завершити неіснуючий job (має повернути error)
-- SELECT complete_job_atomic(
--   'test-nonexistent-job',
--   '00000000-0000-0000-0000-000000000000'::uuid,
--   12.5,
--   0.85,
--   2500
-- );
-- Очікуваний результат: {"success": false, "error": "Job not found"}

-- Тест 2: Перевірка що функція існує
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name = 'complete_job_atomic';
-- Очікуваний результат: 1 рядок (routine_name: complete_job_atomic, routine_type: FUNCTION)

-- Тест 3: Перевірка прав доступу
-- SELECT grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public'
--   AND routine_name = 'complete_job_atomic';
-- Очікуваний результат: service_role має EXECUTE

-- ============================================================================
-- ROLLBACK (якщо треба видалити функцію)
-- ============================================================================
-- DROP FUNCTION IF EXISTS complete_job_atomic(TEXT, UUID, NUMERIC, NUMERIC, INTEGER);

-- ============================================================================
-- КІНЕЦЬ МІГРАЦІЇ
-- ============================================================================
