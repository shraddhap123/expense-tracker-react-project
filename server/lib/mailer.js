import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST?.trim();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER?.trim();
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM?.trim();
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
const appBaseUrl = process.env.APP_BASE_URL?.trim()
  || (process.env.NODE_ENV === 'production' ? null : `http://localhost:${process.env.PORT || 3001}`);

let transporter;

export function canSendPasswordResetEmail() {
  return Boolean(smtpHost && smtpFrom && appBaseUrl && ((smtpUser && smtpPass) || (!smtpUser && !smtpPass)));
}

function getTransporter() {
  if (!canSendPasswordResetEmail()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: smtpUser && smtpPass ? {
        user: smtpUser,
        pass: smtpPass,
      } : undefined,
    });
  }

  return transporter;
}

export function buildPasswordResetUrl(token) {
  if (!appBaseUrl) {
    return null;
  }

  const url = new URL(appBaseUrl.endsWith('/') ? appBaseUrl : `${appBaseUrl}/`);
  url.searchParams.set('resetToken', token);
  return url.toString();
}

export async function sendPasswordResetEmail({ to, displayName, resetUrl, expiresAt }) {
  const activeTransporter = getTransporter();
  if (!activeTransporter) {
    return false;
  }

  const friendlyName = displayName?.trim() || 'there';
  const expiresText = new Date(expiresAt).toLocaleString();

  await activeTransporter.sendMail({
    from: smtpFrom,
    to,
    subject: 'Reset your ExpenseIQ password',
    text: [
      `Hi ${friendlyName},`,
      '',
      'We received a request to reset your ExpenseIQ password.',
      `Open this link to choose a new password: ${resetUrl}`,
      '',
      `This link expires at ${expiresText}.`,
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <p>Hi ${friendlyName},</p>
        <p>We received a request to reset your ExpenseIQ password.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
            Reset Password
          </a>
        </p>
        <p>If the button does not open, use this link instead:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires at ${expiresText}.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });

  return true;
}
