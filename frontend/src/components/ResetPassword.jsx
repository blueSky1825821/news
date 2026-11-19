import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { alert('两次密码不一致'); return; }
    if (password.length < 8) { alert('密码至少8位'); return; }
    try {
      await api.resetPassword(searchParams.get('token'), password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-8">
      <h2 className="text-xl font-bold mb-4">重置密码</h2>
      {done ? (
        <p className="text-green-600">密码重置成功，即将跳转到登录页...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="新密码（至少8位）" required className="w-full border px-3 py-2" />
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="确认新密码" required className="w-full border px-3 py-2" />
          <button type="submit" className="w-full bg-blue-600 text-white py-2">重置密码</button>
        </form>
      )}
    </div>
  );
}
