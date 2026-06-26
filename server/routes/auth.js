import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authMiddleware, JWT_SECRET, JWT_EXPIRY } from '../middleware/auth.js';
import { buildPasswordResetUrl, canSendPasswordResetEmail, sendPasswordResetEmail } from '../lib/mailer.js';
import { normalizeCurrencyCode } from '../lib/currency.js';

const router = express.Router();
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

function mapUserRow(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    createdAt: user.created_at,
    preferredCurrency: user.preferred_currency || 'USD',
  };
}

function createPasswordResetToken() {
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body;
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedDisplayName = displayName?.trim();

  if (!normalizedEmail || !password || !normalizedDisplayName) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (password.length < 8)          return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!/[A-Z]/.test(password))      return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
  if (!/[a-z]/.test(password))      return res.status(400).json({ error: 'Password must contain at least one lowercase letter' });
  if (!/[0-9]/.test(password))      return res.status(400).json({ error: 'Password must contain at least one number' });
  if (!/[^A-Za-z0-9]/.test(password)) return res.status(400).json({ error: 'Password must contain at least one special character (!@#$ etc)' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    const existing = (await req.db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [normalizedEmail] })).rows[0] ?? null;
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const insertResult = await req.db.execute({
      sql: 'INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
      args: [normalizedEmail, passwordHash, normalizedDisplayName, 'viewer'],
    });
    const newUserId = Number(insertResult.lastInsertRowid);

    const token = jwt.sign({ userId: newUserId, email: normalizedEmail }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await req.db.execute({ sql: 'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', args: [newUserId, token, expiresAt] });

    res.status(201).json({
      user: { id: newUserId, email: normalizedEmail, displayName: normalizedDisplayName, createdAt: new Date().toISOString(), preferredCurrency: 'USD' },
      token,
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const normalizedEmail = req.body.email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const user = (await req.db.execute({ sql: 'SELECT id, email, display_name FROM users WHERE email = ?', args: [normalizedEmail] })).rows[0] ?? null;

    if (!user) {
      return res.json({ ok: true, message: 'If that email is registered, a password reset link has been prepared.' });
    }

    const { token, tokenHash } = createPasswordResetToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS).toISOString();
    const resetUrl = buildPasswordResetUrl(token);

    await req.db.batch([
      { sql: 'DELETE FROM password_reset_tokens WHERE user_id = ?', args: [user.id] },
      { sql: 'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', args: [user.id, tokenHash, expiresAt] },
    ], 'write');

    const payload = { ok: true, message: 'If that email is registered, a password reset link has been prepared.' };

    if (canSendPasswordResetEmail() && resetUrl) {
      await sendPasswordResetEmail({ to: user.email, displayName: user.display_name, resetUrl, expiresAt });
      console.log(`📨 Password reset email sent to ${user.email}`);
      return res.json(payload);
    }

    if (process.env.NODE_ENV === 'production') {
      console.error('Password reset requested, but email delivery is not configured.');
      return res.status(503).json({ error: 'Password reset email is not configured yet' });
    }

    console.log(`🔑 Password reset token for ${user.email}: ${token}`);
    return res.json({ ...payload, previewToken: token, expiresAt, resetUrl });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Could not start password reset' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const token = req.body.token?.trim();
  const newPassword = req.body.newPassword;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetRow = (await req.db.execute({ sql: 'SELECT * FROM password_reset_tokens WHERE token_hash = ?', args: [tokenHash] })).rows[0] ?? null;

    if (!resetRow || new Date(resetRow.expires_at) < new Date()) {
      if (resetRow) {
        await req.db.execute({ sql: 'DELETE FROM password_reset_tokens WHERE id = ?', args: [resetRow.id] });
      }
      return res.status(400).json({ error: 'Reset token is invalid or has expired' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await req.db.batch([
      { sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", args: [passwordHash, resetRow.user_id] },
      { sql: 'DELETE FROM sessions WHERE user_id = ?', args: [resetRow.user_id] },
      { sql: 'DELETE FROM password_reset_tokens WHERE user_id = ?', args: [resetRow.user_id] },
    ], 'write');

    res.json({ ok: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const user = (await req.db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [normalizedEmail] })).rows[0] ?? null;
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await req.db.execute({ sql: 'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', args: [user.id, token, expiresAt] });

    res.json({ user: mapUserRow(user), token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res) => {
  const token = req.headers.authorization.substring(7);
  await req.db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const user = (await req.db.execute({ sql: 'SELECT id, email, display_name, created_at, preferred_currency FROM users WHERE id = ?', args: [req.user.id] })).rows[0] ?? null;
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(mapUserRow(user));
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  const { displayName, currentPassword, newPassword, preferredCurrency } = req.body;
  const normalizedDisplayName = displayName?.trim();
  const normalizedCurrency = preferredCurrency ? normalizeCurrencyCode(preferredCurrency) : null;

  try {
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required' });
      }
      const user = (await req.db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.user.id] })).rows[0];
      const valid = bcrypt.compareSync(currentPassword, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password incorrect' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const newHash = bcrypt.hashSync(newPassword, 10);
      await req.db.execute({ sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", args: [newHash, req.user.id] });
    }

    if (normalizedDisplayName) {
      await req.db.execute({ sql: "UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?", args: [normalizedDisplayName, req.user.id] });
    }
    if (normalizedCurrency) {
      await req.db.execute({ sql: "UPDATE users SET preferred_currency = ?, updated_at = datetime('now') WHERE id = ?", args: [normalizedCurrency, req.user.id] });
    }

    const updated = (await req.db.execute({ sql: 'SELECT id, email, display_name, created_at, preferred_currency FROM users WHERE id = ?', args: [req.user.id] })).rows[0];
    res.json(mapUserRow(updated));
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

export default router;
