import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-8">
      <h2 className="text-xl font-bold mb-4">找回密码</h2>
      {submitted ? (
        <p className="text-green-600">如果该邮箱已注册，您将收到重置密码的邮件。</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="请输入邮箱" required className="w-full border px-3 py-2" />
          <button type="submit" className="w-full bg-blue-600 text-white py-2">发送重置邮件</button>
        </form>
      )}
      <p className="mt-4 text-sm"><Link to="/login" className="text-blue-600">返回登录</Link></p>
    </div>
  );
}
