import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.qq.com',
  port: 587,
  secure: false,
  auth: {
    user: '1664637427@qq.com',
    pass: 'arhzmhenazgudije'
  },
  tls: {
    rejectUnauthorized: false
  }
});

try {
  await transporter.verify();
  console.log('SMTP verify success');
  await transporter.sendMail({
    from: 'AI新闻播报 <1664637427@qq.com>',
    to: '1664637427@qq.com',
    subject: '测试邮件',
    text: '这是一封测试邮件'
  });
  console.log('Test email sent');
} catch (err) {
  console.error('SMTP failed:', err.message);
}
