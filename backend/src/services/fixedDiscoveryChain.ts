import { IWordList, WordList } from '../api/lists/model';
import { IWord, IWordListMembership, Word } from '../api/words/model';
import { LearningState } from '../api/learning-state/model';
import { getManagedSpanishVocabularyListNames } from '../scripts/spanishVocabularyData';
import {
  buildMexicanUsageExplanation,
  buildSpanishPhonetic,
  generateDiscoveryDetailedExplanations
} from './spanishDiscoveryContent';

export const FIXED_DISCOVERY_TARGET_LIST_NAME = '私教学习自用';

export type DiscoveryWord = {
  id: string;
  word: string;
  meaning: string;
  phonetic: string;
  detailedExplanation: string;
  example: string;
  difficulty_level: 'basic' | 'intermediate' | 'advanced';
  context: string;
  sourceListId: string;
  sourceListName: string;
  sourceContext?: string;
};

export type DiscoverySourceSummary = {
  id: string;
  name: string;
  context?: string;
  remainingCount: number;
  chainIndex: number;
  totalSources: number;
};

export type DiscoveryBatch = {
  sourceList: DiscoverySourceSummary | null;
  words: DiscoveryWord[];
  count: number;
  chain: string[];
};

type LeanList = Pick<IWordList, '_id' | 'name' | 'context'>;
type LeanWord = Pick<IWord, '_id' | 'value' | 'listMemberships'>;

const getMembership = (
  word: Pick<IWord, 'listMemberships'>,
  listId: string
): IWordListMembership | undefined => word.listMemberships.find(
  (membership) => membership.listId.toString() === listId
);

