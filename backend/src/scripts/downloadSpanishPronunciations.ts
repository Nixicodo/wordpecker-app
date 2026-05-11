import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js/wrapper/ElevenLabsClient';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { loadSpanishVocabularyLevels } from './spanishVocabularyData';

type CommonsFileEntry = {
  title: string;
  fileUrl: string;
  word: string;
  sourceTitle: string;
  normalizedWord: string;
};

type PronunciationIndex = {
  generatedAt: string;
  source: 'wikimedia-commons-lingua-libre' | 'elevenlabs' | 'windows-speech';
  locale: 'es';
  entries: Array<{
    word: string;
    normalizedWord: string;
    sourceTitle: string;
    fileName: string;
    filePath: string;
    fileUrl: string;
    bytes?: number;
  }>;
};

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const BASE_DOWNLOAD_DIR = path.resolve(process.cwd(), 'data', 'pronunciations', 'spanish');
const AUDIO_DIR = path.join(BASE_DOWNLOAD_DIR, 'audio');
const INDEX_PATH = path.join(BASE_DOWNLOAD_DIR, 'index.json');
const DOWNLOAD_PROGRESS_PATH = path.join(BASE_DOWNLOAD_DIR, 'download-progress.json');
const WINDOWS_BATCH_PATH = path.join(BASE_DOWNLOAD_DIR, 'windows-tts-batch.json');
const DEFAULT_ELEVENLABS_VOICE = 'XB0fDUnXU5powFXDhCwa';
const DEFAULT_ELEVENLABS_MODEL = 'eleven_multilingual_v2';
const DEFAULT_WINDOWS_CULTURE = 'es-MX';
const DEFAULT_PROVIDER = 'auto';
const execFileAsync = promisify(execFile);

type DownloadProvider = 'auto' | 'commons' | 'elevenlabs' | 'windows';

type ScriptOptions = {
  provider: DownloadProvider;
  limit?: number;
  force: boolean;
};

const normalizeWord = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

const extractWordFromTitle = (title: string) => {
  const fileName = title.replace(/^File:/i, '').replace(/\.(wav|ogg|mp3)$/i, '');
  const normalized = fileName
    .replace(/^LL-Q\d+\s*\(spa\)-[^-]+-/i, '')
    .replace(/^LL-Q\d+\s*\(es\)-[^-]+-/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    sourceTitle: title,
    word: normalized,
    normalizedWord: normalizeWord(normalized),
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = (): ScriptOptions => {
  const args = process.argv.slice(2);
  let provider: DownloadProvider = DEFAULT_PROVIDER;
  let limit: number | undefined;
  let force = false;

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === '--force') {
      force = true;
      continue;
    }

    if (current.startsWith('--provider=')) {
      provider = current.split('=')[1] as DownloadProvider;
      continue;
    }

    if (current === '--provider' && args[index + 1]) {
      provider = args[index + 1] as DownloadProvider;
      index += 1;
      continue;
    }

    if (current.startsWith('--limit=')) {
      limit = Number.parseInt(current.split('=')[1], 10);
      continue;
    }

    if (current === '--limit' && args[index + 1]) {
      limit = Number.parseInt(args[index + 1], 10);
      index += 1;
    }
  }

  if (!['auto', 'commons', 'elevenlabs', 'windows'].includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`Invalid limit: ${limit}`);
  }

  return {
    provider,
    limit,
    force,
  };
};

const readExistingIndex = async (): Promise<PronunciationIndex['entries']> => {
  if (!fs.existsSync(INDEX_PATH)) {
    return [];
  }

  const parsed = JSON.parse(await fs.promises.readFile(INDEX_PATH, 'utf8')) as PronunciationIndex;
  return parsed.entries || [];
};

