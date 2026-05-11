import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import audioRoutes from '../api/audio/routes';
import { openaiRateLimiter } from '../middleware/rateLimiter';

const app = express();
app.use(express.json());
app.use('/api/audio', openaiRateLimiter);
app.use('/api/audio', audioRoutes);

describe('audio pronunciation rate limiting', () => {
  const backendRoot = process.cwd();
  const pronunciationDir = path.join(backendRoot, 'data', 'pronunciations', 'spanish');
  const indexPath = path.join(pronunciationDir, 'index.json');
  const audioDir = path.join(pronunciationDir, 'audio');
  const cacheDir = path.join(backendRoot, 'audio-cache');
  const originalIndex = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null;
  const localAudioName = 'unit-test-hola-rate-limit.wav';
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
          source: 'unit-test-local-library',
          locale: 'es',
          entries: [
            {
              word: 'hola',
              normalizedWord: 'hola',
              sourceTitle: 'UnitTest:hola',
              fileName: localAudioName,
              filePath: path.join('audio', localAudioName),
              fileUrl: '',
              bytes: localAudioBytes.length,
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

    if (fs.existsSync(cacheDir)) {
      const files = await fs.promises.readdir(cacheDir);
      await Promise.all(
        files
          .filter((file) => file.includes('hola'))
          .map((file) => fs.promises.unlink(path.join(cacheDir, file)))
      );
    }
  });

  it('keeps local Spanish word pronunciation available even after repeated auto-play requests', async () => {
    for (let index = 0; index < 101; index += 1) {
      const response = await request(app)
        .post('/api/audio/word-pronunciation')
        .set('user-id', 'audio-rate-limit-test-user')
        .send({
          word: 'hola',
          language: 'es',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.voice).toBe('local-library');
      expect(response.body.data.audioUrl).toMatch(/^\/api\/audio\/cache\/[a-f0-9]{32}$/);
    }
  });
});
