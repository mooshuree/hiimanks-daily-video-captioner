FROM node:22-slim

WORKDIR /app

# FFmpeg in the same image as the Node app (available on PATH)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Optional: emoji fallback inside the container
# RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-color-emoji && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY config.json ./
COPY src ./src
COPY fonts ./fonts

RUN mkdir -p /app/output /app/videos /app/tmp \
  && chown -R node:node /app

USER node

CMD ["npm", "run", "start"]
