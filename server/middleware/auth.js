import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? null
  : 'your-secret-key-change-in-production');
const JWT_EXPIRY = '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await req.db.execute({ sql: 'SELECT * FROM sessions WHERE token = ?', args: [token] });
    const session = result.rows[0] ?? null;

    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    if (new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export { JWT_SECRET, JWT_EXPIRY };
