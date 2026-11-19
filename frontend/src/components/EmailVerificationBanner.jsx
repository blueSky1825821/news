import React, { useState } from 'react';
import { api } from '../services/api.js';

export default function EmailVerificationBanner({ user }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.emailVerified) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await api.resendVerification();
      setSent(true);
    } catch (err) {
      alert(err.message || '发送失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 text-sm flex items-center justify-between">
      <span>请验证您的邮箱以使用点赞、评论等功能。</span>
      {sent ? (
        <span className="text-green-600">验证邮件已发送</span>
      ) : (
        <button
          onClick={handleResend}
          disabled={sending}
          className="underline hover:no-underline disabled:opacity-50"
        >
          {sending ? '发送中...' : '重新发送验证邮件'}
        </button>
      )}
    </div>
  );
}
