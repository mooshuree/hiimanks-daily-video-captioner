import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { downloadVideo } from './download.js';
import {
  computeMax1080pDimensions,
  computeOverlayPosition,
  overlayPngOnVideo,
  probeVideo,
} from './ffmpeg.js';
import { assertFontRegistered } from './fonts.js';
import { renderLabel } from './label.js';

/**
 * @param {{
 *   videoUrl: string,
 *   text: string,
 *   style: Record<string, unknown>,
 *   paths: { tmpDir: string, videosDir: string },
 * }} params
 */
export async function createOverlayVideo(params) {
  const { videoUrl, text, style, paths } = params;
  const tmpDir = resolve(paths.tmpDir);
  const videosDir = resolve(paths.videosDir);
  await mkdir(tmpDir, { recursive: true });
  await mkdir(videosDir, { recursive: true });

  const jobId = randomUUID();
  const inputPath = join(tmpDir, `${jobId}-input`);
  const overlayPath = join(tmpDir, `${jobId}-overlay.png`);
  const outputName = `${jobId}.mp4`;
  const outputPath = join(videosDir, outputName);

  try {
    console.log(`[overlay] ${jobId} downloading…`);
    await downloadVideo(videoUrl, inputPath);
    const { size: bytesOnDisk } = await stat(inputPath);
    const {
      width: sourceWidth,
      height: sourceHeight,
      duration,
    } = await probeVideo(inputPath);
    const { width: videoWidth, height: videoHeight } = computeMax1080pDimensions(
      sourceWidth,
      sourceHeight,
    );
    const durationLabel =
      duration != null && Number.isFinite(duration)
        ? `${Math.round(duration)}s`
        : 'unknown duration';
    const scaledDown =
      sourceWidth !== videoWidth || sourceHeight !== videoHeight;
    console.log(
      `[overlay] ${jobId} download ok — ${bytesOnDisk} bytes, ${sourceWidth}×${sourceHeight}, ${durationLabel}` +
        (scaledDown ? ` → output ${videoWidth}×${videoHeight} (1080p cap)` : ''),
    );

    assertFontRegistered(String(style.fontFamily));

    const labelStyle = {
      ...style,
      text,
      name: 'api-overlay',
    };

    const label = renderLabel(labelStyle, videoWidth);
    await writeFile(overlayPath, label.buffer);

    const marginY = Number(style.marginY);
    const { x, y } = computeOverlayPosition(
      videoWidth,
      label.width,
      Number(style.marginX),
      marginY,
      /** @type {'left'|'center'|'right'} */ (style.textAlign),
    );

    if (x + label.width > videoWidth || y + label.height > videoHeight) {
      throw new Error(
        `Label (${label.width}×${label.height} at ${Math.round(x)},${y}) does not fit inside video (${videoWidth}×${videoHeight}). Reduce text, margins, or font size.`,
      );
    }

    const encodeStarted = Date.now();
    console.log(`[overlay] ${jobId} ffmpeg encode started (full re-encode, may take a while)…`);
    await overlayPngOnVideo({
      inputPath,
      overlayPngPath: overlayPath,
      outputPath,
      x,
      y,
      outputWidth: videoWidth,
      outputHeight: videoHeight,
    });
    console.log(
      `[overlay] ${jobId} ffmpeg done in ${Math.round((Date.now() - encodeStarted) / 1000)}s → ${outputName}`,
    );

    return {
      fileName: outputName,
      videoWidth,
      videoHeight,
      overlay: {
        x: Math.round(x),
        y: Math.round(y),
        width: label.width,
        height: label.height,
        lineCount: label.lineCount,
        fontSize: label.fontSize,
      },
    };
  } finally {
    await rm(inputPath, { force: true });
    await rm(overlayPath, { force: true });
  }
}
