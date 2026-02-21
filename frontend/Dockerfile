# ============================================================
# Unweave Frontend — Production Dockerfile
# Multi-stage: build with Node → serve with Nginx
# ============================================================

# ── Stage 1: Build ──
FROM node:20-slim AS build

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve ──
FROM nginx:alpine

LABEL maintainer="Unweave"
LABEL description="Unweave frontend — production build served by Nginx"

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from Stage 1
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/nginx-health || exit 1

CMD ["nginx", "-g", "daemon off;"]
