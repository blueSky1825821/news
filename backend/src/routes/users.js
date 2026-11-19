import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middleware/auth.js';
import { findUserById, updateUserProfile } from '../models/user.js';
import { getUserCategories } from '../models/userCategory.js';
import { getUserRole } from '../middleware/auth.js';

const router = Router();

const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `avatar-${req.userId}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

function buildUserResponse(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    role: getUserRole(user),
    categories: getUserCategories(user.id),
    emailVerified: user.emailVerified
  };
}

router.get('/profile', authMiddleware, (req, res, next) => {
  try {
    const user = findUserById(req.userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      err.code = 1010;
      throw err;
    }
    res.sendJson(0, 'success', { user: buildUserResponse(user) });
  } catch (err) { next(err); }
});

router.put('/profile', authMiddleware, (req, res, next) => {
  try {
    const { displayName, bio, avatarUrl } = req.body;
    const updates = {};

    if (displayName !== undefined) {
      const trimmed = String(displayName).trim();
      if (trimmed.length > 50) {
        const err = new Error('Display name must be at most 50 characters');
        err.statusCode = 400;
        err.code = 1030;
        throw err;
      }
      updates.displayName = trimmed || null;
    }

    if (bio !== undefined) {
      const trimmed = String(bio).trim();
      if (trimmed.length > 200) {
        const err = new Error('Bio must be at most 200 characters');
        err.statusCode = 400;
        err.code = 1031;
        throw err;
      }
      updates.bio = trimmed || null;
    }

    if (avatarUrl !== undefined) {
      updates.avatarUrl = avatarUrl || null;
    }

    updateUserProfile(req.userId, updates);
    const user = findUserById(req.userId);
    res.sendJson(0, 'success', { user: buildUserResponse(user) });
  } catch (err) { next(err); }
});

router.post('/avatar', authMiddleware, upload.single('avatar'), (req, res, next) => {
  try {
    if (!req.file) {
      const err = new Error('Avatar file is required');
      err.statusCode = 400;
      err.code = 1032;
      throw err;
    }

    const user = findUserById(req.userId);
    if (user?.avatarUrl) {
      const oldPath = path.join(process.cwd(), 'public', user.avatarUrl);
      try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    updateUserProfile(req.userId, { avatarUrl });

    res.sendJson(0, 'success', { avatarUrl });
  } catch (err) { next(err); }
});

export default router;
