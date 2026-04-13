import { WordList } from '../api/lists/model';
import { persistLearningSnapshot } from './repoLearningSnapshot';

export const DUE_REVIEW_SYSTEM_KEY = 'due-review';

const DUE_REVIEW_META = {
  name: '\u5f85\u590d\u4e60',
  description: '\u805a\u5408\u6240\u6709\u8ba1\u5212\u590d\u4e60\u65e5\u671f\u4e0d\u665a\u4e8e\u4eca\u5929\u7684\u5355\u8bcd\uff0c\u5b8c\u6210\u540e\u4f1a\u56de\u5199\u5230\u539f\u672c\u7684\u8bcd\u6811\u8fdb\u5ea6\u3002',
  context: 'Scheduled review across all word trees'
};

export const isDueReviewList = (list: { kind?: string; systemKey?: string } | null | undefined) =>
  list?.kind === 'due_review' || list?.systemKey === DUE_REVIEW_SYSTEM_KEY;

export const ensureDueReviewList = async () => {
  let list = await WordList.findOne({ systemKey: DUE_REVIEW_SYSTEM_KEY });
  if (list) {
    return list;
  }

  list = await WordList.create({
    ...DUE_REVIEW_META,
    kind: 'due_review',
    systemKey: DUE_REVIEW_SYSTEM_KEY
  });

  await persistLearningSnapshot();
  return list;
};

export const getDueReviewCutoff = (now = new Date()) => {
  const cutoff = new Date(now);
  cutoff.setHours(23, 59, 59, 999);
  return cutoff;
};
