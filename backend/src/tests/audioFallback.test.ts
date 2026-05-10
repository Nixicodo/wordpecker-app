import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import audioRoutes from '../api/audio/routes';

const app = express();
app.use(express.json());
app.use('/api/audio', audioRoutes);

describe('audio pronunciation fallback flow', () => {
  const cacheDir = path.join(process.cwd(), 'audio-cache');
  let generatedCacheKey: string | null = null;

  afterAll(async () => {
    if (!generatedCacheKey || !fs.existsSync(cacheDir)) {
      return;
    }

    for (const extension of ['.wav', '.mp3']) {
      const filePath = path.join(cacheDir, `${generatedCacheKey}${extension}`);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    }
  });

  it('falls back to local audio generation and serves the cached file through the audio cache route', async () => {
    const pronunciationResponse = await request(app)
      .post('/api/audio/word-pronunciation')
      .set('user-id', 'audio-fallback-test-user')
      .send({
        word: 'conseguir',
        language: 'es',
      })
      .expect(200);

    expect(pronunciationResponse.body.success).toBe(true);
    expect(pronunciationResponse.body.data.audioUrl).toMatch(/^\/api\/audio\/cache\/[a-f0-9]{32}$/);
    expect(pronunciationResponse.body.data.voice).toMatch(/^local:/);

    const cacheKey = pronunciationResponse.body.data.cacheKey as string;
    generatedCacheKey = cacheKey;
    const wavPath = path.join(cacheDir, `${cacheKey}.wav`);
    expect(fs.existsSync(wavPath)).toBe(true);

    const cacheResponse = await request(app)
      .get(`/api/audio/cache/${cacheKey}`)
      .expect(200);

    expect(cacheResponse.headers['content-type']).toContain('audio/wav');
    expect(Buffer.isBuffer(cacheResponse.body)).toBe(true);
    expect(cacheResponse.body.length).toBeGreaterThan(128);
  });
});