const writeIndex = async (source: PronunciationIndex['source'], entries: PronunciationIndex['entries']) => {
  const index: PronunciationIndex = {
    generatedAt: new Date().toISOString(),
    source,
    locale: 'es',
    entries: entries.sort((left, right) => left.normalizedWord.localeCompare(right.normalizedWord)),
  };

  await fs.promises.mkdir(BASE_DOWNLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(INDEX_PATH, JSON.stringify(index, null, 2) + '\n', 'utf-8');
};

const writeProgress = async (payload: Record<string, unknown>) => {
  await fs.promises.mkdir(BASE_DOWNLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(DOWNLOAD_PROGRESS_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
};

const withRetry = async <T>(operation: () => Promise<T>, label: string, attempts = 5): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const backoffMs = 1000 * attempt * attempt;
      console.warn(`${label} failed on attempt ${attempt}/${attempts}; retrying in ${backoffMs}ms`);

      if (attempt < attempts) {
        await sleep(backoffMs);
      }
    }
  }

  throw lastError;
};

const fetchCategoryFiles = async (): Promise<CommonsFileEntry[]> => {
  const collected: CommonsFileEntry[] = [];
  let cmcontinue: string | undefined;

  do {
    const response = await withRetry(() => axios.get(COMMONS_API, {
      params: {
        action: 'query',
        format: 'json',
        formatversion: 2,
        generator: 'categorymembers',
        gcmtitle: 'Category:Lingua Libre pronunciation-spa',
        gcmtype: 'file',
        gcmlimit: '250',
        prop: 'imageinfo',
        iiprop: 'url',
        iiurlwidth: 0,
        origin: '*',
        ...(cmcontinue ? { gcmcontinue: cmcontinue } : {}),
      },
      timeout: 30000,
      headers: {
        'User-Agent': 'wordpecker-app/1.0 (+https://example.invalid)',
      },
    }), 'Fetching Commons category page');

    const pages = response.data?.query?.pages || [];
    for (const page of pages) {
      const imageInfo = page.imageinfo?.[0];
      if (!imageInfo?.url) {
        continue;
      }

      const extracted = extractWordFromTitle(page.title);
      collected.push({
        title: page.title,
        fileUrl: imageInfo.url,
        word: extracted.word,
        normalizedWord: extracted.normalizedWord,
        sourceTitle: extracted.sourceTitle,
      });
    }

    cmcontinue = response.data?.continue?.gcmcontinue;
  } while (cmcontinue);

  return collected;
};

const downloadFile = async (url: string, outputPath: string) => {
  const response = await withRetry(() => axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: {
      'User-Agent': 'wordpecker-app/1.0 (+https://example.invalid)',
    },
  }), `Downloading ${path.basename(outputPath)}`);
  await fs.promises.writeFile(outputPath, Buffer.from(response.data));
  return Buffer.byteLength(response.data);
};

const buildTargetWordMap = () => {
  const levels = loadSpanishVocabularyLevels();
  const targetWords = new Map<string, string>();

  for (const words of levels.values()) {
    for (const word of words) {
      const normalizedWord = normalizeWord(word.spanish);
      if (!targetWords.has(normalizedWord)) {
        targetWords.set(normalizedWord, word.spanish);
      }
    }
  }

  return targetWords;
};

const generateElevenLabsAudio = async (
  client: ElevenLabsClient,
  text: string,
  outputPath: string
) => {
  const audioResponse = await client.textToSpeech.convert(DEFAULT_ELEVENLABS_VOICE, {
    text,
    modelId: DEFAULT_ELEVENLABS_MODEL,
    voiceSettings: {
      stability: 0.5,
      similarityBoost: 0.8,
      style: 0,
      useSpeakerBoost: true,
    },
  });

  const chunks: Uint8Array[] = [];
  const reader = audioResponse.getReader();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  const audioBuffer = Buffer.concat(chunks);
  await fs.promises.writeFile(outputPath, audioBuffer);
  return audioBuffer.byteLength;
};

