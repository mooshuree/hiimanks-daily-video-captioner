import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;

/**
 * @param {string} url
 * @param {string} destPath
 * @param {{ maxBytes?: number, timeoutMs?: number }} [opts]
 */
export async function downloadVideo(url, destPath, opts = {}) {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('videoUrl must be a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('videoUrl must use http or https');
  }

  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Failed to download video: HTTP ${res.status}`);
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(`Video exceeds maximum size of ${maxBytes} bytes`);
  }

  const body = res.body;
  if (!body) {
    throw new Error('Download response has no body');
  }

  const out = createWriteStream(destPath);
  let received = 0;

  const counting = Readable.fromWeb(body);
  counting.on('data', (chunk) => {
    received += chunk.length;
    if (received > maxBytes) {
      counting.destroy(new Error(`Video exceeds maximum size of ${maxBytes} bytes`));
      out.destroy();
    }
  });

  await pipeline(counting, out);
}
