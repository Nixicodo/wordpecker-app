import fs from 'fs';
import path from 'path';
import axios from 'axios';
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
  source: 'wikimedia-commons-lingua-libre';
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

const fetchCategoryFiles = async (): Promise<CommonsFileEntry[]> => {
  const collected: CommonsFileEntry[] = [];
  let cmcontinue: string | undefined;

  do {
    const response = await axios.get(COMMONS_API, {
      params: {
        action: 'query',
        format: 'json',
        formatversion: 2,
        generator: 'categorymembers',
        gcmtitle: 'Category:Lingua Libre pronunciation-spa',
        gcmtype: 'file',
        gcmlimit: '500',
        prop: 'imageinfo',
        iiprop: 'url',
        iiurlwidth: 0,
        origin: '*',
        ...(cmcontinue ? { gcmcontinue: cmcontinue } : {}),
      },
      timeout: 30000,
    });

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
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  await fs.promises.writeFile(outputPath, Buffer.from(response.data));
  return Buffer.byteLength(response.data);
};

const run = async () => {
  const levels = loadSpanishVocabularyLevels();
  const targetWords = new Set<string>();

  for (const words of levels.values()) {
    for (const word of words) {
      targetWords.add(normalizeWord(word.spanish));
    }
  }

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

  const matchedWords = Array.from(targetWords).filter((word) => filesByWord.has(word));
  console.log(`Matched words: ${matchedWords.length}`);

  const entries: PronunciationIndex['entries'] = [];

  for (const normalizedWord of matchedWords) {
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
  }

  const index: PronunciationIndex = {
    generatedAt: new Date().toISOString(),
    source: 'wikimedia-commons-lingua-libre',
    locale: 'es',
    entries,
  };

  await fs.promises.mkdir(BASE_DOWNLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(INDEX_PATH, JSON.stringify(index, null, 2) + '\n', 'utf-8');

  console.log(
    JSON.stringify(
      {
        targetWords: targetWords.size,
        matchedWords: matchedWords.length,
        downloadedFiles: entries.length,
        indexPath: path.relative(process.cwd(), INDEX_PATH),
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
