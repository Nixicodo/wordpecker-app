import { Router } from 'express';
import { backgroundLibrary } from '../../services/backgroundLibrary';

const router = Router();

router.get('/random', async (req, res, next) => {
  try {
    const preferredId = typeof req.query.preferredId === 'string' ? req.query.preferredId : undefined;
    const excludeId = typeof req.query.excludeId === 'string' ? req.query.excludeId : undefined;
    const result = await backgroundLibrary.getRandom({ preferredId, excludeId });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const backgrounds = await backgroundLibrary.list();
    res.json({
      backgrounds,
      total: backgrounds.length
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deletedBackground = await backgroundLibrary.deleteById(req.params.id);
    if (!deletedBackground) {
      return res.status(404).json({ message: 'Background not found' });
    }

    return res.json({
      message: 'Background deleted successfully',
      background: deletedBackground
    });
  } catch (error) {
    next(error);
  }
});

export default router;
