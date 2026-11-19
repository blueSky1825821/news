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

function emailLink(page, token) {
  const url = new URL(APP_BASE_URL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('APP_BASE_URL must be a public HTTP(S) URL');
  }
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath.endsWith('/news') ? basePath : `${basePath}/news`}/${page}`;
  url.search = '';
  url.hash = '';
  url.searchParams.set('token', token);
  return url.href;
}

export async function sendVerificationEmail(to, token) {
  const url = emailLink('verify-email', token);
  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: '请验证您的邮箱 - AI新闻播报',
    text: `点击以下链接验证邮箱。链接 24 小时内有效。\n${url}`,
    html: `<p>感谢您注册 AI新闻播报！请点击以下链接验证您的邮箱：</p><p><a href="${url}">${url}</a></p><p>链接24小时内有效。</p>`,
  });
}

export async function sendPasswordResetEmail(to, token) {
  const url = emailLink('reset-password', token);
  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: '密码重置 - AI新闻播报',
    html: `<p>您申请了密码重置，请点击以下链接设置新密码：</p><p><a href="${url}">${url}</a></p><p>链接24小时内有效。如非本人操作，请忽略此邮件。</p>`,
  });
}
