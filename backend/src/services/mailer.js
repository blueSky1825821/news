import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'AI新闻播报 <noreply@example.com>';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: SMTP_USER && SMTP_PASS ? {
    user: SMTP_USER,
    pass: SMTP_PASS,
  } : undefined,
});

export async function sendVerificationEmail(to, token) {
  const url = `${APP_BASE_URL}/news/verify-email?token=${token}`;
  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: '请验证您的邮箱 - AI新闻播报',
    html: `<p>感谢您注册 AI新闻播报！请点击以下链接验证您的邮箱：</p><p><a href="${url}">${url}</a></p><p>链接24小时内有效。</p>`,
  });
}

export async function sendPasswordResetEmail(to, token) {
  const url = `${APP_BASE_URL}/news/reset-password?token=${token}`;
  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: '密码重置 - AI新闻播报',
    html: `<p>您申请了密码重置，请点击以下链接设置新密码：</p><p><a href="${url}">${url}</a></p><p>链接24小时内有效。如非本人操作，请忽略此邮件。</p>`,
  });
}
