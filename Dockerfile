# === BUILDER ===
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY app ./app
COPY animals.json .   # ja ārpusē

# === FINAL ===
FROM node:20-alpine
RUN addgroup -g 1001 nodejs && adduser -S -G nodejs -u 1001 appuser

WORKDIR /app
COPY --from=builder --chown=appuser:nodejs /app /app

# DATA DIRS
RUN mkdir -p /data /data/sessions /data/public/task-icons && \
    chown -R appuser:nodejs /data && chmod -R 777 /data

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER appuser
CMD ["node", "app/server.js"]