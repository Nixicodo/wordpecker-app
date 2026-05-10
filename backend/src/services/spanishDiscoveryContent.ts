import { z } from 'zod';
import { generateStructuredResult } from './structuredChat';

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', '\u00e1', '\u00e9', '\u00ed', '\u00f3', '\u00fa', '\u00fc']);

const normalizeMeaning = (meaning: string) =>
  meaning
    .trim()
    .replace(/\s+/g, ' ')
    .split(/[;()]/)[0]
    .trim();

const isVowel = (char: string | undefined) => Boolean(char && VOWELS.has(char));

const mapVowel = (char: string) =>
  char
    .replace('\u00e1', 'a')
    .replace('\u00e9', 'e')
    .replace('\u00ed', 'i')
    .replace('\u00f3', 'o')
    .replace('\u00fa', 'u')
    .replace('\u00fc', 'u');

export const buildSpanishPhonetic = (word: string) => {
  const lower = word.trim().toLowerCase();
  let output = '';

  for (let index = 0; index < lower.length; index += 1) {
    const current = lower[index];
    const next = lower[index + 1];
    const nextTwo = lower.slice(index, index + 2);
    const nextThree = lower.slice(index, index + 3);

    if (nextTwo === 'ch') {
      output += 't\u0283';
      index += 1;
      continue;
    }

    if (nextTwo === 'll') {
      output += '\u029d';
      index += 1;
      continue;
    }

    if (nextTwo === 'rr') {
      output += 'r';
      index += 1;
      continue;
    }

    if (nextTwo === 'qu') {
      output += 'k';
      index += 1;
      continue;
    }

    if (nextThree === 'gue' || nextThree === 'gui') {
      output += 'g';
      index += 1;
      continue;
    }

    if (nextTwo === 'g\u00fc' && isVowel(next)) {
      output += 'gw';
      index += 1;
      continue;
    }

    if (current === 'c') {
      output += next && ['e', 'i', '\u00e9', '\u00ed'].includes(next) ? 's' : 'k';
      continue;
    }

    if (current === 'g') {
      output += next && ['e', 'i', '\u00e9', '\u00ed'].includes(next) ? 'x' : 'g';
      continue;
    }

    if (current === 'j') {
      output += 'x';
      continue;
    }

    if (current === 'h') {
      continue;
    }

    if (current === 'v' || current === 'b') {
      output += 'b';
      continue;
    }

    if (current === 'x') {
      output += 'ks';
      continue;
    }

    if (current === 'y') {
      output += 'j';
      continue;
    }

    if (current === 'z') {
      output += 's';
      continue;
    }

    if (current === '\u00f1') {
      output += '\u0272';
      continue;
    }

    if (VOWELS.has(current)) {
      output += mapVowel(current);
      continue;
    }

    output += current;
  }

  return `/${output}/`;
};

export const buildMexicanUsageExplanation = (
  meaning: string,
  context?: string,
  sourceContext?: string
) => {
  const normalizedMeaning = normalizeMeaning(meaning);
  const sourceContextText = sourceContext?.trim() || context?.trim() || '\u65e5\u5e38\u4ea4\u6d41';
  const shortContext = sourceContextText.length > 16
    ? `${sourceContextText.slice(0, 16)}...`
    : sourceContextText;

  return `\u58a8\u897f\u54e5\u5e38\u7528\uff0c\u591a\u6307\u201c${normalizedMeaning}\u201d\uff0c\u591a\u89c1\u4e8e${shortContext}\u3002`;
};

const DiscoveryExplanationItem = z.object({
  word: z.string().min(1),
  detailedExplanation: z.string().min(1)
});

const DiscoveryExplanationResult = z.object({
  explanations: z.array(DiscoveryExplanationItem).min(1)
});

export type DiscoveryExplanationInput = {
  word: string;
  meaning: string;
  context: string;
};

export const generateDiscoveryDetailedExplanations = async (
  items: DiscoveryExplanationInput[]
) => {
  const normalizedItems = items.filter((item) => item.word.trim().length > 0);
  if (!normalizedItems.length) {
    return [];
  }

  if (process.env.NODE_ENV === 'test') {
    return normalizedItems.map((item) => ({
      word: item.word,
      detailedExplanation: buildMexicanUsageExplanation(item.meaning, item.context)
    }));
  }

  const prompt = [
    '请为下面的西班牙语单词生成「一行中文详细解释」；解释必须简短，适合词卡展示。',
    '要求：',
    '1. 每个词输出一句，不要分行，不要项目符号。',
    '2. 语气自然，突出它在墨西哥文化语境中的常见用法。',
    '3. 不要写长篇词典释义，不要超过 28 个汉字为宜。',
    '4. 如果是口语、俚语、日常高频词，可以直接说明适用场景。',
    '5. 输出 JSON only，严格按照要求的字段名。',
    '',
    '词条列表：',
    ...normalizedItems.map((item, index) => `${index + 1}. ${item.word}｜${item.meaning}｜${item.context}`)
  ].join('\n');

  try {
    const result = await generateStructuredResult<z.infer<typeof DiscoveryExplanationResult>>({
      systemPrompt: [
        '你是西班牙语墨西哥用法说明助手。',
        '你的任务是把词条转换成适合词卡展示的中文短解释。',
        '必须严格输出 JSON，不要输出任何额外文字。'
      ].join('\n'),
      userPrompt: prompt,
      schema: DiscoveryExplanationResult,
      schemaHint: `{
  "explanations": Array<{
    "word": string,
    "detailedExplanation": string
  }>
}`,
      temperature: 0.3,
      maxTokens: 1400
    });

    const resultByWord = new Map(
      result.explanations.map((item) => [item.word.trim().toLowerCase(), item.detailedExplanation.trim()])
    );

    return normalizedItems.map((item) => ({
      word: item.word,
      detailedExplanation:
        resultByWord.get(item.word.trim().toLowerCase()) ||
        buildMexicanUsageExplanation(item.meaning, item.context)
    }));
  } catch (error) {
    console.error('Failed to generate discovery explanations with DeepseekFlash:', error);
    return normalizedItems.map((item) => ({
      word: item.word,
      detailedExplanation: buildMexicanUsageExplanation(item.meaning, item.context)
    }));
  }
};
