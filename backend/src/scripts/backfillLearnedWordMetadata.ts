import 'dotenv/config';
import { connectDB, closeDB } from '../config/mongodb';
import { LearningState } from '../api/learning-state/model';
import { backfillDiscoveryContentForList } from '../services/fixedDiscoveryChain';
import { persistLearningSnapshot } from '../services/repoLearningSnapshot';

type LearningStatePair = {
  _id: {
    userId: string;
    listId: string;
  };
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  return {
    force: args.includes('--force')
  };
};

const run = async () => {
  const options = parseArgs();
  await connectDB(1, 100);

  try {
    const pairs = await LearningState.aggregate<LearningStatePair>([
      {
        $match: {
          reviewCount: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: {
            userId: '$userId',
            listId: '$listId'
          }
        }
      }
    ]);

    let processedPairs = 0;
    let backfilledWords = 0;

    for (const pair of pairs) {
      processedPairs += 1;
      backfilledWords += await backfillDiscoveryContentForList(
        pair._id.userId,
        pair._id.listId,
        options.force ? { force: true } : undefined
      );
    }

    await persistLearningSnapshot();

    console.log(JSON.stringify({
      processedPairs,
      backfilledWords,
      force: options.force
    }, null, 2));
  } finally {
    await closeDB();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
