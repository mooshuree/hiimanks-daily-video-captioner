import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
  const { stdout } = await execFileAsync(
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
  );

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
 * @param {{
 *   inputPath: string,
 *   overlayPngPath: string,
 *   outputPath: string,
 *   x: number,
 *   y: number,
 * }} opts
 */
export async function overlayPngOnVideo(opts) {
  const { inputPath, overlayPngPath, outputPath, x, y } = opts;
  const xPos = Math.max(0, Math.round(x));
  const yPos = Math.max(0, Math.round(y));

  const filter = `[0:v][1:v]overlay=${xPos}:${yPos}`;

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
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'copy',
      outputPath,
    ],
    { timeout: 600_000, maxBuffer: 10 * 1024 * 1024 },
  );
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
