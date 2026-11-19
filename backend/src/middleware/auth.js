import jwt from 'jsonwebtoken';
import { findUserById, isWechatUser } from '../models/user.js';

export function getUserRole(user) {
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  return user && !isWechatUser(user.id) && admins.includes(user.email.toLowerCase()) ? 'admin' : 'user';
}

export function adminMiddleware(req, res, next) {
  const user = findUserById(req.userId);
  if (getUserRole(user) !== 'admin') {
    const err = new Error('需要管理员权限');
    err.statusCode = 403;
    err.code = 1011;
    return next(err);
  }
  next();
}

export function verifiedEmailMiddleware(req, res, next) {
  const user = findUserById(req.userId);
  if (!user || !user.emailVerified) {
    const err = new Error('Please verify your email to perform this action');
    err.statusCode = 403;
    err.code = 1023;
    return next(err);
  }
  next();
}

const JWT_SECRET = process.env.JWT_SECRET || 'news-app-dev-secret-change-in-production';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('生产环境必须配置至少 32 个字符的 JWT_SECRET');
}
const JWT_EXPIRES_IN = '7d';

export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 1003;
      throw err;
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      const err = new Error('Invalid or expired token');
      err.statusCode = 401;
      err.code = 1004;
      throw err;
    }

    req.userId = decoded.userId;
    next();
  } catch (err) {
    next(err);
  }
}
