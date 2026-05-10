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
