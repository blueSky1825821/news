import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';

function CommentItem({ comment, user, onReply, onReport }) {
  const [showReply, setShowReply] = useState(false);
  const [replyContent, setReplyContent] = useState('');

  return (
    <div className="border-b py-3">
      <div className="flex justify-between text-sm text-gray-500">
        <span>{comment.user?.displayName || '未知用户'}</span>
        <span>{new Date(comment.createdAt).toLocaleString('zh-CN')}</span>
      </div>
      <p className="mt-1 text-gray-800">{comment.isDeleted ? <i>该评论已删除</i> : comment.content}</p>
      {!comment.isDeleted && (
        <div className="mt-2 flex gap-3 text-xs text-gray-500">
          <button onClick={() => setShowReply(!showReply)}>回复</button>
          {user && user.id !== comment.userId && (
            <button onClick={() => onReport(comment.id)}>举报</button>
          )}
        </div>
      )}
      {showReply && !comment.isDeleted && (
        <div className="mt-2">
          <textarea value={replyContent} onChange={e => setReplyContent(e.target.value)} className="w-full border px-2 py-1 text-sm" rows={2} placeholder="写下你的回复..." />
          <button onClick={async () => { await onReply(comment.id, replyContent); setReplyContent(''); setShowReply(false); }} className="mt-1 bg-blue-600 text-white text-xs px-3 py-1">发送</button>
        </div>
      )}
      {comment.replies?.length > 0 && (
        <div className="ml-4 mt-2 bg-gray-50 p-2 rounded space-y-2">
          {comment.replies.map(r => (
            <div key={r.id} className="text-sm">
              <span className="text-gray-500">{r.user?.displayName}：</span>
              <span>{r.isDeleted ? <i>该评论已删除</i> : r.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentSection({ articleId, user }) {
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchComments = async () => {
    const data = await api.getComments(articleId);
    setComments(data.comments);
  };

  useEffect(() => { fetchComments(); }, [articleId]);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    try {
      await api.postComment(articleId, content.trim());
      setContent('');
      await fetchComments();
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleReply = async (commentId, replyContent) => {
    if (!replyContent.trim()) return;
    await api.postReply(commentId, replyContent.trim());
    await fetchComments();
  };

  const handleReport = async (commentId) => {
    const reason = prompt('举报原因：垃圾广告 / 人身攻击 / 违法违规 / 其他');
    if (!reason) return;
    try {
      await api.reportComment(commentId, reason);
      alert('举报成功');
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="mt-8">
      <h3 className="font-bold text-lg mb-4">评论</h3>
      {user ? (
        <form onSubmit={handlePost} className="mb-6">
          <textarea value={content} onChange={e => setContent(e.target.value)} className="w-full border px-3 py-2" rows={3} placeholder="发表评论..." required />
          <button type="submit" disabled={loading} className="mt-2 bg-blue-600 text-white px-4 py-2 disabled:opacity-50">{loading ? '发送中...' : '发表'}</button>
        </form>
      ) : (
        <p className="text-gray-500 mb-6">请登录后评论</p>
      )}
      <div>
        {comments.map(c => (
          <CommentItem key={c.id} comment={c} user={user} onReply={handleReply} onReport={handleReport} />
        ))}
      </div>
    </div>
  );
}
