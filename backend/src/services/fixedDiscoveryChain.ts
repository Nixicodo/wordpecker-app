import { IWordList, WordList } from '../api/lists/model';
import { IWord, IWordListMembership, Word } from '../api/words/model';
import { getManagedSpanishVocabularyListNames } from '../scripts/spanishVocabularyData';

export const FIXED_DISCOVERY_TARGET_LIST_NAME = '私教学习自用';

export type DiscoveryWord = {
  id: string;
  word: string;
  meaning: string;
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
  targetList: {
    id: string;
    name: string;
  };
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

export const buildFixedDiscoveryChain = () => [
  FIXED_DISCOVERY_TARGET_LIST_NAME,
  ...getManagedSpanishVocabularyListNames()
];

export const selectFixedDiscoveryWords = async (
  count = 15
): Promise<DiscoveryBatch> => {
  const chain = buildFixedDiscoveryChain();
  const lists = (await WordList.find({ name: { $in: chain } })
    .select('_id name context')
    .lean()) as LeanList[];
  const listsByName = new Map<string, LeanList>(
    lists.map((list) => [list.name, list])
  );

  const targetList = listsByName.get(FIXED_DISCOVERY_TARGET_LIST_NAME);
  if (!targetList) {
    throw new Error(`Target list "${FIXED_DISCOVERY_TARGET_LIST_NAME}" not found`);
  }

  const targetWords = (await Word.find({ 'listMemberships.listId': targetList._id })
    .select('_id value')
    .lean()) as Array<Pick<IWord, '_id' | 'value'>>;
  const knownTargetWordValues = new Set(
    targetWords.map((word) => word.value.toLowerCase())
  );

  const orderedSourceLists = chain
    .slice(1)
    .map((name) => listsByName.get(name))
    .filter((list): list is LeanList => Boolean(list));

  for (const [index, sourceList] of orderedSourceLists.entries()) {
    const sourceWords = (await Word.find({ 'listMemberships.listId': sourceList._id })
      .select('_id value listMemberships')
      .sort({ created_at: 1, value: 1 })
      .lean()) as LeanWord[];

    const availableWords = sourceWords.flatMap((word) => {
      if (knownTargetWordValues.has(word.value.toLowerCase())) {
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
        targetList: {
          id: targetList._id.toString(),
          name: targetList.name
        },
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
    targetList: {
      id: targetList._id.toString(),
      name: targetList.name
    },
    sourceList: null,
    words: [],
    count: 0,
    chain
  };
};
