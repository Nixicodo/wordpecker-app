import 'dotenv/config';
import { connectDB, closeDB } from '../config/mongodb';
import { WordList } from '../api/lists/model';
import {
  buildFixedDiscoveryChain,
  refreshDiscoveryContentForList
} from '../services/fixedDiscoveryChain';
import { persistLearningSnapshot } from '../services/repoLearningSnapshot';

const run = async () => {
  await connectDB(1, 100);

  try {
    const chain = buildFixedDiscoveryChain();
    const lists = await WordList.find({ name: { $in: chain } })
      .select('_id name')
      .lean();

    const listByName = new Map(lists.map((list) => [list.name, list]));
    let processedLists = 0;
    let refreshedWords = 0;

    for (const name of chain) {
      const list = listByName.get(name);
      if (!list) {
        continue;
      }

      processedLists += 1;
      refreshedWords += await refreshDiscoveryContentForList(list._id.toString(), { force: true });
    }

    await persistLearningSnapshot();

    console.log(JSON.stringify({
      processedLists,
      refreshedWords
    }, null, 2));
  } finally {
    await closeDB();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
