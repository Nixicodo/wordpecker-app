import fs from 'fs';
import path from 'path';
import { extractPlaceholderMeaningEnglish } from '../utils/meaningEncoding';

describe('learning snapshot meanings', () => {
  it('does not persist placeholder chinese meanings in the repo snapshot', () => {
    const snapshotPath = path.resolve(process.cwd(), 'data', 'learning-snapshot.json');
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as {
      data: {
        words: Array<{
          value: string;
          listMemberships: Array<{
            meaning: string;
          }>;
        }>;
      };
    };

    const placeholders = snapshot.data.words.flatMap((word) =>
      word.listMemberships
        .filter((membership) => Boolean(extractPlaceholderMeaningEnglish(membership.meaning)))
        .map((membership) => ({
          value: word.value,
          meaning: membership.meaning
        }))
    );

    expect(placeholders).toEqual([]);
  });
});
