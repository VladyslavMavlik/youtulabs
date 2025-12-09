#!/bin/bash
# Run audio_generations migration via Supabase Management API

set -e

SUPABASE_ACCESS_TOKEN="sbp_d3645cf1f56b83d96cb9d73600ea885c0d0c80f1"
PROJECT_REF="xcqjtdfvsgvuglllxgzc"

echo "[MIGRATION] Reading SQL file..."
SQL_CONTENT=$(cat src/database/migration_audio_generations.sql)

echo "[MIGRATION] Executing migration via Management API..."

# Execute SQL via Management API
RESPONSE=$(curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$SQL_CONTENT" | jq -Rs .)}")

echo "[MIGRATION] Response: $RESPONSE"

if echo "$RESPONSE" | grep -q "error"; then
  echo "[MIGRATION] ❌ Migration failed"
  echo "$RESPONSE" | jq .
  exit 1
else
  echo "[MIGRATION] ✅ Migration completed successfully!"
fi
