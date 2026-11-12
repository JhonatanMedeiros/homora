import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@homora/db';
import { DEFAULT_APPEARANCE, IMAGE_MAX_BYTES, type Appearance } from '@homora/shared';
import { createApp } from './app.js';
import { ImageRejected, processBackgroundImage } from './background-image.js';
import { createTestAuth } from './test-auth.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const solid = (color: string, width = 64, height = 48) =>
  sharp({ create: { width, height, channels: 3, background: color } });

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'homora-bg-'));
  dirs.push(dir);
  const path = join(dir, 'homora.sqlite.background');
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestAuth(database.db);
  const app = createApp(database.db, 5173, auth, undefined, [], undefined, {
    backgroundPath: path,
  });
  const headers = { origin: 'http://localhost:5173', cookie };
  const upload = (body: Buffer, type = 'application/octet-stream') =>
    app.inject({
      method: 'PUT',
      url: '/api/appearance/background',
      headers: { ...headers, 'content-type': type },
      payload: body,
    });
  const current = async () =>
    (await app.inject({ method: 'GET', url: '/api/appearance', headers })).json<{
      appearance: Appearance;
    }>().appearance;
  return { app, headers, path, dir, upload, current };
}

describe('processBackgroundImage', () => {
  it.each([
    ['jpeg', () => solid('#336699').jpeg().toBuffer()],
    ['png', () => solid('#336699').png().toBuffer()],
    ['webp', () => solid('#336699').webp().toBuffer()],
  ])('accepts a %s and returns a webp', async (_kind, make) => {
    const result = await processBackgroundImage(await make());
    expect(result.name).toMatch(/^[0-9a-f]{32}\.webp$/);
    expect((await sharp(result.data).metadata()).format).toBe('webp');
    // WebP is lossy, so the mean colour is close to, not exactly, the source.
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(result.average.slice(i, i + 2), 16));
    expect([r, g, b]).toEqual([
      expect.closeTo(0x33, -1),
      expect.closeTo(0x66, -1),
      expect.closeTo(0x99, -1),
    ]);
  });

  it('scales down to 1920 px on the long side and never enlarges', async () => {
    const big = await processBackgroundImage(await solid('#888888', 3000, 1000).png().toBuffer());
    expect([big.width, big.height]).toEqual([1920, 640]);
    const small = await processBackgroundImage(await solid('#888888', 100, 50).png().toBuffer());
    expect([small.width, small.height]).toEqual([100, 50]);
  });

  it('strips EXIF metadata such as a GPS position', async () => {
    const marker = 'gps-marker-do-not-leak';
    const input = await solid('#336699')
      .jpeg()
      .withExif({ IFD0: { Copyright: marker, ImageDescription: marker } })
      .toBuffer();
    expect(input.includes(Buffer.from(marker))).toBe(true);
    const { data } = await processBackgroundImage(input);
    expect(data.includes(Buffer.from(marker))).toBe(false);
    expect((await sharp(data).metadata()).exif).toBeUndefined();
  });

  it('applies the EXIF orientation before stripping it', async () => {
    const input = await solid('#336699', 80, 40).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await processBackgroundImage(input);
    expect([result.width, result.height]).toEqual([40, 80]);
  });

  it('rejects SVG, GIF, text and an empty body by content', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
    for (const bad of [svg, Buffer.from('GIF89a......'), Buffer.from('hello'), Buffer.alloc(0)])
      await expect(processBackgroundImage(bad)).rejects.toBeInstanceOf(ImageRejected);
    await expect(processBackgroundImage(svg)).rejects.toMatchObject({ code: 'image-unsupported' });
  });

  it('rejects a file whose extension or type claims one thing and holds another', async () => {
    const spoofed = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('<svg></svg>')]);
    await expect(processBackgroundImage(spoofed)).rejects.toMatchObject({ code: 'image-invalid' });
  });

  it('rejects an animated WebP and an animated PNG', async () => {
    const frames = await sharp(
      Buffer.concat([
        await solid('#ff0000', 8, 8).raw().toBuffer(),
        await solid('#00ff00', 8, 8).raw().toBuffer(),
      ]),
      {
        raw: { width: 8, height: 16, channels: 3, pageHeight: 8 },
      },
    )
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    await expect(processBackgroundImage(frames)).rejects.toMatchObject({ code: 'image-animated' });
    const png = await solid('#336699').png().toBuffer();
    const actl = Buffer.alloc(20);
    actl.writeUInt32BE(8, 0);
    actl.write('acTL', 4, 'latin1');
    const idat = png.indexOf(Buffer.from('IDAT')) - 4;
    const apng = Buffer.concat([png.subarray(0, idat), actl, png.subarray(idat)]);
    await expect(processBackgroundImage(apng)).rejects.toMatchObject({ code: 'image-animated' });
  });

  it('rejects more than 2 MB', async () => {
    await expect(
      processBackgroundImage(Buffer.alloc(IMAGE_MAX_BYTES + 1, 1)),
    ).rejects.toMatchObject({
      code: 'image-too-large',
    });
  });

  it('rejects a small file that would decode to a huge bitmap', async () => {
    const bomb = await sharp({
      create: { width: 8000, height: 8000, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(IMAGE_MAX_BYTES);
    await expect(processBackgroundImage(bomb)).rejects.toMatchObject({ code: 'image-invalid' });
  });
});

describe('background API', () => {
  it('requires a session for upload, read and removal', async () => {
    const { app } = await setup();
    for (const [method, url] of [
      ['PUT', '/api/appearance/background'],
      ['DELETE', '/api/appearance/background'],
      ['GET', `/api/appearance/background/${'a'.repeat(32)}.webp`],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: { origin: 'http://localhost:5173' },
        payload: method === 'PUT' ? Buffer.from('x') : undefined,
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it('stores the picture next to the database, serves it with safe headers and removes it', async () => {
    const { app, headers, path, upload, current } = await setup();
    const response = await upload(await solid('#556677').png().toBuffer());
    expect(response.statusCode).toBe(200);
    const { image } = response.json<{ appearance: Appearance }>().appearance;
    expect(image).toMatchObject({ position: 'fill', width: 64, height: 48 });
    expect((await stat(path)).isFile()).toBe(true);

    const served = await app.inject({
      method: 'GET',
      url: `/api/appearance/background/${image!.name}`,
      headers,
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['content-security-policy']).toBe("default-src 'none'");
    expect(Buffer.compare(served.rawPayload, await readFile(path))).toBe(0);

    for (const name of ['../homora.sqlite', `${'b'.repeat(32)}.webp`, 'x'])
      expect(
        (await app.inject({ method: 'GET', url: `/api/appearance/background/${name}`, headers }))
          .statusCode,
      ).toBe(404);

    const removed = await app.inject({
      method: 'DELETE',
      url: '/api/appearance/background',
      headers,
    });
    expect(removed.json().appearance.image).toBeNull();
    expect((await current()).image).toBeNull();
    await expect(stat(path)).rejects.toThrow();
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/appearance/background/${image!.name}`,
          headers,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('removing the picture, or resetting the appearance, deletes the file', async () => {
    const { app, headers, path, upload } = await setup();
    await upload(await solid('#556677').png().toBuffer());
    await app.inject({ method: 'DELETE', url: '/api/appearance', headers });
    await expect(stat(path)).rejects.toThrow();
  });

  it('replaces the picture with a new random name and leaves no temporary file', async () => {
    const { dir, upload } = await setup();
    const first = (await upload(await solid('#556677').png().toBuffer())).json().appearance.image;
    const second = (await upload(await solid('#667788').png().toBuffer())).json().appearance.image;
    expect(second.name).not.toBe(first.name);
    expect(await readdir(dir)).toEqual(['homora.sqlite.background']);
  });

  it('fades the picture until text is readable', async () => {
    const { upload } = await setup();
    const grey = (await upload(await solid('#808080').png().toBuffer())).json().appearance.image;
    expect(grey.dim).toBeGreaterThan(40);
  });

  it('refuses a picture that stays hard to read even at the strongest fade', async () => {
    const { upload, current, path } = await setup();
    const response = await upload(await solid('#ffffff').png().toBuffer());
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('appearance-contrast');
    expect((await current()).image).toBeNull();
    await expect(stat(path)).rejects.toThrow();
  });

  it.each([
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 415, 'image-unsupported'],
    ['text', Buffer.from('not an image'), 415, 'image-unsupported'],
  ])('rejects %s and stores nothing', async (_name, body, status, code) => {
    const { upload, current, path } = await setup();
    const response = await upload(body);
    expect(response.statusCode).toBe(status);
    expect(response.json().code).toBe(code);
    expect((await current()).image).toBeNull();
    await expect(stat(path)).rejects.toThrow();
  });

  it('rejects an SVG declared as an image type', async () => {
    const { upload } = await setup();
    const response = await upload(Buffer.from('<svg/>'), 'image/svg+xml');
    expect(response.statusCode).toBe(415);
    expect(response.json().code).toBe('image-unsupported');
  });

  it('rejects an oversize body with a clear code', async () => {
    const { upload, current } = await setup();
    const response = await upload(Buffer.alloc(IMAGE_MAX_BYTES + 10, 1));
    expect(response.statusCode).toBe(413);
    expect(response.json().code).toBe('image-too-large');
    expect((await current()).image).toBeNull();
  });

  it('only lets a client change dimming and position of the stored picture', async () => {
    const { app, headers, upload, current } = await setup();
    const stored = (await upload(await solid('#808080').png().toBuffer())).json().appearance.image;
    const put = (image: unknown) =>
      app.inject({
        method: 'PUT',
        url: '/api/appearance',
        headers,
        payload: { ...DEFAULT_APPEARANCE, image } as object,
      });
    // A forged colour or name is ignored.
    const forged = await put({
      ...stored,
      dim: 80,
      position: 'tile',
      average: '#000000',
      name: 'f'.repeat(32) + '.webp',
    });
    expect(forged.statusCode).toBe(200);
    expect((await current()).image).toMatchObject({
      dim: 80,
      position: 'tile',
      name: stored.name,
      average: stored.average,
    });
    // It cannot add a picture that was never uploaded, nor drop one without the delete route.
    expect((await put(null)).statusCode).toBe(400);
  });

  it('refuses a dimming that would make text unreadable', async () => {
    const { app, headers, upload } = await setup();
    const stored = (await upload(await solid('#808080').png().toBuffer())).json().appearance.image;
    const response = await app.inject({
      method: 'PUT',
      url: '/api/appearance',
      headers,
      payload: { ...DEFAULT_APPEARANCE, image: { ...stored, dim: 0 } } as object,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('appearance-contrast');
  });

  it('cannot add a picture without storage configured', async () => {
    const database = createDatabase(':memory:');
    const { auth, cookie } = await createTestAuth(database.db);
    const app = createApp(database.db, 5173, auth);
    const response = await app.inject({
      method: 'PUT',
      url: '/api/appearance/background',
      headers: { origin: 'http://localhost:5173', cookie, 'content-type': 'image/png' },
      payload: await solid('#556677').png().toBuffer(),
    });
    expect(response.statusCode).toBe(503);
  });
});
