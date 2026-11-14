import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useNavigate, Link } from 'react-router-dom';

export default function LoginForm({ onLogin }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adminLogin, setAdminLogin] = useState(false);
  const [wechatEnabled, setWechatEnabled] = useState(false);
  useEffect(() => {
    api.getWechatLoginStatus().then((data) => setWechatEnabled(data.enabled)).catch(() => {});
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onLogin({ email: form.email.trim(), password: form.password, adminLogin });
      navigate(adminLogin ? '/sources' : '/');
    } catch (err) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-12 max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">{adminLogin ? '管理员登录' : '用户登录'}</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={adminLogin} onChange={(e) => setAdminLogin(e.target.checked)} />
          管理员登录（管理 RSS 新闻来源）
        </label>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">邮箱</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={form.email}
            onChange={handleChange}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">密码</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={handleChange}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600">
        还没有账号？<Link to="/register" className="text-blue-600 hover:underline">立即注册</Link>
      </p>
      {!adminLogin && <div className="mt-6 border-t pt-4 text-center">
        {wechatEnabled ? <><a href="/news/api/wechat/auth/start" className="block rounded-md bg-green-600 px-4 py-2 text-sm text-white">微信一键登录</a><p className="mt-2 text-xs text-gray-500">请在微信中打开，使用公众号网页授权登录。</p></> : <p className="text-sm text-gray-500">当前未开放微信授权登录，可使用邮箱登录或直接浏览新闻。</p>}
      </div>}
    </div>
  );
}
