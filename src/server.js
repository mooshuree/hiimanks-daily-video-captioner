import express from 'express';
import { mkdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { labelStyleSchema, loadConfig } from './config.js';
import { ffmpegAvailable } from './ffmpeg.js';
import { registerFontsFromDir } from './fonts.js';
import { createOverlayVideo } from './overlay.js';

const configPath = process.env.CONFIG_PATH ?? 'config.json';
const config = loadConfig(configPath);

const PORT = Number(process.env.PORT ?? 3647);
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`
).replace(/\/$/, '');
const VIDEOS_DIR = resolve(process.cwd(), process.env.VIDEOS_DIR ?? './videos');
const TMP_DIR = resolve(process.cwd(), process.env.TMP_DIR ?? './tmp');

const fontsDir = resolve(process.cwd(), config.fontsDir);
registerFontsFromDir(fontsDir);

const overlayRequestSchema = z.object({
  videoUrl: z.string().url(),
  text: z.string().min(1).max(500),
  style: labelStyleSchema.partial().optional(),
});

const videoFileNameSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]+\.mp4$/,
    'must be a plain .mp4 file name (no folders or path segments)',
  );

const deleteVideoRequestSchema = z
  .object({
    name: videoFileNameSchema.optional(),
    fileName: videoFileNameSchema.optional(),
  })
  .refine((data) => data.name != null || data.fileName != null, {
    message: 'name or fileName is required',
  })
  .transform((data) => data.name ?? data.fileName);

const app = express();
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use(
  '/videos',
  express.static(VIDEOS_DIR, {
    index: false,
    fallthrough: true,
  }),
);

app.post('/api/overlay', async (req, res) => {
  let body;
  try {
    body = overlayRequestSchema.parse(req.body);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const message = e.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('; ');
      return res.status(400).json({ error: message });
    }
    throw e;
  }

  const style = { ...config.defaults, ...body.style, text: body.text };

  try {
    await mkdir(VIDEOS_DIR, { recursive: true });
    const result = await createOverlayVideo({
      videoUrl: body.videoUrl,
      text: body.text,
      style,
      paths: { tmpDir: TMP_DIR, videosDir: VIDEOS_DIR },
    });

    const url = `${PUBLIC_BASE_URL}/videos/${result.fileName}`;
    return res.status(201).json({
      url,
      fileName: result.fileName,
      video: { width: result.videoWidth, height: result.videoHeight },
      label: result.overlay,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Overlay failed';
    console.error('POST /api/overlay', message);
    return res.status(500).json({ error: message });
  }
});

app.delete('/api/video', async (req, res) => {
  let fileName;
  try {
    fileName = deleteVideoRequestSchema.parse(req.body);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const message = e.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('; ');
      return res.status(400).json({ error: message });
    }
    throw e;
  }

  const filePath = join(VIDEOS_DIR, fileName);
  const resolvedVideoDir = resolve(VIDEOS_DIR);
  if (!resolve(filePath).startsWith(resolvedVideoDir)) {
    return res.status(400).json({ error: 'Invalid file name' });
  }

  try {
    await unlink(filePath);
    return res.json({ deleted: true, name: fileName });
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
      return res.status(404).json({ error: `Video not found: ${fileName}` });
    }
    const message = e instanceof Error ? e.message : 'Delete failed';
    console.error('DELETE /api/video', message);
    return res.status(500).json({ error: message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

const hasFfmpeg = await ffmpegAvailable();
if (!hasFfmpeg) {
  console.error('ffmpeg not found on PATH — install ffmpeg in the container image');
  process.exit(1);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT} (public base: ${PUBLIC_BASE_URL})`);
  console.log(`Videos served from ${VIDEOS_DIR}`);
});
