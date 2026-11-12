import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { z } from 'zod';

const CSS_NAMED_COLORS = new Set([
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
  'transparent',
]);

function isValidCssColor(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (CSS_NAMED_COLORS.has(trimmed.toLowerCase())) {
    return true;
  }
  const hex =
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(
      trimmed,
    );
  if (hex) {
    return true;
  }
  const rgb =
    /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)$/i.test(
      trimmed,
    );
  if (rgb) {
    return true;
  }
  try {
    const ctx = createCanvas(1, 1).getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillStyle = trimmed;
    return ctx.fillStyle !== '#000000' || trimmed.toLowerCase() === '#000000';
  } catch {
    return false;
  }
}

const colorSchema = z
  .string()
  .refine(isValidCssColor, { message: 'must be a valid CSS color' });

const labelNameSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'must contain only letters, numbers, dashes, and underscores',
  );

/** @typedef {z.infer<typeof labelStyleSchema>} LabelStyle */

export const labelStyleSchema = z.object({
  fontFamily: z.string().min(1),
  fontSize: z.number().min(8).max(500),
  fontSizePercent: z.union([z.null(), z.number().min(0.5).max(20)]),
  textColor: colorSchema,
  backgroundColor: colorSchema,
  borderRadius: z.number().min(0),
  paddingX: z.number().min(0),
  paddingY: z.number().min(0),
  marginX: z.number().min(0),
  marginY: z.number().min(0),
  textAlign: z.enum(['left', 'center', 'right']),
  lineHeight: z.number().min(0.8).max(3),
});

const labelInputSchema = z
  .object({
    name: labelNameSchema,
    text: z.string().min(1).max(500),
  })
  .merge(labelStyleSchema.partial());

const configSchema = z
  .object({
    fontsDir: z.string().min(1),
    outputDir: z.string().min(1),
    video: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    defaults: labelStyleSchema,
    labels: z.array(labelInputSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const names = new Set();
    for (let i = 0; i < data.labels.length; i++) {
      const name = data.labels[i].name;
      if (names.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['labels', i, 'name'],
          message: `duplicate label name "${name}"`,
        });
      }
      names.add(name);
    }
  });

/**
 * @param {unknown} err
 * @returns {never}
 */
function formatZodError(err) {
  if (!(err instanceof z.ZodError)) {
    throw err;
  }
  const lines = err.errors.map((e) => {
    const path = e.path.join('.');
    const labelIdx = e.path[0] === 'labels' && typeof e.path[1] === 'number';
    const prefix = labelIdx
      ? `labels[${e.path[1]}]${e.path.length > 2 ? '.' + e.path.slice(2).join('.') : ''}`
      : path || 'config';
    return `${prefix} ${e.message}`;
  });
  throw new Error(lines.join('\n'));
}

/**
 * @param {string} [configPath]
 */
export function loadConfig(configPath = 'config.json') {
  const absolute = resolve(process.cwd(), configPath);
  let raw;
  try {
    raw = JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to read config at ${absolute}: ${e.message}`);
  }

  let parsed;
  try {
    parsed = configSchema.parse(raw);
  } catch (e) {
    formatZodError(e);
  }

  const labels = parsed.labels.map((label, index) => {
    const merged = { ...parsed.defaults, ...label };
    try {
      labelStyleSchema.parse({
        fontFamily: merged.fontFamily,
        fontSize: merged.fontSize,
        fontSizePercent: merged.fontSizePercent,
        textColor: merged.textColor,
        backgroundColor: merged.backgroundColor,
        borderRadius: merged.borderRadius,
        paddingX: merged.paddingX,
        paddingY: merged.paddingY,
        marginX: merged.marginX,
        marginY: merged.marginY,
        textAlign: merged.textAlign,
        lineHeight: merged.lineHeight,
      });
    } catch (e) {
      if (e instanceof z.ZodError) {
        const msg = e.errors
          .map((issue) => `labels[${index}].${issue.path.join('.')} ${issue.message}`)
          .join('\n');
        throw new Error(msg);
      }
      throw e;
    }
    return merged;
  });

  return {
    fontsDir: parsed.fontsDir,
    outputDir: parsed.outputDir,
    video: parsed.video,
    defaults: parsed.defaults,
    labels,
  };
}