const buildWindowsBatchCommand = (manifestPath: string, targetCulture: string): string => {
  const encodedManifestPath = Buffer.from(manifestPath, 'utf8').toString('base64');
  const encodedTargetCulture = Buffer.from(targetCulture, 'utf8').toString('base64');
  const script = `
Add-Type -AssemblyName System.Speech
$manifestPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedManifestPath}'))
$targetCulture = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedTargetCulture}'))
$jobs = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
  $selectedVoice = $voices | Where-Object { $_.Culture.Name -like "$targetCulture*" } | Select-Object -First 1
  if (-not $selectedVoice) {
    $selectedVoice = $voices | Where-Object { $_.Culture.Name -like 'es-*' } | Select-Object -First 1
  }
  if (-not $selectedVoice) {
    throw "No installed Spanish voice found for $targetCulture."
  }

  $synth.SelectVoice($selectedVoice.Name)
  $synth.Rate = 0

  foreach ($job in $jobs) {
    $directory = Split-Path -Parent $job.outputPath
    if (-not (Test-Path -LiteralPath $directory)) {
      New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $synth.SetOutputToWaveFile($job.outputPath)
    $synth.Speak($job.word)
    $synth.SetOutputToNull()
    Write-Host ("Generated " + $job.word + " -> " + $job.outputPath)
  }
}
finally {
  $synth.Dispose()
}
`;

  return Buffer.from(script, 'utf16le').toString('base64');
};

const downloadFromCommons = async (
  targetWords: Map<string, string>,
  options: ScriptOptions
) => {
  await fs.promises.mkdir(AUDIO_DIR, { recursive: true });

  console.log(`Target words: ${targetWords.size}`);
  console.log('Fetching Wikimedia Commons Lingua Libre files...');

  const files = await fetchCategoryFiles();
  const filesByWord = new Map<string, CommonsFileEntry>();

  for (const file of files) {
    if (!filesByWord.has(file.normalizedWord)) {
      filesByWord.set(file.normalizedWord, file);
    }
  }

  const matchedWords = Array.from(targetWords.keys()).filter((word) => filesByWord.has(word));
  const limitedWords = options.limit ? matchedWords.slice(0, options.limit) : matchedWords;
  console.log(`Matched words: ${matchedWords.length}`);

  const existingEntries = options.force ? [] : await readExistingIndex();
  const entriesByWord = new Map(existingEntries.map((entry) => [entry.normalizedWord, entry]));
  const entries: PronunciationIndex['entries'] = [];
  const progress = {
    generatedAt: new Date().toISOString(),
    source: 'wikimedia-commons-lingua-libre' as const,
    locale: 'es' as const,
    targetWords: targetWords.size,
    matchedWords: limitedWords.length,
    downloadedFiles: 0,
    completedWords: [] as string[],
    provider: 'commons',
  };

  for (const normalizedWord of limitedWords) {
    if (!options.force && entriesByWord.has(normalizedWord)) {
      entries.push(entriesByWord.get(normalizedWord)!);
      progress.completedWords.push(normalizedWord);
      await writeProgress(progress);
      continue;
    }

    const file = filesByWord.get(normalizedWord);
    if (!file) {
      continue;
    }

    const fileName = path.basename(file.fileUrl);
    const outputPath = path.join(AUDIO_DIR, fileName);

    if (!fs.existsSync(outputPath)) {
      const bytes = await downloadFile(file.fileUrl, outputPath);
      entries.push({
        word: file.word,
        normalizedWord,
        sourceTitle: file.sourceTitle,
        fileName,
        filePath: path.relative(BASE_DOWNLOAD_DIR, outputPath),
        fileUrl: file.fileUrl,
        bytes,
      });
      progress.downloadedFiles += 1;
      console.log(`Downloaded ${file.word} -> ${fileName}`);
    } else {
      const stats = await fs.promises.stat(outputPath);
      entries.push({
        word: file.word,
        normalizedWord,
        sourceTitle: file.sourceTitle,
        fileName,
        filePath: path.relative(BASE_DOWNLOAD_DIR, outputPath),
        fileUrl: file.fileUrl,
        bytes: stats.size,
      });
    }

    progress.completedWords.push(normalizedWord);
    await writeProgress(progress);
  }

  const mergedEntries = Array.from(
    new Map([...existingEntries, ...entries].map((entry) => [entry.normalizedWord, entry])).values()
  );
  await writeIndex('wikimedia-commons-lingua-libre', mergedEntries);
  await writeProgress({
    ...progress,
    completedAt: new Date().toISOString(),
    indexPath: path.relative(process.cwd(), INDEX_PATH),
  });

  return {
    provider: 'commons' as const,
    targetWords: targetWords.size,
    matchedWords: limitedWords.length,
    downloadedFiles: entries.length,
    entries: mergedEntries,
  };
};

