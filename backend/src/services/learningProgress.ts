import { Word } from '../api/words/model';
import { WordList } from '../api/lists/model';
import { scheduleWordsForList, settleReviewResults, type ReviewSubmission } from './learningScheduler';

type WordDocumentLike = {
  _id: { toString(): string };
  value: string;
  listMemberships: Array<{
    listId: { toString(): string };
    meaning?: string;
  }>;
};

export function mapWordsWithProgress(words: WordDocumentLike[], listId: string) {
  return words.map((word) => {
    const membership = word.listMemberships.find((ctx) => ctx.listId.toString() === listId);

    return {
      id: word._id.toString(),
      value: word.value,
      meaning: membership?.meaning || ''
    };
  });
}

export async function selectScheduledWords(userId: string, listId: string, count = 5, poolSize?: number) {
  const [list, words] = await Promise.all([
    WordList.findById(listId).lean(),
    Word.find({ 'listMemberships.listId': listId }).lean()
  ]);

  if (!list) {
    throw new Error('List not found');
  }

  return scheduleWordsForList(userId, list, words, count, { poolSize });
}

export async function applyReviewResults(
  userId: string,
  listId: string,
  source: 'learn' | 'quiz' | 'mistake_review',
  results: ReviewSubmission[]
) {
  const list = await WordList.findById(listId).lean();
  if (!list) {
    throw new Error('List not found');
  }

  await settleReviewResults(userId, list, source, results);
}
