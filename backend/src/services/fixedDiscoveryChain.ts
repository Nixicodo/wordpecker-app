import { IWordList, WordList } from '../api/lists/model';
import { IWord, IWordListMembership, Word } from '../api/words/model';
import { LearningState } from '../api/learning-state/model';
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
  ...getManagedSpanishVocabularyListNames().reverse()
];

export const selectFixedDiscoveryWords = async (
  userId: string,
  count = 15
): Promise<DiscoveryBatch> => {
  const chain = buildFixedDiscoveryChain();
  const sourceNames = chain.slice(1);
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
    const sourceWords = (await Word.find({ 'listMemberships.listId': sourceList._id })
      .select('_id value listMemberships')
      .sort({ created_at: 1, value: 1 })
      .lean()) as LeanWord[];

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
