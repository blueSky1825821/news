import { Router } from 'express';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import { createUser, findUserByEmail, findUserById, isWechatUser, updateUserPassword, setEmailVerified } from '../models/user.js';
import { getUserCategories, setUserCategories } from '../models/userCategory.js';
import { generateToken, authMiddleware, getUserRole } from '../middleware/auth.js';
import { createVerificationToken, findVerificationToken, markVerificationTokenUsed, deleteUserVerificationTokens } from '../models/emailVerification.js';
import { createPasswordResetToken, findPasswordResetToken, markPasswordResetTokenUsed } from '../models/passwordReset.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/mailer.js';
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

    try {
      const verificationToken = createVerificationToken(userId);
      await sendVerificationEmail(user.email, verificationToken);
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr.message);
    }

    const token = generateToken({ userId: user.id, email: user.email });

    res.sendJson(0, 'User registered', {
      user: {
        id: user.id,
        email: user.email,
        role: getUserRole(user),
        displayName: isWechatUser(user.id) ? '微信用户' : user.email,
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
    const { email, password, adminLogin } = req.body;

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

    if (adminLogin && getUserRole(user) !== 'admin') {
      const err = new Error('该账号没有管理员权限');
      err.statusCode = 403;
      err.code = 1011;
      throw err;
    }

    const categories = getUserCategories(user.id);
    const token = generateToken({ userId: user.id, email: user.email });

    res.sendJson(0, 'Login successful', {
      user: {
        id: user.id,
        email: user.email,
        role: getUserRole(user),
        displayName: isWechatUser(user.id) ? '微信用户' : user.email,
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
        role: getUserRole(user),
        displayName: isWechatUser(user.id) ? '微信用户' : user.email,
        categories,
        emailVerified: user.emailVerified
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      const err = new Error('Token is required');
      err.statusCode = 400;
      err.code = 1026;
      throw err;
    }
    const record = findVerificationToken(token);
    if (!record) {
      const err = new Error('Invalid or expired verification token');
      err.statusCode = 400;
      err.code = 1020;
      throw err;
    }
    setEmailVerified(record.userId);
    markVerificationTokenUsed(token);
    res.sendJson(0, 'Email verified successfully');
  } catch (err) { next(err); }
});

router.post('/resend-verification', authMiddleware, async (req, res, next) => {
  try {
    const user = findUserById(req.userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      err.code = 1010;
      throw err;
    }
    if (user.emailVerified) {
      const err = new Error('Email already verified');
      err.statusCode = 400;
      err.code = 1021;
      throw err;
    }
    deleteUserVerificationTokens(user.id);
    const token = createVerificationToken(user.id);
    await sendVerificationEmail(user.email, token);
    res.sendJson(0, 'Verification email sent');
  } catch (err) { next(err); }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (email && validateEmail(email)) {
      const normalizedEmail = validator.normalizeEmail(email);
      const user = findUserByEmail(normalizedEmail);
      if (user) {
        const token = createPasswordResetToken(user.id);
        await sendPasswordResetEmail(user.email, token);
      }
    }
    res.sendJson(0, 'If the email is registered, a reset link has been sent');
  } catch (err) { next(err); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !validatePassword(password)) {
      const err = new Error('Invalid token or password');
      err.statusCode = 400;
      err.code = 1027;
      throw err;
    }
    const record = findPasswordResetToken(token);
    if (!record) {
      const err = new Error('Invalid or expired reset token');
      err.statusCode = 400;
      err.code = 1022;
      throw err;
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    updateUserPassword(record.userId, passwordHash);
    markPasswordResetTokenUsed(token);
    res.sendJson(0, 'Password reset successfully');
  } catch (err) { next(err); }
});

router.put('/change-password', authMiddleware, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !validatePassword(newPassword)) {
      const err = new Error('Invalid password');
      err.statusCode = 400;
      err.code = 1027;
      throw err;
    }
    const user = findUserById(req.userId);
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) {
      const err = new Error('Invalid old password');
      err.statusCode = 401;
      err.code = 1009;
      throw err;
    }
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    updateUserPassword(user.id, passwordHash);
    res.sendJson(0, 'Password changed successfully');
  } catch (err) { next(err); }
});

export default router;
