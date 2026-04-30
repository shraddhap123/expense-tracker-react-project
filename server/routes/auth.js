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
router.post('/register', (req, res) => {
  const { email, password, displayName } = req.body;
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedDisplayName = displayName?.trim();

  if (!normalizedEmail || !password || !normalizedDisplayName) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    const existing = req.db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = req.db.prepare(
      'INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
    ).run(normalizedEmail, passwordHash, normalizedDisplayName, 'viewer');

    const token = jwt.sign({ userId: result.lastInsertRowid, email: normalizedEmail }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    req.db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(result.lastInsertRowid, token, expiresAt);

    res.status(201).json({
      user: { id: result.lastInsertRowid, email: normalizedEmail, displayName: normalizedDisplayName, createdAt: new Date().toISOString(), preferredCurrency: 'USD' },
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
    const user = req.db.prepare('SELECT id, email, display_name FROM users WHERE email = ?').get(normalizedEmail);

    if (!user) {
      return res.json({
        ok: true,
        message: 'If that email is registered, a password reset link has been prepared.',
      });
    }

    const { token, tokenHash } = createPasswordResetToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS).toISOString();
    const resetUrl = buildPasswordResetUrl(token);

    req.db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
    req.db.prepare(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
    ).run(user.id, tokenHash, expiresAt);

    const payload = {
      ok: true,
      message: 'If that email is registered, a password reset link has been prepared.',
    };

    if (canSendPasswordResetEmail() && resetUrl) {
      await sendPasswordResetEmail({
        to: user.email,
        displayName: user.display_name,
        resetUrl,
        expiresAt,
      });
      console.log(`📨 Password reset email sent to ${user.email}`);

      return res.json(payload);
    }

    if (process.env.NODE_ENV === 'production') {
      console.error('Password reset requested, but email delivery is not configured. Set APP_BASE_URL and SMTP_* variables.');
      return res.status(503).json({ error: 'Password reset email is not configured yet' });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔑 Password reset token for ${user.email}: ${token}`);
      return res.json({
        ...payload,
        previewToken: token,
        expiresAt,
        resetUrl,
      });
    }

    res.json(payload);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Could not start password reset' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', (req, res) => {
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
    const resetRow = req.db.prepare(
      'SELECT * FROM password_reset_tokens WHERE token_hash = ?'
    ).get(tokenHash);

    if (!resetRow || new Date(resetRow.expires_at) < new Date()) {
      if (resetRow) {
        req.db.prepare('DELETE FROM password_reset_tokens WHERE id = ?').run(resetRow.id);
      }
      return res.status(400).json({ error: 'Reset token is invalid or has expired' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);

    req.db.transaction(() => {
      req.db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
        .run(passwordHash, resetRow.user_id);
      req.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(resetRow.user_id);
      req.db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(resetRow.user_id);
    })();

    res.json({ ok: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const user = req.db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    req.db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

    res.json({
      user: mapUserRow(user),
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization.substring(7);
  req.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = req.db.prepare('SELECT id, email, display_name, created_at, preferred_currency FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(mapUserRow(user));
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, (req, res) => {
  const { displayName, currentPassword, newPassword, preferredCurrency } = req.body;
  const normalizedDisplayName = displayName?.trim();
  const normalizedCurrency = preferredCurrency ? normalizeCurrencyCode(preferredCurrency) : null;

  try {
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required' });
      }
      const user = req.db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      const valid = bcrypt.compareSync(currentPassword, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password incorrect' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const newHash = bcrypt.hashSync(newPassword, 10);
      req.db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, req.user.id);
    }

    if (normalizedDisplayName) {
      req.db.prepare("UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?").run(normalizedDisplayName, req.user.id);
    }
    if (normalizedCurrency) {
      req.db.prepare("UPDATE users SET preferred_currency = ?, updated_at = datetime('now') WHERE id = ?").run(normalizedCurrency, req.user.id);
    }

    const updated = req.db.prepare('SELECT id, email, display_name, created_at, preferred_currency FROM users WHERE id = ?').get(req.user.id);
    res.json(mapUserRow(updated));
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

export default router;
