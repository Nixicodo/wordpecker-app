import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import audioRoutes from '../api/audio/routes';

const app = express();
app.use(express.json());
app.use('/api/audio', audioRoutes);

describe('audio pronunciation local library flow', () => {
  const pronunciationDir = path.join(process.cwd(), 'data', 'pronunciations', 'spanish');
  const indexPath = path.join(pronunciationDir, 'index.json');
  const audioDir = path.join(pronunciationDir, 'audio');
  const cacheDir = path.join(process.cwd(), 'audio-cache');
  const originalIndex = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null;
  const localAudioName = 'unit-test-hola.wav';
  const localAudioPath = path.join(audioDir, localAudioName);
  const localAudioBytes = Buffer.from([
    82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32,
    16, 0, 0, 0, 1, 0, 1, 0, 68, 172, 0, 0, 68, 172, 0, 0,
    1, 0, 8, 0, 100, 97, 116, 97, 0, 0, 0, 0
  ]);

  beforeAll(async () => {
    await fs.promises.mkdir(audioDir, { recursive: true });
    await fs.promises.writeFile(localAudioPath, localAudioBytes);
    await fs.promises.writeFile(
      indexPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: 'wikimedia-commons-lingua-libre',
          locale: 'es',
          entries: [
            {
              word: 'hola',
              normalizedWord: 'hola',
              sourceTitle: 'File:unit-test-hola.wav',
              fileName: localAudioName,
              filePath: path.join('audio', localAudioName),
              fileUrl: 'https://example.invalid/unit-test-hola.wav'
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    );
  });

  afterAll(async () => {
    if (originalIndex !== null) {
      await fs.promises.writeFile(indexPath, originalIndex, 'utf8');
    } else if (fs.existsSync(indexPath)) {
      await fs.promises.unlink(indexPath);
    }

    if (fs.existsSync(localAudioPath)) {
      await fs.promises.unlink(localAudioPath);
    }
  });

  afterEach(async () => {
    if (!fs.existsSync(cacheDir)) {
      return;
    }

    const files = await fs.promises.readdir(cacheDir);
    await Promise.all(
      files
        .filter((file) => file.includes('hola'))
        .map((file) => fs.promises.unlink(path.join(cacheDir, file)))
    );
  });

  it('serves a local library pronunciation when the normalized word exists in the index', async () => {
    const response = await request(app)
      .post('/api/audio/word-pronunciation')
      .set('user-id', 'audio-local-library-test-user')
      .send({
        word: 'hola',
        language: 'es',
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.voice).toBe('local-library');
    expect(response.body.data.audioUrl).toMatch(/^\/api\/audio\/cache\/[a-f0-9]{32}$/);

    const cacheKey = response.body.data.cacheKey as string;
    const cacheResponse = await request(app)
      .get(`/api/audio/cache/${cacheKey}`)
      .expect(200);

    expect(cacheResponse.headers['content-type']).toContain('audio/wav');
    expect(cacheResponse.body.length).toBe(localAudioBytes.length);
  });
});
