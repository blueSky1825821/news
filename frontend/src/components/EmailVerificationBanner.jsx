import { useState } from 'react';
import { api } from '../services/api.js';

export default function EmailVerificationBanner({ user }) {
  const [status, setStatus] = useState('idle');

  if (!user || user.emailVerified) return null;

  async function resend() {
    setStatus('sending');
    try {
      await api.resendVerification();
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
      <span>请验证您的邮箱以使用点赞、评论等功能。</span>
      <button type="button" onClick={resend} disabled={status === 'sending'}
        className="underline disabled:opacity-50">
        {status === 'sending' ? '发送中…' : '重新发送验证邮件'}
      </button>
      {status === 'sent' && <p role="status" className="w-full text-green-700">验证邮件已发送，请打开邮件中的链接。</p>}
      {status === 'error' && <p role="alert" className="w-full text-red-700">验证邮件发送失败，请稍后重试。</p>}
    </div>
  );
}
