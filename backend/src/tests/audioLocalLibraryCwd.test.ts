import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';

describe('audio pronunciation local library cwd safety', () => {
  const backendRoot = process.cwd();
  const repoRoot = path.resolve(backendRoot, '..');
  const pronunciationDir = path.join(backendRoot, 'data', 'pronunciations', 'spanish');
  const indexPath = path.join(pronunciationDir, 'index.json');
  const audioDir = path.join(pronunciationDir, 'audio');
  const cacheDir = path.join(backendRoot, 'audio-cache');
  const originalCwd = process.cwd();
  const localAudioName = 'unit-test-precio.wav';
  const localAudioPath = path.join(audioDir, localAudioName);
  const localAudioBytes = Buffer.from([
    82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32,
    16, 0, 0, 0, 1, 0, 1, 0, 68, 172, 0, 0, 68, 172, 0, 0,
    1, 0, 8, 0, 100, 97, 116, 97, 0, 0, 0, 0
  ]);

  let app: express.Express;
  let originalIndex: string | null = null;

  beforeAll(async () => {
    originalIndex = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null;
    process.chdir(repoRoot);
    jest.resetModules();

    const { default: audioRoutes } = await import('../api/audio/routes');
    app = express();
    app.use(express.json());
    app.use('/api/audio', audioRoutes);

    await fs.promises.mkdir(audioDir, { recursive: true });
    await fs.promises.writeFile(localAudioPath, localAudioBytes);
    await fs.promises.writeFile(
      indexPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: 'windows-speech',
          locale: 'es',
          entries: [
            {
              word: 'precio',
              normalizedWord: 'precio',
              sourceTitle: 'WindowsSpeech:precio',
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
    process.chdir(originalCwd);

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
          .filter((file) => file.includes('precio'))
          .map((file) => fs.promises.unlink(path.join(cacheDir, file)))
      );
    }
  });

  it('serves local pronunciation even when the process cwd is the repo root', async () => {
    const response = await request(app)
      .post('/api/audio/word-pronunciation')
      .set('user-id', 'audio-local-library-cwd-test-user')
      .send({
        word: 'precio',
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