const downloadFromElevenLabs = async (
  targetWords: Map<string, string>,
  options: ScriptOptions
) => {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_elevenlabs_api_key_here' || apiKey === 'local-placeholder-key') {
    throw new Error('ELEVENLABS_API_KEY is missing or still using a placeholder value.');
  }

  await fs.promises.mkdir(AUDIO_DIR, { recursive: true });

  const client = new ElevenLabsClient({ apiKey });
  const existingEntries = options.force ? [] : await readExistingIndex();
  const entriesByWord = new Map(existingEntries.map((entry) => [entry.normalizedWord, entry]));
  const selectedWords = Array.from(targetWords.entries()).slice(0, options.limit ?? targetWords.size);
  const entries: PronunciationIndex['entries'] = [...existingEntries];
  let downloadedFiles = 0;

  const progress = {
    generatedAt: new Date().toISOString(),
    source: 'elevenlabs' as const,
    locale: 'es' as const,
    targetWords: targetWords.size,
    selectedWords: selectedWords.length,
    matchedWords: 0,
    downloadedFiles: 0,
    completedWords: [] as string[],
    provider: 'elevenlabs',
    voiceId: DEFAULT_ELEVENLABS_VOICE,
    modelId: DEFAULT_ELEVENLABS_MODEL,
  };

  for (const [normalizedWord, originalWord] of selectedWords) {
    if (!options.force && entriesByWord.has(normalizedWord)) {
      progress.matchedWords += 1;
      progress.completedWords.push(normalizedWord);
      await writeProgress(progress);
      continue;
    }

    const fileName = `${normalizedWord}.mp3`;
    const outputPath = path.join(AUDIO_DIR, fileName);
    const bytes = await generateElevenLabsAudio(client, originalWord, outputPath);

    const entry = {
      word: originalWord,
      normalizedWord,
      sourceTitle: `ElevenLabs:${originalWord}`,
      fileName,
      filePath: path.join('audio', fileName),
      fileUrl: '',
      bytes,
    };

    entriesByWord.set(normalizedWord, entry);
    downloadedFiles += 1;
    progress.matchedWords += 1;
    progress.downloadedFiles = downloadedFiles;
    progress.completedWords.push(normalizedWord);
    console.log(`Generated ${originalWord} -> ${fileName}`);
    await writeProgress(progress);
    await sleep(250);
  }

  const mergedEntries = Array.from(entriesByWord.values());
  await writeIndex('elevenlabs', mergedEntries);
  await writeProgress({
    ...progress,
    completedAt: new Date().toISOString(),
    indexPath: path.relative(process.cwd(), INDEX_PATH),
  });

  return {
    provider: 'elevenlabs' as const,
    targetWords: targetWords.size,
    matchedWords: progress.matchedWords,
    downloadedFiles,
    entries: mergedEntries,
  };
};

