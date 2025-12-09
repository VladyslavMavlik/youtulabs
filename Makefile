# YouTuLabs v1.2.15 - Development & Deployment
# Usage: make <command>

# Configuration
SERVER := root@46.224.42.246
REMOTE_PATH := /var/www/youtulabs-production
FRONTEND_DIR := Genisss-main

.PHONY: dev build deploy deploy-frontend logs status restart help

# Default target
help:
	@echo "YouTuLabs v1.2.15 Commands:"
	@echo ""
	@echo "  Development:"
	@echo "    make dev          - Start frontend dev server (localhost:5174)"
	@echo "    make build        - Build frontend for production"
	@echo "    make install      - Install npm dependencies"
	@echo ""
	@echo "  Deployment:"
	@echo "    make deploy       - Full deploy: build + sync + restart"
	@echo "    make sync         - Only sync files to server (no rebuild)"
	@echo "    make restart      - Restart frontend container on server"
	@echo ""
	@echo "  Server:"
	@echo "    make logs         - Show frontend container logs"
	@echo "    make logs-backend - Show backend container logs"
	@echo "    make logs-worker  - Show worker container logs"
	@echo "    make status       - Show all containers status"
	@echo "    make ssh          - SSH into server"
	@echo ""

# === Development ===

dev:
	@echo "Starting frontend dev server..."
	cd $(FRONTEND_DIR) && npm run dev

build:
	@echo "Building frontend..."
	cd $(FRONTEND_DIR) && npm run build
	@echo "Build complete: $(FRONTEND_DIR)/build/"

install:
	@echo "Installing dependencies..."
	cd $(FRONTEND_DIR) && npm ci

# === Deployment ===

deploy: build sync rebuild
	@echo "Deploy complete!"

sync:
	@echo "Syncing to server..."
	rsync -avz --delete \
		--exclude 'node_modules' \
		--exclude '.git' \
		./$(FRONTEND_DIR)/ \
		$(SERVER):$(REMOTE_PATH)/DEPLOY_ARCHIVE/Genisss-main/
	@echo "Sync complete"

rebuild:
	@echo "Rebuilding Docker container..."
	ssh $(SERVER) "cd $(REMOTE_PATH) && docker compose build --no-cache frontend && docker compose up -d frontend"
	@echo "Container rebuilt and restarted"

restart:
	@echo "Restarting frontend container..."
	ssh $(SERVER) "cd $(REMOTE_PATH) && docker compose restart frontend"

# === Server Monitoring ===

logs:
	ssh $(SERVER) "docker logs youtulabs-production-frontend-1 --tail 50 -f"

logs-backend:
	ssh $(SERVER) "docker logs youtulabs-production-backend-1 --tail 100 -f"

logs-worker:
	ssh $(SERVER) "docker logs youtulabs-production-worker-1 --tail 100 -f"

status:
	@echo "Server containers status:"
	ssh $(SERVER) "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

ssh:
	ssh $(SERVER)

# === Quick commands ===

# Quick deploy without rebuild (just sync and restart nginx)
quick:
	@echo "Quick deploy (sync only, no Docker rebuild)..."
	$(MAKE) sync
	ssh $(SERVER) "cd $(REMOTE_PATH) && docker compose restart frontend"
	@echo "Quick deploy complete"
