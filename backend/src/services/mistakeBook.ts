import { WordList } from '../api/lists/model';
import { persistLearningSnapshot } from './repoLearningSnapshot';

export const MISTAKE_BOOK_SYSTEM_KEY = 'mistake-book';

const MISTAKE_BOOK_META = {
  name: '错题本',
  description: '自动收集你在其他词树里答错过的单词，作为独立复习词树持续调度。',
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
