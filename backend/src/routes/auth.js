import { Router } from 'express';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import { createUser, findUserByEmail, findUserById } from '../models/user.js';
import { getUserCategories, setUserCategories } from '../models/userCategory.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';
import { CATEGORY_NAMES } from '../constants/categories.js';

const router = Router();

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

function validateEmail(email) {
  return typeof email === 'string' && validator.isEmail(email);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

function validateCategories(categories) {
  if (!categories) return [];
  if (!Array.isArray(categories)) return [];
  return categories.filter((c) => CATEGORY_NAMES.includes(c));
}

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, categories } = req.body;

    if (!validateEmail(email)) {
      const err = new Error('Invalid email');
      err.statusCode = 400;
      err.code = 1005;
      throw err;
    }

    if (!validatePassword(password)) {
      const err = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      err.statusCode = 400;
      err.code = 1006;
      throw err;
    }

    const normalizedEmail = validator.normalizeEmail(email);
    const existing = findUserByEmail(normalizedEmail);
    if (existing) {
      const err = new Error('Email already registered');
      err.statusCode = 409;
      err.code = 1007;
      throw err;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = createUser({ email: normalizedEmail, passwordHash });
    const selectedCategories = validateCategories(categories);
    if (selectedCategories.length > 0) {
      setUserCategories(userId, selectedCategories);
    }

    const user = findUserById(userId);
    const token = generateToken({ userId: user.id, email: user.email });

    res.sendJson(0, 'User registered', {
      user: {
        id: user.id,
        email: user.email,
        categories: selectedCategories
      },
      token
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.statusCode = 400;
      err.code = 1008;
      throw err;
    }

    const normalizedEmail = validator.normalizeEmail(email);
    const user = findUserByEmail(normalizedEmail);
    if (!user) {
      const err = new Error('Invalid email or password');
      err.statusCode = 401;
      err.code = 1009;
      throw err;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const err = new Error('Invalid email or password');
      err.statusCode = 401;
      err.code = 1009;
      throw err;
    }

    const categories = getUserCategories(user.id);
    const token = generateToken({ userId: user.id, email: user.email });

    res.sendJson(0, 'Login successful', {
      user: {
        id: user.id,
        email: user.email,
        categories
      },
      token
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, (req, res, next) => {
  try {
    const user = findUserById(req.userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      err.code = 1010;
      throw err;
    }

    const categories = getUserCategories(user.id);
    res.sendJson(0, 'success', {
      user: {
        id: user.id,
        email: user.email,
        categories
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
