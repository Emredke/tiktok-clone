FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates python3 python3-venv && rm -rf /var/lib/apt/lists/*
COPY scripts/caption-requirements.txt /tmp/caption-requirements.txt
RUN python3 -m venv /opt/captions && /opt/captions/bin/pip install --no-cache-dir -r /tmp/caption-requirements.txt && /opt/captions/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('tiny',device='cpu',compute_type='int8',download_root='/opt/caption-models')" && chown -R node:node /opt/caption-models
WORKDIR /app
ENV CAPTION_PYTHON=/opt/captions/bin/python CAPTION_MODEL_DIR=/opt/caption-models
ENV NODE_ENV=production PORT=3001 DATABASE_PATH=/app/data/velo.sqlite MEDIA_DIR=/app/data/media
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p /app/data && chown -R node:node /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
