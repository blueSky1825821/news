import { useEffect, useState } from 'react';
import CategorySelector from './CategorySelector.jsx';
import { api } from '../services/api.js';

export default function UserSettings({ user, onUpdateCategories }) {
  const [categories, setCategories] = useState(user?.categories || []);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getCategories()
      .then((data) => setCategoryOptions(data.categories))
      .catch((err) => console.error('Failed to load categories:', err));
  }, []);

  useEffect(() => {
    setCategories(user?.categories || []);
  }, [user?.categories]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      await onUpdateCategories(categories);
      setMessage('兴趣分类已更新');
    } catch (err) {
      setMessage(err.message || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">兴趣分类</h2>
      <p className="mb-4 text-sm text-gray-600">选择你感兴趣的新闻分类，我们将据此为你推荐内容。</p>

      {message && (
        <div
          className={`mb-4 rounded-md p-3 text-sm ${
            message.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
          }`}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <CategorySelector
          options={categoryOptions}
          value={categories}
          onChange={setCategories}
          disabled={loading}
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '保存中...' : '保存'}
        </button>
      </form>
    </div>
  );
}
