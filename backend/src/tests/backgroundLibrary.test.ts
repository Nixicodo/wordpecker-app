import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { backgroundLibrary } from '../services/backgroundLibrary';

describe('backgroundLibrary', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wordpecker-backgrounds-'));
    process.env.BACKGROUND_LIBRARY_DIR = tempRoot;
  });

  afterEach(async () => {
    delete process.env.BACKGROUND_LIBRARY_DIR;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('lists image backgrounds and ignores non-image files', async () => {
    await fs.mkdir(path.join(tempRoot, 'anime'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'anime', 'scene one.jpg'), 'jpg');
    await fs.writeFile(path.join(tempRoot, 'anime', 'scene two.png'), 'png');
    await fs.writeFile(path.join(tempRoot, 'anime', 'notes.txt'), 'ignore');

    const backgrounds = await backgroundLibrary.list();

    expect(backgrounds).toHaveLength(2);
    expect(backgrounds.map((item) => item.relativePath)).toEqual([
      'anime/scene one.jpg',
      'anime/scene two.png'
    ]);
    expect(backgrounds[0].url).toBe('/backgrounds/anime/scene%20one.jpg');
  });

  it('deletes a background file and removes empty parent directories', async () => {
    const directory = path.join(tempRoot, 'show', 'episode-1');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'frame.webp'), 'webp');

    const [background] = await backgroundLibrary.list();
    const deleted = await backgroundLibrary.deleteById(background.id);

    expect(deleted?.relativePath).toBe('show/episode-1/frame.webp');
    await expect(fs.access(path.join(directory, 'frame.webp'))).rejects.toThrow();
    await expect(fs.access(directory)).rejects.toThrow();
  });

  it('returns a preferred or random background without returning the excluded id', async () => {
    await fs.mkdir(path.join(tempRoot, 'set-a'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'set-a', 'one.jpg'), 'one');
    await fs.writeFile(path.join(tempRoot, 'set-a', 'two.jpg'), 'two');

    const backgrounds = await backgroundLibrary.list();
    const preferred = await backgroundLibrary.getRandom({ preferredId: backgrounds[0].id });
    const randomExcludingFirst = await backgroundLibrary.getRandom({ excludeId: backgrounds[0].id });

    expect(preferred.total).toBe(2);
    expect(preferred.background?.id).toBe(backgrounds[0].id);
    expect(randomExcludingFirst.background?.id).toBe(backgrounds[1].id);
  });
});
