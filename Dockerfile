FROM node:22-slim

WORKDIR /app

# FFmpeg in the same image as the Node app (available on PATH)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg gosu \
  && rm -rf /var/lib/apt/lists/*

# Optional: emoji fallback inside the container
# RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-color-emoji && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY config.json ./
COPY src ./src
COPY fonts ./fonts

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/output /app/videos /app/tmp \
  && chown -R node:node /app

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
