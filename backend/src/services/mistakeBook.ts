import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import { persistLearningSnapshot } from './repoLearningSnapshot';

export const MISTAKE_BOOK_SYSTEM_KEY = 'mistake-book';

const MISTAKE_BOOK_META = {
  name: '错题本',
  description: '自动收集你在其他词树里答错过的单词，并按掌握程度逐渐降低出现频率。',
  context: 'Mistake review across all word trees'
};

export const isMistakeBookList = (list: { kind?: string; systemKey?: string } | null | undefined) =>
  list?.kind === 'mistake_book' || list?.systemKey === MISTAKE_BOOK_SYSTEM_KEY;

export const ensureMistakeBook = async () => {
  let list = await WordList.findOne({ systemKey: MISTAKE_BOOK_SYSTEM_KEY });
  if (list) {
    return list;
  }

  list = await WordList.create({
    ...MISTAKE_BOOK_META,
    kind: 'mistake_book',
    systemKey: MISTAKE_BOOK_SYSTEM_KEY
  });

  await persistLearningSnapshot();
  return list;
};

export const recordMistakeWord = async (sourceListId: string, wordId: string) => {
  const [mistakeBook, word] = await Promise.all([
    ensureMistakeBook(),
    Word.findById(wordId)
  ]);

  if (!word) {
    return;
  }

  const sourceContext = word.ownedByLists.find(context => context.listId.toString() === sourceListId);
  if (!sourceContext) {
    return;
  }

  const mistakeContext = word.ownedByLists.find(context => context.listId.toString() === mistakeBook._id.toString());
  if (mistakeContext) {
    mistakeContext.meaning = sourceContext.meaning || mistakeContext.meaning;
    mistakeContext.learnedPoint = Math.max(0, (mistakeContext.learnedPoint || 0) - 20);
    mistakeContext.wrongCount = (mistakeContext.wrongCount || 0) + 1;
    mistakeContext.lastWrongAt = new Date();

    const existingSourceListIds = new Set((mistakeContext.sourceListIds || []).map(id => id.toString()));
    if (!existingSourceListIds.has(sourceListId)) {
      mistakeContext.sourceListIds = [
        ...(mistakeContext.sourceListIds || []),
        sourceContext.listId
      ];
    }
  } else {
    word.ownedByLists.push({
      listId: mistakeBook._id,
      meaning: sourceContext.meaning,
      learnedPoint: 0,
      wrongCount: 1,
      sourceListIds: [sourceContext.listId],
      lastWrongAt: new Date()
    });
  }

  await word.save();
  await persistLearningSnapshot();
};
