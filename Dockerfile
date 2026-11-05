# =========================================================================
# PMPilot Production Dockerfile
# Multi-stage build packaging deterministic decision intelligence engine & UI
# =========================================================================

# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Engine
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Create persistent storage directory for SQLite
RUN mkdir -p /app/backend/data

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose backend API and UI port
EXPOSE 4000

# Persist SQLite database across container restarts
VOLUME ["/app/backend/data"]

CMD ["node", "src/server.js"]

