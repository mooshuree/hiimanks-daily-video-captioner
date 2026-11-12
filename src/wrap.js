/**
 * Wrap text to fit maxTextWidth using ctx.measureText.
 * Respects explicit \n; breaks overlong words by character.
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {string} text
 * @param {number} maxTextWidth
 * @returns {string[]}
 */
export function wrapText(ctx, text, maxTextWidth) {
  const paragraphs = text.split('\n');
  const lines = [];

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }

    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    let current = '';

    for (const word of words) {
      const wordWidth = ctx.measureText(word).width;

      if (wordWidth > maxTextWidth) {
        if (current) {
          lines.push(current);
          current = '';
        }
        lines.push(...breakWordByChars(ctx, word, maxTextWidth));
        continue;
      }

      const trial = current ? `${current} ${word}` : word;
      const trialWidth = ctx.measureText(trial).width;

      if (trialWidth <= maxTextWidth) {
        current = trial;
      } else {
        if (current) {
          lines.push(current);
        }
        current = word;
      }
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {string} word
 * @param {number} maxTextWidth
 * @returns {string[]}
 */
function breakWordByChars(ctx, word, maxTextWidth) {
  const segments = [];
  let chunk = '';

  for (const char of [...word]) {
    const trial = chunk + char;
    if (ctx.measureText(trial).width <= maxTextWidth) {
      chunk = trial;
    } else {
      if (chunk) {
        segments.push(chunk);
      }
      chunk = char;
      if (ctx.measureText(chunk).width > maxTextWidth) {
        segments.push(chunk);
        chunk = '';
      }
    }
  }
  if (chunk) {
    segments.push(chunk);
  }
  return segments.length > 0 ? segments : [word];
}