const parseSpanishLevel = (listName: string) => {
  const match = listName.match(/Level(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
};

const resolveDifficultyLevel = (
  listName: string
): DiscoveryWord['difficulty_level'] => {
  const level = parseSpanishLevel(listName);

  if (level === null || level <= 3) {
    return 'basic';
  }

  if (level <= 6) {
    return 'intermediate';
  }

  return 'advanced';
};

const getDiscoveryExplanationKey = (word: Pick<IWord, 'value'>) => word.value.trim().toLowerCase();

const cacheDiscoveryWordContent = async (
  sourceList: LeanList,
  words: IWord[]
) => {
  const sourceListId = sourceList._id.toString();
  const itemsToGenerate = words
    .map((word) => {
      const membership = getMembership(word, sourceListId);
      if (!membership) {
        return null;
      }

      return {
        word,
        membership,
        meaning: membership.meaning,
        context: sourceList.context || sourceList.name
      };
    })
    .filter((item): item is {
      word: IWord;
      membership: IWordListMembership;
      meaning: string;
      context: string;
    } => Boolean(item));

  if (!itemsToGenerate.length) {
    return new Map<string, string>();
  }

  const explanationInputs = itemsToGenerate
    .filter(({ membership }) => !membership.detailedExplanation)
    .map(({ word, meaning, context }) => ({
      word: word.value,
      meaning,
      context
    }));

  const generatedExplanations = explanationInputs.length
    ? await generateDiscoveryDetailedExplanations(explanationInputs)
    : [];

  const generatedExplanationMap = new Map(
    generatedExplanations.map((item) => [item.word.trim().toLowerCase(), item.detailedExplanation])
  );

  await Promise.all(itemsToGenerate.map(async ({ word, membership, meaning, context }) => {
    const currentPhonetic = membership.phonetic || buildSpanishPhonetic(word.value);
    const generatedExplanation = membership.detailedExplanation
      || generatedExplanationMap.get(getDiscoveryExplanationKey(word))
      || buildMexicanUsageExplanation(meaning, context);
    const hasChanges =
      membership.phonetic !== currentPhonetic ||
      membership.detailedExplanation !== generatedExplanation ||
      !membership.detailedExplanationGeneratedAt;

    if (!hasChanges) {
      return;
    }

    membership.phonetic = currentPhonetic;
    membership.detailedExplanation = generatedExplanation;
    membership.detailedExplanationGeneratedAt = new Date();
    membership.updatedAt = new Date();
    word.markModified('listMemberships');
    await word.save();
  }));

  return new Map(
    itemsToGenerate.map(({ word, membership, meaning, context }) => [
      getDiscoveryExplanationKey(word),
      membership.detailedExplanation || generatedExplanationMap.get(getDiscoveryExplanationKey(word)) || buildMexicanUsageExplanation(meaning, context)
    ])
  );
};

export const refreshDiscoveryContentForList = async (
  sourceListId: string,
  options?: { force?: boolean }
) => {
  const force = options?.force ?? false;
  const sourceList = await WordList.findById(sourceListId)
    .select('_id name context')
    .lean() as LeanList | null;

  if (!sourceList) {
    return 0;
  }

  const sourceWords = await Word.find({ 'listMemberships.listId': sourceList._id })
    .select('_id value listMemberships')
    .sort({ created_at: 1, value: 1 });

  const wordsToRefresh = force
    ? sourceWords
    : sourceWords.filter((word) => {
        const membership = getMembership(word, sourceList._id.toString());
        return Boolean(
          membership &&
          (
            !membership.phonetic ||
            !membership.detailedExplanation ||
            !membership.detailedExplanationGeneratedAt
          )
        );
      });

  if (!wordsToRefresh.length) {
    return 0;
  }

  if (force) {
    for (const word of wordsToRefresh) {
      const membership = getMembership(word, sourceList._id.toString());
      if (!membership) {
        continue;
      }

      membership.detailedExplanation = undefined;
      membership.detailedExplanationGeneratedAt = undefined;
      word.markModified('listMemberships');
    }
  }

  await cacheDiscoveryWordContent(sourceList, wordsToRefresh);
  return wordsToRefresh.length;
};

export const backfillDiscoveryContentForList = async (
  userId: string,
  sourceListId: string,
  options?: { force?: boolean }
) => {
  const force = options?.force ?? false;
  const sourceList = await WordList.findById(sourceListId)
    .select('_id name context')
    .lean() as LeanList | null;

  if (!sourceList) {
    return 0;
  }

  const reviewedStates = await LearningState.find({
    userId,
    listId: sourceList._id,
    reviewCount: { $gt: 0 }
  })
    .select('wordId listId')
    .lean();

  if (!reviewedStates.length) {
    return 0;
  }

  const reviewedWordIds = new Set(reviewedStates.map((state) => state.wordId.toString()));
  const reviewedWords = await Word.find({
    _id: { $in: Array.from(reviewedWordIds) },
    'listMemberships.listId': sourceList._id
  })
    .select('_id value listMemberships')
    .sort({ created_at: 1, value: 1 });

  const wordsToBackfill = force
    ? reviewedWords
    : reviewedWords.filter((word) => {
        const membership = getMembership(word, sourceList._id.toString());
        return Boolean(
          membership &&
          (
            !membership.phonetic ||
            !membership.detailedExplanation ||
            !membership.detailedExplanationGeneratedAt
          )
        );
      });

  if (!wordsToBackfill.length) {
    return 0;
  }

  if (force) {
    for (const word of wordsToBackfill) {
      const membership = getMembership(word, sourceList._id.toString());
      if (!membership) {
        continue;
      }

      membership.detailedExplanation = undefined;
      membership.detailedExplanationGeneratedAt = undefined;
      word.markModified('listMemberships');
    }
  }

  await cacheDiscoveryWordContent(sourceList, wordsToBackfill);
  return wordsToBackfill.length;
};

export const prefetchDiscoveryContentForList = async (
  userId: string,
  sourceListId: string,
  count: number
) => {
  const sourceList = await WordList.findById(sourceListId)
    .select('_id name context')
    .lean() as LeanList | null;

  if (!sourceList) {
    return;
  }

  const introducedStates = await LearningState.find({
    userId,
    listId: sourceList._id,
    reviewCount: { $gt: 0 }
  })
    .select('wordId listId')
    .lean();
  const introducedWordKeys = new Set(
    introducedStates.map((state) => `${state.listId.toString()}:${state.wordId.toString()}`)
  );

  const sourceWords = await Word.find({ 'listMemberships.listId': sourceList._id })
    .select('_id value listMemberships')
    .sort({ created_at: 1, value: 1 });

  const remainingWords = sourceWords.filter((word) =>
    !introducedWordKeys.has(`${sourceList._id.toString()}:${word._id.toString()}`)
  );

  await cacheDiscoveryWordContent(sourceList, remainingWords.slice(0, count));
};

export const buildFixedDiscoveryChain = () => [
  FIXED_DISCOVERY_TARGET_LIST_NAME,
  ...getManagedSpanishVocabularyListNames()
];

const runDiscoveryBackgroundTask = async <T>(task: () => Promise<T>): Promise<T | undefined> => {
  if (process.env.NODE_ENV === 'test') {
    return task();
  }

  void task();
  return undefined;
};

export const selectFixedDiscoveryWords = async (
  userId: string,
  count = 15
): Promise<DiscoveryBatch> => {
  const chain = buildFixedDiscoveryChain();
  const sourceNames = chain;
  const lists = (await WordList.find({ name: { $in: sourceNames } })
    .select('_id name context')
    .lean()) as LeanList[];
  const listsByName = new Map<string, LeanList>(
    lists.map((list) => [list.name, list])
  );

  const orderedSourceLists = sourceNames
    .map((name) => listsByName.get(name))
    .filter((list): list is LeanList => Boolean(list));
  const introducedStates = await LearningState.find({
    userId,
    listId: { $in: orderedSourceLists.map((list) => list._id) },
    reviewCount: { $gt: 0 }
  })
    .select('wordId listId')
    .lean();
  const introducedWordKeys = new Set(
    introducedStates.map((state) => `${state.listId.toString()}:${state.wordId.toString()}`)
  );

  for (let index = 0; index < orderedSourceLists.length; index += 1) {
    const sourceList = orderedSourceLists[index];
    const sourceWords = await Word.find({ 'listMemberships.listId': sourceList._id })
      .select('_id value listMemberships')
      .sort({ created_at: 1, value: 1 });
    await backfillDiscoveryContentForList(userId, sourceList._id.toString());
    const cachedExplanationMap = await cacheDiscoveryWordContent(sourceList, sourceWords.slice(0, count));
    await runDiscoveryBackgroundTask(() =>
      prefetchDiscoveryContentForList(userId, sourceList._id.toString(), count + 20)
    );

    const availableWords = sourceWords.flatMap((word) => {
      if (introducedWordKeys.has(`${sourceList._id.toString()}:${word._id.toString()}`)) {
        return [];
      }

      const sourceMembership = getMembership(word, sourceList._id.toString());
      if (!sourceMembership) {
        return [];
      }

      return [{
        id: word._id.toString(),
        word: word.value,
        meaning: sourceMembership.meaning,
        phonetic: buildSpanishPhonetic(word.value),
        detailedExplanation:
          cachedExplanationMap.get(getDiscoveryExplanationKey(word))
          || sourceMembership.detailedExplanation
          || buildMexicanUsageExplanation(
            sourceMembership.meaning,
            sourceList.context || sourceList.name,
            sourceList.context
          ),
        example: '',
        difficulty_level: resolveDifficultyLevel(sourceList.name),
        context: sourceList.context || sourceList.name,
        sourceListId: sourceList._id.toString(),
        sourceListName: sourceList.name,
        sourceContext: sourceList.context
      }];
    });

    if (availableWords.length > 0) {
      return {
        sourceList: {
          id: sourceList._id.toString(),
          name: sourceList.name,
          context: sourceList.context,
          remainingCount: availableWords.length,
          chainIndex: index + 1,
          totalSources: orderedSourceLists.length
        },
        words: availableWords.slice(0, count),
        count: Math.min(count, availableWords.length),
        chain
      };
    }
  }

  return {
    sourceList: null,
    words: [],
    count: 0,
    chain
  };
};
