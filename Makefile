# StegoChat developer tasks. Run `make help` for a list.
.DEFAULT_GOAL := help
.PHONY: help install dev backend frontend test lint format typecheck check audit migrate docker-up docker-down clean

PY ?= python

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install backend + frontend dependencies
	cd backend && $(PY) -m pip install -r requirements.txt -r requirements-dev.txt
	cd frontend && npm install

backend: ## Run the backend dev server
	cd backend && uvicorn app.main:app --reload --port 8000

frontend: ## Run the frontend dev server
	cd frontend && npm run dev

test: ## Run backend tests
	cd backend && pytest -q

lint: ## Lint backend (ruff) and frontend (eslint)
	cd backend && ruff check .
	cd frontend && npm run lint

format: ## Auto-format backend
	cd backend && ruff format . && ruff check --fix .

typecheck: ## Type-check backend (mypy) and frontend (tsc)
	cd backend && mypy app
	cd frontend && npm run typecheck

check: lint typecheck test ## Run all quality gates
	cd frontend && npm run build

audit: ## Audit Python dependencies for known CVEs
	cd backend && pip-audit -r requirements.txt

migrate: ## Apply database migrations
	cd backend && alembic upgrade head

docker-up: ## Start the full stack via docker-compose
	docker compose up --build

docker-down: ## Stop the stack
	docker compose down

clean: ## Remove caches and build artifacts
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf backend/.pytest_cache frontend/dist frontend/.vite
