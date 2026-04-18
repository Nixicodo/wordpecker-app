import { LearningState } from '../api/learning-state/model';
import { ReviewLog } from '../api/review-log/model';
import { Word } from '../api/words/model';
import { WordList } from '../api/lists/model';
import { MISTAKE_BOOK_SYSTEM_KEY } from './mistakeBook';

export type ResetLearningProgressResult = {
  userId: string;
  deletedLearningStates: number;
  deletedReviewLogs: number;
  removedMistakeMemberships: number;
  deletedOrphanWords: number;
};

export const resetLearningProgress = async (userId: string): Promise<ResetLearningProgressResult> => {
  const [deletedLearningStatesResult, deletedReviewLogsResult, mistakeBook] = await Promise.all([
    LearningState.deleteMany({ userId }),
    ReviewLog.deleteMany({ userId }),
    WordList.findOne({ systemKey: MISTAKE_BOOK_SYSTEM_KEY }).lean()
  ]);

  let removedMistakeMemberships = 0;
  let deletedOrphanWords = 0;

  if (mistakeBook) {
    const affectedWords = await Word.find({ 'listMemberships.listId': mistakeBook._id })
      .select('listMemberships')
      .lean();

    removedMistakeMemberships = affectedWords.reduce((count, word) => (
      count + word.listMemberships.filter((membership) => membership.listId.toString() === mistakeBook._id.toString()).length
    ), 0);

    if (removedMistakeMemberships > 0) {
      await Word.updateMany(
        { 'listMemberships.listId': mistakeBook._id },
        { $pull: { listMemberships: { listId: mistakeBook._id } } }
      );

      const deletedOrphanWordsResult = await Word.deleteMany({ listMemberships: { $size: 0 } });
      deletedOrphanWords = deletedOrphanWordsResult.deletedCount ?? 0;
    }
  }

  return {
    userId,
    deletedLearningStates: deletedLearningStatesResult.deletedCount ?? 0,
    deletedReviewLogs: deletedReviewLogsResult.deletedCount ?? 0,
    removedMistakeMemberships,
    deletedOrphanWords
  };
};
