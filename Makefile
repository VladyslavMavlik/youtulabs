# YouTuLabs v1.2.15 - Development & Deployment
# Usage: make <command>

# Configuration
SERVER := root@46.224.42.246
REMOTE_PATH := /var/www/youtulabs-production
FRONTEND_DIR := Genisss-main
REPO_URL := https://github.com/VladyslavMavlik/youtulabs.git

.PHONY: dev build deploy logs status restart help git-push git-status

# Default target
help:
	@echo "YouTuLabs v1.2.15 Commands:"
	@echo ""
	@echo "  Development:"
	@echo "    make dev          - Start frontend dev server (localhost:5174)"
	@echo "    make build        - Build frontend for production"
	@echo "    make install      - Install npm dependencies"
	@echo ""
	@echo "  Git:"
	@echo "    make push         - Commit and push to develop branch"
	@echo "    make git-status   - Show git status"
	@echo ""
	@echo "  Deployment:"
	@echo "    make deploy       - Deploy: git pull + rebuild containers"
	@echo "    make deploy-quick - Quick deploy: git pull + restart (no rebuild)"
	@echo "    make restart      - Just restart containers"
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

# === Git ===

push:
	@echo "Committing and pushing to develop..."
	git add .
	@read -p "Commit message: " msg; git commit -m "$$msg"
	git push origin develop
	@echo "Pushed to develop!"

git-status:
	git status

# === Deployment (Git-based) ===

deploy:
	@echo "=== Full Deploy ==="
	@echo "1. Pushing local changes..."
	git add .
	-git commit -m "Deploy update" || true
	git push origin develop
	@echo "2. Pulling on server..."
	ssh $(SERVER) "cd $(REMOTE_PATH) && git pull origin main"
	@echo "3. Rebuilding containers..."
	ssh $(SERVER) "cd $(REMOTE_PATH) && docker compose build --no-cache && docker compose up -d"
	@echo "4. Copying frontend files..."
	ssh $(SERVER) "docker cp youtulabs-production-frontend-1:/usr/share/nginx/html/. /var/www/youtulabs/"
	@echo "=== Deploy complete! ==="

deploy-quick:
	@echo "=== Quick Deploy ==="
	@echo "1. Pushing local changes..."
	git add .
	-git commit -m "Quick deploy update" || true
	git push origin develop
	@echo "2. Pulling on server..."
	ssh $(SERVER) "cd $(REMOTE_PATH) && git pull origin main"
	@echo "3. Restarting containers..."
	ssh $(SERVER) "cd $(REMOTE_PATH) && docker compose restart"
	@echo "=== Quick deploy complete! ==="

deploy-frontend:
	@echo "Deploying frontend only..."
	git add .
	-git commit -m "Frontend update" || true
	git push origin develop
	ssh $(SERVER) "cd $(REMOTE_PATH) && git pull origin main && docker compose build --no-cache frontend && docker compose up -d frontend && docker cp youtulabs-production-frontend-1:/usr/share/nginx/html/. /var/www/youtulabs/"
	@echo "Frontend deployed!"

deploy-backend:
	@echo "Deploying backend only..."
	git add .
	-git commit -m "Backend update" || true
	git push origin develop
	ssh $(SERVER) "cd $(REMOTE_PATH) && git pull origin main && docker compose build --no-cache backend && docker compose up -d backend"
	@echo "Backend deployed!"

restart:
	@echo "Restarting all containers..."
	ssh $(SERVER) "cd $(REMOTE_PATH) && docker compose restart"

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

# === Production Release ===

release:
	@echo "=== Creating Production Release ==="
	@read -p "Version (e.g. v1.2.15): " ver; \
	git checkout main && \
	git merge develop && \
	git tag $$ver && \
	git push origin main --tags && \
	echo "Released $$ver to production!"
	@echo "Now run 'make deploy' to update server"
