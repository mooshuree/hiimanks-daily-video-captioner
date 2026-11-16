function readPositiveMs(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }
  return n;
}

/** Wall-clock limit for HTTP video download (large files need slow origins). */
export const DOWNLOAD_TIMEOUT_MS = readPositiveMs(
  'DOWNLOAD_TIMEOUT_MS',
  30 * 60 * 1000,
);

/** Wall-clock limit for one ffmpeg encode (full re-encode can exceed realtime on small VPS). */
export const FFMPEG_TIMEOUT_MS = readPositiveMs(
  'FFMPEG_TIMEOUT_MS',
  60 * 60 * 1000,
);

export const MAX_DOWNLOAD_BYTES = readPositiveMs(
  'MAX_DOWNLOAD_BYTES',
  500 * 1024 * 1024,
);

const preset = process.env.FFMPEG_PRESET?.trim();
export const FFMPEG_PRESET =
  preset && /^[\w-]+$/.test(preset) ? preset : 'veryfast';

const crf = process.env.FFMPEG_CRF != null ? Number(process.env.FFMPEG_CRF) : 23;
export const FFMPEG_CRF = Number.isFinite(crf) && crf >= 0 && crf <= 51 ? crf : 23;