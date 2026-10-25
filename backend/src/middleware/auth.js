import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'news-app-dev-secret-change-in-production';
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