const downloadFromWindows = async (
  targetWords: Map<string, string>,
  options: ScriptOptions
) => {
  if (process.platform !== 'win32') {
    throw new Error('Windows speech generation is only available on Windows.');
  }

  await fs.promises.mkdir(AUDIO_DIR, { recursive: true });

  const existingEntries = options.force ? [] : await readExistingIndex();
  const entriesByWord = new Map(existingEntries.map((entry) => [entry.normalizedWord, entry]));
  const selectedWords = Array.from(targetWords.entries()).slice(0, options.limit ?? targetWords.size);
  const pendingJobs = selectedWords
    .filter(([normalizedWord]) => options.force || !entriesByWord.has(normalizedWord))
    .map(([normalizedWord, originalWord]) => ({
      normalizedWord,
      originalWord,
      fileName: `${normalizedWord}.wav`,
      outputPath: path.join(AUDIO_DIR, `${normalizedWord}.wav`),
    }));

  const progress = {
    generatedAt: new Date().toISOString(),
    source: 'windows-speech' as const,
    locale: 'es' as const,
    targetWords: targetWords.size,
    selectedWords: selectedWords.length,
    matchedWords: 0,
    downloadedFiles: 0,
    completedWords: [] as string[],
    provider: 'windows',
    targetCulture: DEFAULT_WINDOWS_CULTURE,
  };

  for (const [normalizedWord] of selectedWords) {
    if (!options.force && entriesByWord.has(normalizedWord)) {
      progress.matchedWords += 1;
      progress.completedWords.push(normalizedWord);
    }
  }

  await writeProgress(progress);

  if (pendingJobs.length > 0) {
    const manifest = pendingJobs.map((job) => ({
      word: job.originalWord,
      outputPath: job.outputPath,
    }));
    await fs.promises.writeFile(WINDOWS_BATCH_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    const command = buildWindowsBatchCommand(WINDOWS_BATCH_PATH, DEFAULT_WINDOWS_CULTURE);
    await execFileAsync('powershell', ['-NoProfile', '-EncodedCommand', command], {
      timeout: 0,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
    });
  }

  let downloadedFiles = 0;
  for (const job of pendingJobs) {
    if (!fs.existsSync(job.outputPath)) {
      throw new Error(`Windows speech did not create ${job.fileName}`);
    }

    const stats = await fs.promises.stat(job.outputPath);
    entriesByWord.set(job.normalizedWord, {
      word: job.originalWord,
      normalizedWord: job.normalizedWord,
      sourceTitle: `WindowsSpeech:${job.originalWord}`,
      fileName: job.fileName,
      filePath: path.join('audio', job.fileName),
      fileUrl: '',
      bytes: stats.size,
    });
    downloadedFiles += 1;
    progress.matchedWords += 1;
    progress.downloadedFiles = downloadedFiles;
    progress.completedWords.push(job.normalizedWord);
    await writeProgress(progress);
  }

  const mergedEntries = Array.from(entriesByWord.values());
  await writeIndex('windows-speech', mergedEntries);
  await writeProgress({
    ...progress,
    completedAt: new Date().toISOString(),
    indexPath: path.relative(process.cwd(), INDEX_PATH),
  });

  return {
    provider: 'windows' as const,
    targetWords: targetWords.size,
    matchedWords: progress.matchedWords,
    downloadedFiles,
    entries: mergedEntries,
  };
};

const summarizeCoverage = (
  targetWords: Map<string, string>,
  entries: PronunciationIndex['entries']
) => {
  const covered = new Set(entries.map((entry) => entry.normalizedWord));
  const missingWords = Array.from(targetWords.entries())
    .filter(([normalizedWord]) => !covered.has(normalizedWord))
    .map(([, originalWord]) => originalWord);

  const missingPatterns = new Map<string, number>();
  for (const word of missingWords) {
    const key = word[0]?.toLowerCase() || '#';
    missingPatterns.set(key, (missingPatterns.get(key) || 0) + 1);
  }

  const topMissingPatterns = Array.from(missingPatterns.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([pattern, count]) => ({ pattern, count }));

  return {
    targetWords: targetWords.size,
    coveredWords: covered.size,
    missingWords: missingWords.length,
    coverageRate: Number(((covered.size / targetWords.size) * 100).toFixed(2)),
    topMissingPatterns,
    missingSamples: missingWords.slice(0, 20),
  };
};

const run = async () => {
  const options = parseArgs();
  const targetWords = buildTargetWordMap();

  let result;
  if (options.provider === 'commons') {
    result = await downloadFromCommons(targetWords, options);
  } else if (options.provider === 'windows') {
    result = await downloadFromWindows(targetWords, options);
  } else if (options.provider === 'elevenlabs') {
    result = await downloadFromElevenLabs(targetWords, options);
  } else {
    try {
      result = await downloadFromCommons(targetWords, options);
    } catch (error) {
      console.warn('Commons download failed; falling back to Windows speech.', error);
      try {
        result = await downloadFromWindows(targetWords, options);
      } catch (windowsError) {
        console.warn('Windows speech fallback failed; falling back to ElevenLabs.', windowsError);
        result = await downloadFromElevenLabs(targetWords, options);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        provider: result.provider,
        targetWords: result.targetWords,
        matchedWords: result.matchedWords,
        downloadedFiles: result.downloadedFiles,
        indexPath: path.relative(process.cwd(), INDEX_PATH),
        coverage: summarizeCoverage(targetWords, result.entries),
      },
      null,
      2
    )
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
