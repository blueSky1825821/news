import { Router } from 'express';
import { getAllSources, getSourceById, deleteSource } from '../models/source.js';
import { listHealth, reactivateSource } from '../models/sourceHealth.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const sources = getAllSources();
    res.sendJson(0, 'success', sources);
  } catch (err) {
    next(err);
  }
});

router.get('/health', (req, res, next) => {
  try {
    const data = listHealth();
    res.sendJson(0, 'success', data);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/activate', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const source = getSourceById(id);
    if (!source) {
      const err = new Error('Source not found');
      err.statusCode = 404;
      err.code = 1001;
      throw err;
    }
    reactivateSource(id);
    res.sendJson(0, 'Source activated', { id });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const source = getSourceById(id);
    if (!source) {
      const err = new Error('Source not found');
      err.statusCode = 404;
      err.code = 1001;
      throw err;
    }
    deleteSource(id);
    res.sendJson(0, 'Source deleted', { id });
  } catch (err) {
    next(err);
  }
});

export default router;
