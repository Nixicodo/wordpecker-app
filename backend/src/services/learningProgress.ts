import { Word } from '../api/words/model';
import { persistLearningSnapshot } from './repoLearningSnapshot';
import { WordList } from '../api/lists/model';
import { isMistakeBookList, recordMistakeWord } from './mistakeBook';

type WordDocumentLike = {
  _id: { toString(): string };
  value: string;
  ownedByLists: Array<{
    listId: { toString(): string };
    meaning?: string;
    learnedPoint?: number;
  }>;
};

export type LearnedPointResult = {
  wordId: string;
  correct: boolean;
};

export function mapWordsWithProgress(words: WordDocumentLike[], listId: string) {
  return words.map(word => {
    const context = word.ownedByLists.find(ctx => ctx.listId.toString() === listId);

    return {
      id: word._id.toString(),
      value: word.value,
      meaning: context?.meaning || '',
      learnedPoint: context?.learnedPoint || 0
    };
  });
}

export function selectWeakWords(words: WordDocumentLike[], listId: string, count = 5) {
  return mapWordsWithProgress(words, listId)
    .sort((a, b) => a.learnedPoint !== b.learnedPoint ? a.learnedPoint - b.learnedPoint : Math.random() - 0.5)
    .slice(0, count)
    .map(({ learnedPoint, ...word }) => word);
}

export async function applyLearnedPointResults(listId: string, results: LearnedPointResult[]) {
  const list = await WordList.findById(listId).lean();
  const isMistakeBook = isMistakeBookList(list);

  await Promise.all(results.map(async (result) => {
    const word = await Word.findById(result.wordId);
    if (!word) {
      return;
    }

    const context = word.ownedByLists.find(ctx => ctx.listId.toString() === listId);
    if (!context) {
      return;
    }

    const current = context.learnedPoint || 0;
    context.learnedPoint = result.correct
      ? Math.min(100, current + (isMistakeBook ? 20 : 10))
      : Math.max(0, current - (isMistakeBook ? 15 : 5));

    await word.save();

    if (!result.correct && !isMistakeBook) {
      await recordMistakeWord(listId, result.wordId);
    }
  }));

  await persistLearningSnapshot();
}
