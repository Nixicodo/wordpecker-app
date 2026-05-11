import { z } from 'zod';
import { generateStructuredResult } from './structuredChat';

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', '\u00e1', '\u00e9', '\u00ed', '\u00f3', '\u00fa', '\u00fc']);

const DAILY_CONTEXT = '\u65e5\u5e38\u4ea4\u6d41';
const MEXICAN_DAILY_CONTEXT = '\u58a8\u897f\u54e5\u897f\u73ed\u7259\u8bed\u65e5\u5e38\u4ea4\u6d41';

const normalizeMeaning = (meaning: string) => {
  let current = meaning.trim().replace(/\s+/g, ' ');

  while (current.length > 0) {
    const next = current.replace(/\s*[\(\uFF08][^()\uFF08\uFF09]*[\)\uFF09]\s*$/u, '').trim();
    if (next === current) {
      break;
    }
    current = next;
  }

  return current.split(/[;\uFF1B]/)[0].trim();
};

const isVowel = (char: string | undefined) => Boolean(char && VOWELS.has(char));

const mapVowel = (char: string) =>
  char
    .replace('\u00e1', 'a')
    .replace('\u00e9', 'e')
    .replace('\u00ed', 'i')
    .replace('\u00f3', 'o')
    .replace('\u00fa', 'u')
    .replace('\u00fc', 'u');

const DISCOVERY_MACHINE_CONTEXT_PATTERN = /^Mexican Spanish frequency vocabulary level \d+ \([^)]+\)$/i;

const normalizeDiscoveryContext = (context?: string) => {
  const trimmed = context?.trim();
  if (!trimmed) {
    return DAILY_CONTEXT;
  }

  if (DISCOVERY_MACHINE_CONTEXT_PATTERN.test(trimmed)) {
    return MEXICAN_DAILY_CONTEXT;
  }

  return trimmed;
};

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
  const normalizedContext = normalizeDiscoveryContext(sourceContext || context);

  if (!normalizedMeaning) {
    return normalizedContext === DAILY_CONTEXT
      ? '\u7528\u4e8e\u65e5\u5e38\u4ea4\u6d41\u3002'
      : `\u7528\u4e8e${normalizedContext}\u3002`;
  }

  return `${normalizedMeaning}\u3002`;
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

const DISCOVERY_EXPLANATION_BATCH_SIZE = 20;

export const buildDiscoveryExplanationPrompt = (items: DiscoveryExplanationInput[]) => ([
  '\u8bf7\u4e3a\u4e0b\u9762\u7684\u897f\u73ed\u7259\u8bed\u8bcd\u6761\u751f\u6210\u4e00\u884c\u4e2d\u6587\u8be6\u7ec6\u89e3\u91ca\uff0c\u9002\u5408\u8bcd\u5361\u5c55\u793a\u3002',
  '\u8981\u6c42\uff1a',
  '1. \u6bcf\u4e2a\u8bcd\u53ea\u8f93\u51fa\u4e00\u53e5\u4e2d\u6587\uff0c\u4e0d\u8981\u5206\u884c\uff0c\u4e0d\u8981\u9879\u76ee\u7b26\u53f7\u3002',
  '2. \u76f4\u63a5\u89e3\u91ca\u8fd9\u4e2a\u8bcd\u6700\u57fa\u672c\u7684\u7528\u6cd5\uff0c\u5fc5\u8981\u65f6\u8865\u4e00\u53e5\u6700\u503c\u5f97\u6ce8\u610f\u7684\u70b9\uff0c\u6bd4\u5982\u5e38\u89c1\u573a\u666f\u3001\u642d\u914d\u3001\u8bed\u6c14\u6216\u6613\u6df7\u533a\u522b\u3002',
  '3. \u4e0d\u8981\u5199\u201c\u58a8\u897f\u54e5\u5e38\u7528\u201d\u201c\u591a\u89c1\u4e8e\u201d\u201cMexican Spanish\u201d\u201c\u591a\u6307\u201d\u8fd9\u7c7b\u5957\u8bdd\uff0c\u4e5f\u4e0d\u8981\u7167\u6284\u8bcd\u4e49\u6807\u7b7e\u3002',
  '4. \u4e0d\u8981\u628a level\u3001Mexican Spanish frequency vocabulary \u4e4b\u7c7b\u7684\u673a\u5668\u4e0a\u4e0b\u6587\u5199\u8fdb\u7ed3\u679c\u91cc\u3002',
  '5. \u4e0d\u8981\u5199\u957f\u7bc7\u8bcd\u5178\u91ca\u4e49\uff0c\u5c3d\u91cf\u7b80\u77ed\u6e05\u695a\uff0c\u9002\u5408\u76f4\u63a5\u5c55\u793a\u3002',
  '6. \u8f93\u51fa JSON only\uff0c\u4e25\u683c\u6309\u8981\u6c42\u5b57\u6bb5\u540d\u3002',
  '',
  '\u8bcd\u6761\u5217\u8868\uff1a',
  ...items.map((item, index) => `${index + 1}. ${item.word} | ${item.meaning} | ${normalizeDiscoveryContext(item.context)}`)
]).join('\n');

