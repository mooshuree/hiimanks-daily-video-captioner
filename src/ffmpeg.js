import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  FFMPEG_CRF,
  FFMPEG_PRESET,
  FFMPEG_TIMEOUT_MS,
} from './runtime-env.js';

const execFileAsync = promisify(execFile);

/**
 * @param {unknown} err
 * @param {string} label
 */
function execFailureMessage(err, label) {
  if (!err || typeof err !== 'object') {
    return `${label}: unknown error`;
  }
  const e = /** @type {{ message?: string, stderr?: string, killed?: boolean, signal?: string }} */ (
    err
  );
  if (e.killed) {
    const hint =
      'Timed out — large or long videos need a faster VPS and/or higher FFMPEG_TIMEOUT_MS (and DOWNLOAD_TIMEOUT_MS for slow downloads).';
    const stderr = typeof e.stderr === 'string' ? e.stderr.trim() : '';
    return stderr ? `${label}: ${stderr} (${hint})` : `${label}: ${hint}`;
  }
  const stderr = typeof e.stderr === 'string' ? e.stderr.trim() : '';
  if (stderr) {
    return `${label}: ${stderr}`;
  }
  if (e.message) {
    return `${label}: ${e.message}`;
  }
  return `${label}: command failed`;
}

/**
 * @returns {Promise<boolean>}
 */
export async function ffmpegAvailable() {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} inputPath
 */
export async function probeVideo(inputPath) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,duration',
        '-of',
        'json',
        inputPath,
      ],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
    ));
  } catch (err) {
    throw new Error(execFailureMessage(err, 'ffprobe failed'));
  }

  const data = JSON.parse(stdout);
  const stream = data.streams?.[0];
  if (!stream?.width || !stream?.height) {
    throw new Error('Could not read video dimensions from file');
  }

  return {
    width: Number(stream.width),
    height: Number(stream.height),
    duration: stream.duration != null ? Number(stream.duration) : null,
  };
}

/**
 * Fit inside 1080p bounds (1920×1080 landscape, 1080×1920 portrait). Never upscales.
 * Dimensions are even for libx264 + yuv420p.
 * @param {number} width
 * @param {number} height
 */
export function computeMax1080pDimensions(width, height) {
  const landscape = width >= height;
  const maxW = landscape ? 1920 : 1080;
  const maxH = landscape ? 1080 : 1920;
  const scale = Math.min(1, maxW / width, maxH / height);
  let w = Math.round(width * scale);
  let h = Math.round(height * scale);
  w = Math.trunc(w / 2) * 2;
  h = Math.trunc(h / 2) * 2;
  if (w < 2) {
    w = 2;
  }
  if (h < 2) {
    h = 2;
  }
  return { width: w, height: h };
}

/**
 * @param {{
 *   inputPath: string,
 *   overlayPngPath: string,
 *   outputPath: string,
 *   x: number,
 *   y: number,
 *   outputWidth: number,
 *   outputHeight: number,
 * }} opts
 */
export async function overlayPngOnVideo(opts) {
  const {
    inputPath,
    overlayPngPath,
    outputPath,
    x,
    y,
    outputWidth,
    outputHeight,
  } = opts;
  const xPos = Math.max(0, Math.round(x));
  const yPos = Math.max(0, Math.round(y));
  const outW = Math.trunc(outputWidth / 2) * 2;
  const outH = Math.trunc(outputHeight / 2) * 2;

  const filter = `[0:v]scale=${outW}:${outH}[base];[base][1:v]overlay=${xPos}:${yPos}[vout]`;

  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        inputPath,
        '-i',
        overlayPngPath,
        '-filter_complex',
        filter,
        '-map',
        '[vout]',
        '-map',
        '0:a?',
        '-c:v',
        'libx264',
        '-preset',
        FFMPEG_PRESET,
        '-crf',
        String(FFMPEG_CRF),
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
    );
  } catch (err) {
    throw new Error(execFailureMessage(err, 'ffmpeg overlay failed'));
  }
}

/**
 * Place label PNG on video using marginX, marginY, and textAlign.
 * @param {number} videoWidth
 * @param {number} labelWidth
 * @param {number} marginX
 * @param {number} marginY
 * @param {'left'|'center'|'right'} textAlign
 */
export function computeOverlayPosition(
  videoWidth,
  labelWidth,
  marginX,
  marginY,
  textAlign,
) {
  const y = marginY;
  let x;
  if (textAlign === 'left') {
    x = marginX;
  } else if (textAlign === 'right') {
    x = videoWidth - marginX - labelWidth;
  } else {
    x = (videoWidth - labelWidth) / 2;
  }
  return { x, y };
}
