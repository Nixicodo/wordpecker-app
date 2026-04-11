import mongoose from 'mongoose';
import { Word } from '../api/words/model';
import { LearningState } from '../api/learning-state/model';
import { DEFAULT_USER_ID } from '../config/learning';
import { seedLearningStateFromLegacyPoint } from './learningScheduler';
import { persistLearningSnapshot } from './repoLearningSnapshot';

const hasLegacyWordStructure = async () => {
  const legacyCount = await Word.countDocuments({
    ownedByLists: { $exists: true, $ne: [] }
  });

  return legacyCount > 0;
};

export const migrateLegacyLearningDataIfNeeded = async () => {
  const needsMigration = await hasLegacyWordStructure();
  if (!needsMigration) {
    return false;
  }

  const words = await Word.find({
    ownedByLists: { $exists: true, $ne: [] }
  });

  for (const word of words) {
    if (!word.listMemberships || word.listMemberships.length === 0) {
      word.listMemberships = (word.ownedByLists || []).map((legacyContext) => ({
        listId: legacyContext.listId,
        meaning: legacyContext.meaning,
        sourceListIds: legacyContext.sourceListIds,
        addedAt: word.created_at,
        updatedAt: word.updated_at
      }));
    }

    for (const legacyContext of word.ownedByLists || []) {
      await seedLearningStateFromLegacyPoint(
        DEFAULT_USER_ID,
        word._id as mongoose.Types.ObjectId,
        legacyContext.listId,
        legacyContext.learnedPoint || 0
      );
    }

    word.ownedByLists = undefined;
    await word.save();
  }

  const duplicateStates = await LearningState.aggregate([
    {
      $group: {
        _id: {
          userId: '$userId',
          wordId: '$wordId',
          listId: '$listId'
        },
        ids: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    }
  ]);

  for (const duplicate of duplicateStates) {
    const [keep, ...remove] = duplicate.ids;
    if (remove.length > 0) {
      await LearningState.deleteMany({ _id: { $in: remove } });
    }
    await LearningState.updateOne({ _id: keep }, { $set: { updatedAt: new Date() } });
  }

  await persistLearningSnapshot();
  return true;
};