const discoveryExplanationSystemPrompt = [
  '\u4f60\u662f\u897f\u73ed\u7259\u8bed\u5b66\u4e60\u5185\u5bb9\u7f16\u8f91\u52a9\u624b\u3002',
  '\u4f60\u7684\u4efb\u52a1\u662f\u628a\u8bcd\u6761\u6539\u5199\u6210\u9002\u5408\u8bcd\u5361\u5c55\u793a\u7684\u4e2d\u6587\u77ed\u89e3\u91ca\u3002',
  '\u89e3\u91ca\u8981\u76f4\u63a5\u3001\u5177\u4f53\u3001\u81ea\u7136\uff0c\u4f18\u5148\u8bf4\u660e\u57fa\u672c\u7528\u6cd5\u548c\u9700\u8981\u6ce8\u610f\u7684\u5730\u65b9\u3002',
  '\u9ed8\u8ba4\u6309\u58a8\u897f\u54e5\u897f\u73ed\u7259\u8bed\u7406\u89e3\uff0c\u4f46\u53ea\u6709\u5730\u57df\u5dee\u5f02\u771f\u7684\u91cd\u8981\u65f6\u624d\u7b80\u77ed\u70b9\u660e\u3002',
  '\u5fc5\u987b\u4e25\u683c\u8f93\u51fa JSON\uff0c\u4e0d\u8981\u8f93\u51fa\u4efb\u4f55\u989d\u5916\u6587\u5b57\u3002'
].join('\n');

const generateDiscoveryExplanationBatch = async (
  items: DiscoveryExplanationInput[]
): Promise<Array<{ word: string; detailedExplanation: string }>> => {
  if (!items.length) {
    return [];
  }

  if (process.env.NODE_ENV === 'test') {
    return items.map((item) => ({
      word: item.word,
      detailedExplanation: buildMexicanUsageExplanation(item.meaning, item.context)
    }));
  }

  const prompt = buildDiscoveryExplanationPrompt(items);

  try {
    const result = await generateStructuredResult<z.infer<typeof DiscoveryExplanationResult>>({
      systemPrompt: discoveryExplanationSystemPrompt,
      userPrompt: prompt,
      schema: DiscoveryExplanationResult,
      schemaHint: '{\n  "explanations": Array<{\n    "word": string,\n    "detailedExplanation": string\n  }>\n}',
      temperature: 0.3,
      maxTokens: 1400
    });

    const resultByWord = new Map(
      result.explanations.map((item) => [item.word.trim().toLowerCase(), item.detailedExplanation.trim()])
    );

    return items.map((item) => ({
      word: item.word,
      detailedExplanation:
        resultByWord.get(item.word.trim().toLowerCase()) ||
        buildMexicanUsageExplanation(item.meaning, item.context)
    }));
  } catch (error) {
    if (items.length > 1) {
      const midpoint = Math.ceil(items.length / 2);
      const left = await generateDiscoveryExplanationBatch(items.slice(0, midpoint));
      const right = await generateDiscoveryExplanationBatch(items.slice(midpoint));
      return [...left, ...right];
    }

    console.error('Failed to generate discovery explanations with DeepseekFlash:', error);
    return items.map((item) => ({
      word: item.word,
      detailedExplanation: buildMexicanUsageExplanation(item.meaning, item.context)
    }));
  }
};

export const generateDiscoveryDetailedExplanations = async (
  items: DiscoveryExplanationInput[]
) => {
  const normalizedItems = items.filter((item) => item.word.trim().length > 0);
  if (!normalizedItems.length) {
    return [];
  }

  const results: Array<{ word: string; detailedExplanation: string }> = [];

  for (let index = 0; index < normalizedItems.length; index += DISCOVERY_EXPLANATION_BATCH_SIZE) {
    const batch = normalizedItems.slice(index, index + DISCOVERY_EXPLANATION_BATCH_SIZE);
    const batchResults = await generateDiscoveryExplanationBatch(batch);
    results.push(...batchResults);
  }

  return results;
};
