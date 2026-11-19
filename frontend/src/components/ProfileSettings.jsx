import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../hooks/useAuth.js';
import UserSettings from './UserSettings.jsx';

function PasswordChangeForm() {
  const { changePassword } = useAuth();
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [pwMessage, setPwMessage] = useState('');

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) { setPwMessage('两次密码不一致'); return; }
    if (pwForm.newPassword.length < 8) { setPwMessage('密码至少8位'); return; }
    try {
      await changePassword(pwForm.oldPassword, pwForm.newPassword);
      setPwMessage('密码修改成功');
      setPwForm({ oldPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPwMessage(err.message);
    }
  };

  return (
    <form onSubmit={handleChangePassword} className="space-y-3">
      <input type="password" value={pwForm.oldPassword} onChange={e => setPwForm(p => ({ ...p, oldPassword: e.target.value }))} placeholder="旧密码" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <input type="password" value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} placeholder="新密码（至少8位）" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} placeholder="确认新密码" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">修改密码</button>
      {pwMessage && <p className="text-sm text-gray-600">{pwMessage}</p>}
    </form>
  );
}

export default function ProfileSettings({ user, onUpdateCategories }) {
  const { updateProfile } = useAuth();
  const [form, setForm] = useState({
    displayName: user?.displayName || '',
    bio: user?.bio || '',
    avatarUrl: user?.avatarUrl || ''
  });
  const [preview, setPreview] = useState(user?.avatarUrl || '');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    setForm({
      displayName: user?.displayName || '',
      bio: user?.bio || '',
      avatarUrl: user?.avatarUrl || ''
    });
    setPreview(user?.avatarUrl || '');
    setFile(null);
  }, [user?.id, user?.displayName, user?.bio, user?.avatarUrl]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    if (selected.size > 2 * 1024 * 1024) {
      setMessage('头像大小不能超过 2MB');
      return;
    }
    setFile(selected);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(selected);
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      let avatarUrl = form.avatarUrl;
      if (file) {
        const data = await api.uploadAvatar(file);
        avatarUrl = data.avatarUrl;
      }

      const displayName = form.displayName.trim();
      const bio = form.bio.trim();

      await updateProfile({ displayName, bio, avatarUrl });
      setForm(f => ({ ...f, avatarUrl }));
      setFile(null);
      setMessage('保存成功');
    } catch (err) {
      setMessage(err.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const displayNameLen = form.displayName.trim().length;
  const bioLen = form.bio.trim().length;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">个人信息</h2>

        {message && (
          <div className={`mb-4 rounded-md p-3 text-sm ${message.includes('成功') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700">头像</label>
            <div className="mt-2 flex items-center gap-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative h-20 w-20 cursor-pointer overflow-hidden rounded-full bg-gray-100 hover:opacity-80"
              >
                {preview ? (
                  <img src={preview} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl text-gray-400">👤</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
              >
                更换头像
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">支持 JPG、PNG、GIF、WebP，最大 2MB</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              昵称 <span className="text-xs text-gray-400">({displayNameLen}/50)</span>
            </label>
            <input
              type="text"
              value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value.slice(0, 50) }))}
              placeholder="请输入昵称"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              个人简介 <span className="text-xs text-gray-400">({bioLen}/200)</span>
            </label>
            <textarea
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value.slice(0, 200) }))}
              placeholder="介绍一下你自己"
              rows={3}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">邮箱</label>
            <input
              type="text"
              value={user?.email || ''}
              disabled
              className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </form>
      </div>

      {user && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">修改密码</h2>
            <PasswordChangeForm />
          </div>
          <UserSettings user={user} onUpdateCategories={onUpdateCategories} />
        </>
      )}
    </div>
  );
}
