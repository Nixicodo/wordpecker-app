import { Router, Request, Response } from 'express';
import { validate } from 'echt';
import { WordList, IWordList } from './model';
import { Word } from '../words/model';
import { createListSchema, listParamsSchema, updateListSchema } from './schemas';
import { persistLearningSnapshot } from '../../services/repoLearningSnapshot';
import { ensureMistakeBook, isMistakeBookList } from '../../services/mistakeBook';

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

const buildListSummary = async (list: IWordList) => {
  const words = await Word.find({ 'ownedByLists.listId': list._id }).lean();
  const contexts = words.map(w => w.ownedByLists.find(c => c.listId.toString() === list._id.toString()));
  const progress = contexts.map(c => c?.learnedPoint || 0);

  return {
    ...transform(list),
    wordCount: words.length,
    averageProgress: words.length ? Math.round(progress.reduce((a, b) => a + b, 0) / words.length) : 0,
    masteredWords: progress.filter(p => p >= 80).length
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
    const lists = await WordList.find({ kind: { $ne: 'mistake_book' } }).sort({ created_at: -1 });
    const data = await Promise.all(lists.map(buildListSummary));
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching lists' });
  }
});

router.get('/mistake-book', async (_req, res) => {
  try {
    const list = await ensureMistakeBook();
    const summary = await buildListSummary(list);
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
    if (isMistakeBookList(existingList)) {
      return res.status(403).json({ message: 'Mistake book cannot be edited manually' });
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
    if (isMistakeBookList(existingList)) {
      return res.status(403).json({ message: 'Mistake book cannot be deleted' });
    }
    
    await Word.updateMany({ 'ownedByLists.listId': id }, { $pull: { ownedByLists: { listId: id } } });
    await Word.deleteMany({ ownedByLists: { $size: 0 } });

    await WordList.findByIdAndDelete(id);
    
    await persistLearningSnapshot();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error deleting list' });
  }
});

export default router; 
