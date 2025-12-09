#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "🚀 Story Generator - Starting..."

# Kill old processes
killall -9 node 2>/dev/null || true
sleep 1

# Start server
npm start
