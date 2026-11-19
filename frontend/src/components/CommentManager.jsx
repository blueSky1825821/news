import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';

export default function CommentManager() {
  const [comments, setComments] = useState([]);

  const fetch = async () => {
    const data = await api.getReportedComments();
    setComments(data.comments);
  };

  useEffect(() => { fetch(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('确定删除这条评论？')) return;
    await api.deleteComment(id);
    await fetch();
  };

  const handleIgnore = async (id) => {
    await api.clearCommentReports(id);
    await fetch();
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">评论管理</h2>
      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr><th className="p-2 text-left">内容</th><th className="p-2">举报数</th><th className="p-2">操作</th></tr>
        </thead>
        <tbody>
          {comments.map(c => (
            <tr key={c.id} className="border-t">
              <td className="p-2 max-w-md truncate">{c.content}</td>
              <td className="p-2 text-center">{c.reportCount}</td>
              <td className="p-2 text-center space-x-2">
                <button onClick={() => handleDelete(c.id)} className="text-red-600">删除</button>
                <button onClick={() => handleIgnore(c.id)} className="text-gray-600">忽略</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {comments.length === 0 && <p className="text-gray-500 mt-4">暂无被举报的评论</p>}
    </div>
  );
}
