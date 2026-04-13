import { Router } from 'express';
import { validate } from 'echt';
import { WordList, IWordList } from './model';
import { Word } from '../words/model';
import { createListSchema, listParamsSchema, updateListSchema } from './schemas';
import { persistLearningSnapshot } from '../../services/repoLearningSnapshot';
import { ensureMistakeBook, isMistakeBookList } from '../../services/mistakeBook';
import { summarizeDueReviewProgress, summarizeListProgress } from '../../services/learningScheduler';
import { resolveUserId } from '../../config/learning';
import { ensureDueReviewList, isDueReviewList } from '../../services/dueReview';

const router = Router();

const transform = (list: IWordList) => ({
  id: list._id.toString(),
  name: list.name,
  description: list.description,
  context: list.context,
  kind: list.kind,
  systemKey: list.systemKey,
  created_at: list.created_at.toISOString(),
  updated_at: list.updated_at.toISOString()
});

const buildListSummary = async (list: IWordList, userId: string) => {
  const wordCount = await Word.countDocuments({ 'listMemberships.listId': list._id });
  const progress = await summarizeListProgress(userId, list._id.toString());

  return {
    ...transform(list),
    wordCount,
    ...progress
  };
};

const buildDueReviewSummary = async (list: IWordList, userId: string) => {
  const progress = await summarizeDueReviewProgress(userId);

  return {
    ...transform(list),
    ...progress
  };
};

router.post('/', validate(createListSchema), async (req, res) => {
  try {
    const list = await WordList.create({ ...req.body, kind: 'custom' });
    await persistLearningSnapshot();
    res.status(201).json(transform(list));
  } catch (error) {
    res.status(500).json({ message: 'Error creating list' });
  }
});

router.get('/', async (req, res) => {
  try {
    const userId = resolveUserId(req.headers['user-id']);
    const lists = await WordList.find({ kind: { $nin: ['mistake_book', 'due_review'] } }).sort({ created_at: -1 });
    const data = await Promise.all(lists.map((list) => buildListSummary(list, userId)));
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching lists' });
  }
});

router.get('/due-review', async (req, res) => {
  try {
    const userId = resolveUserId(req.headers['user-id']);
    const list = await ensureDueReviewList();
    const summary = await buildDueReviewSummary(list, userId);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching due review list' });
  }
});

router.get('/mistake-book', async (req, res) => {
  try {
    const userId = resolveUserId(req.headers['user-id']);
    const list = await ensureMistakeBook();
    const summary = await buildListSummary(list, userId);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching mistake book' });
  }
});

router.get('/:id', validate(listParamsSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const list = await WordList.findById(id);
    if (!list) return res.status(404).json({ message: 'List not found' });

    res.json(transform(list));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching list' });
  }
});

router.put('/:id', validate(updateListSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const existingList = await WordList.findById(id);
    if (!existingList) return res.status(404).json({ message: 'List not found' });
    if (isMistakeBookList(existingList) || isDueReviewList(existingList)) {
      return res.status(403).json({ message: 'System review lists cannot be edited manually' });
    }

    const list = await WordList.findByIdAndUpdate(id, req.body, { new: true });
    if (!list) return res.status(404).json({ message: 'List not found' });

    await persistLearningSnapshot();
    res.json(transform(list));
  } catch (error) {
    res.status(500).json({ message: 'Error updating list' });
  }
});

router.delete('/:id', validate(listParamsSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const existingList = await WordList.findById(id);
    if (!existingList) return res.status(404).json({ message: 'List not found' });
    if (isMistakeBookList(existingList) || isDueReviewList(existingList)) {
      return res.status(403).json({ message: 'System review lists cannot be deleted' });
    }

    await Word.updateMany(
      { 'listMemberships.listId': id },
      { $pull: { listMemberships: { listId: id } } }
    );
    await Word.deleteMany({ listMemberships: { $size: 0 } });

    await WordList.findByIdAndDelete(id);

    await persistLearningSnapshot();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error deleting list' });
  }
});

export default router;
