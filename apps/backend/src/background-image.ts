import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';
import { IMAGE_MAX_BYTES, IMAGE_MAX_SIDE, rgbToHex } from '@homora/shared';

/** Refused uploads. `code` is stable and maps to an API error. */
export class ImageRejected extends Error {
  constructor(
    readonly code: 'image-too-large' | 'image-unsupported' | 'image-animated' | 'image-invalid',
  ) {
    super(code);
    this.name = 'ImageRejected';
  }
}

export type ProcessedImage = {
  data: Buffer;
  name: string;
  width: number;
  height: number;
  /** Mean colour of the result, `#rrggbb`. */
  average: string;
  bytes: number;
  originalBytes: number;
};

/** The type comes from the first bytes, never from the file name or the declared content type. */
function sniff(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'jpeg';
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (
    buffer.length >= 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  )
    return 'webp';
  return null;
}

/** APNG carries an `acTL` chunk before the image data; animated WebP sets a flag in `VP8X`. */
function isAnimated(kind: 'png' | 'webp', buffer: Buffer): boolean {
  if (kind === 'webp')
    return buffer.toString('latin1', 12, 16) === 'VP8X' && ((buffer[20] ?? 0) & 0x02) !== 0;
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    offset += 12 + buffer.readUInt32BE(offset);
  }
  return false;
}

/**
 * Validates and re-encodes an uploaded picture: JPG, PNG or WebP only, 2 MB at most, never
 * animated, rotated by its EXIF orientation and then stripped of all metadata (location
 * included), scaled to at most 1920 px on the long side and saved as WebP.
 */
export async function processBackgroundImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw new ImageRejected('image-invalid');
  if (input.length > IMAGE_MAX_BYTES) throw new ImageRejected('image-too-large');
  const kind = sniff(input);
  if (!kind) throw new ImageRejected('image-unsupported');
  if (kind !== 'jpeg' && isAnimated(kind, input)) throw new ImageRejected('image-animated');
  try {
    // A small file can still decode to a huge bitmap: refuse beyond 36 megapixels.
    const source = sharp(input, { limitInputPixels: 36_000_000, failOn: 'error' });
    const meta = await source.metadata();
    if ((meta.pages ?? 1) > 1) throw new ImageRejected('image-animated');
    const { data, info } = await source
      .rotate()
      .resize({
        width: IMAGE_MAX_SIDE,
        height: IMAGE_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const stats = await sharp(data).flatten({ background: '#ffffff' }).stats();
    const [r, g, b] = stats.channels.map((channel) => channel.mean);
    return {
      data,
      name: `${randomBytes(16).toString('hex')}.webp`,
      width: info.width,
      height: info.height,
      average: rgbToHex([r ?? 128, g ?? 128, b ?? 128]),
      bytes: data.length,
      originalBytes: input.length,
    };
  } catch (error) {
    if (error instanceof ImageRejected) throw error;
    throw new ImageRejected('image-invalid');
  }
}

/**
 * The processed picture lives in one file next to the database (`<database>.background`), like
 * the `.key` file, so a backup copies it together with the database. Writes are atomic.
 */
export function createBackgroundStore(path: string) {
  return {
    async write(data: Buffer) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
      await writeFile(temporary, data, { mode: 0o600 });
      await rename(temporary, path);
    },
    async read(): Promise<Buffer | null> {
      try {
        return await readFile(path);
      } catch {
        return null;
      }
    },
    async remove() {
      await rm(path, { force: true });
    },
  };
}

export type BackgroundStore = ReturnType<typeof createBackgroundStore>;
