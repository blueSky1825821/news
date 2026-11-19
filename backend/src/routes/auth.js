import { withWriteTransaction } from '../db.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import { createUser, findUserByEmail, findUserById, isWechatUser, updateUserPassword, setEmailVerified } from '../models/user.js';
import { getUserCategories, setUserCategories } from '../models/userCategory.js';
import { generateToken, authMiddleware, getUserRole } from '../middleware/auth.js';
import { createVerificationToken, findVerificationToken, markVerificationTokenUsed, deleteVerificationToken } from '../models/emailVerification.js';
import { createPasswordResetToken, findPasswordResetToken, invalidatePasswordResetTokens, resetPasswordWithToken } from '../models/passwordReset.js';
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

function getDisplayName(user) {
  if (user.displayName) return user.displayName;
  if (isWechatUser(user.id)) return '微信用户';
  return user.email;
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
        displayName: getDisplayName(user),
        categories: selectedCategories,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified
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
        displayName: getDisplayName(user),
        categories,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified
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
        displayName: getDisplayName(user),
        categories,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
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
    if (typeof token !== 'string' || !token) {
      const err = new Error('Token is required');
      err.statusCode = 400;
      err.code = 1026;
      throw err;
    }
    const verified = withWriteTransaction(() => {
      const record = findVerificationToken(token);
      if (!record) return false;

      if (!record.usedAt) {
        setEmailVerified(record.userId);
        markVerificationTokenUsed(token);
      }
      return true;
    });
    if (!verified) {
      const err = new Error('Invalid or expired verification token');
      err.statusCode = 400;
      err.code = 1020;
      throw err;
    }
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
    const token = createVerificationToken(user.id);
    try {
      await sendVerificationEmail(user.email, token);
    } catch (emailErr) {
      deleteVerificationToken(token);
      console.error('Failed to resend verification email:', emailErr.code || 'SMTP_ERROR');
      throw Object.assign(new Error('验证邮件发送失败，请稍后重试'), { statusCode: 503 });
    }
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
        try {
          await sendPasswordResetEmail(user.email, token);
        } catch (emailErr) {
          console.error('Failed to send password reset email:', emailErr.message);
        }
      }
    }
    res.sendJson(0, 'If the email is registered, a reset link has been sent');
  } catch (err) { next(err); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (typeof token !== 'string' || !token || !validatePassword(password)) {
      const err = new Error('Invalid token or password');
      err.statusCode = 400;
      err.code = 1027;
      throw err;
    }
    const resetError = () => Object.assign(new Error('Invalid or expired reset token'), {
      statusCode: 400,
      code: 1022
    });
    if (!findPasswordResetToken(token)) throw resetError();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    if (!resetPasswordWithToken(token, passwordHash)) throw resetError();
    res.sendJson(0, 'Password reset successfully');
  } catch (err) { next(err); }
});

router.put('/change-password', authMiddleware, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (typeof oldPassword !== 'string' || !oldPassword || !validatePassword(newPassword)) {
      const err = new Error('Invalid password');
      err.statusCode = 400;
      err.code = 1027;
      throw err;
    }
    const user = findUserById(req.userId);
    const valid = user && await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) {
      const err = new Error('Invalid old password');
      err.statusCode = 401;
      err.code = 1009;
      throw err;
    }
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    withWriteTransaction(() => {
      if (findUserById(user.id)?.passwordHash !== user.passwordHash) {
        throw Object.assign(new Error('Invalid old password'), { statusCode: 401, code: 1009 });
      }
      updateUserPassword(user.id, passwordHash);
      invalidatePasswordResetTokens(user.id);
    });
    res.sendJson(0, 'Password changed successfully');
  } catch (err) { next(err); }
});

export default router;
