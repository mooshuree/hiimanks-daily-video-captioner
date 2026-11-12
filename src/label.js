import { createCanvas } from '@napi-rs/canvas';
import { wrapText } from './wrap.js';

/**
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {string} line
 * @param {number} fontSize
 */
function measureLineInk(ctx, line, fontSize) {
  const m = ctx.measureText(line);
  const actualAscent =
    m.actualBoundingBoxAscent > 0
      ? m.actualBoundingBoxAscent
      : fontSize * 0.8;
  const actualDescent =
    m.actualBoundingBoxDescent > 0
      ? m.actualBoundingBoxDescent
      : fontSize * 0.2;
  const fontAscent =
    m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent : actualAscent;
  const fontDescent =
    m.fontBoundingBoxDescent > 0 ? m.fontBoundingBoxDescent : actualDescent;

  return {
    width: m.width,
    ascent: Math.max(actualAscent, fontAscent),
    descent: Math.max(actualDescent, fontDescent),
  };
}

/**
 * @param {Record<string, unknown>} style Fully merged label (name, text, style fields).
 * @param {number} videoWidth
 */
export function renderLabel(style, videoWidth) {
  const {
    text,
    fontFamily,
    fontSize: defaultFontSize,
    fontSizePercent,
    textColor,
    backgroundColor,
    borderRadius,
    paddingX,
    paddingY,
    marginX,
    textAlign,
    lineHeight,
  } = style;

  const fontSize =
    fontSizePercent != null
      ? Math.round((videoWidth * fontSizePercent) / 100)
      : defaultFontSize;

  const maxLabelWidth = videoWidth - 2 * marginX;
  const maxTextWidth = maxLabelWidth - 2 * paddingX;

  if (maxTextWidth < fontSize) {
    throw new Error(
      `Not enough horizontal space for text: maxTextWidth (${maxTextWidth}) is less than fontSize (${fontSize}). Reduce marginX, paddingX, or font size.`,
    );
  }

  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${fontSize}px ${fontFamily}`;
  measureCtx.lang = 'en';

  const lines = wrapText(measureCtx, String(text), maxTextWidth);
  const lineCount = lines.length;

  const inks = lines.map((line) => measureLineInk(measureCtx, line, fontSize));

  let widest = 0;
  for (const ink of inks) {
    widest = Math.max(widest, ink.width);
  }

  const labelWidth = Math.min(
    Math.ceil(widest) + 2 * paddingX,
    maxLabelWidth,
  );

  const lineGap = fontSize * lineHeight;
  const slotHeights = inks.map((ink) =>
    Math.max(lineGap, ink.ascent + ink.descent),
  );

  const baselines = [];
  let slotTop = paddingY;
  for (let i = 0; i < lineCount; i++) {
    const slotH = slotHeights[i];
    const ink = inks[i];
    const slack = slotH - ink.ascent - ink.descent;
    baselines.push(slotTop + slack / 2 + ink.ascent);
    slotTop += slotH;
  }

  const labelHeight = Math.ceil(slotTop + paddingY);

  const radius = Math.min(borderRadius, labelHeight / 2);

  const canvas = createCanvas(labelWidth, labelHeight);
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.lang = 'en';
  ctx.textBaseline = 'alphabetic';

  ctx.clearRect(0, 0, labelWidth, labelHeight);

  ctx.fillStyle = backgroundColor;
  ctx.beginPath();
  ctx.roundRect(0, 0, labelWidth, labelHeight, radius);
  ctx.fill();

  ctx.fillStyle = textColor;
  const innerWidth = labelWidth - 2 * paddingX;

  for (let i = 0; i < lineCount; i++) {
    const ink = inks[i];
    let x = paddingX;
    if (textAlign === 'center') {
      x = paddingX + (innerWidth - ink.width) / 2;
    } else if (textAlign === 'right') {
      x = paddingX + innerWidth - ink.width;
    }
    ctx.fillText(lines[i], x, baselines[i]);
  }

  const buffer = canvas.toBuffer('image/png');

  return {
    buffer,
    width: labelWidth,
    height: labelHeight,
    lineCount,
    fontSize,
  };
}
