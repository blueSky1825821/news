import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';

export default function VerifyEmail({ onVerified }) {
  const [params, setParams] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('pending');
  const [attempt, setAttempt] = useState(0);
  const request = useRef(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    if (request.current?.token !== token || request.current.attempt !== attempt) {
      request.current = { token, attempt, promise: api.verifyEmail(token) };
    }

    request.current.promise.then(async () => {
      if (!active) return;
      await onVerified().catch(() => {});
      if (!active) return;
      setStatus('verified');
      setParams({}, { replace: true });
    }).catch(err => {
      if (active) setStatus(err.code === 1020 || err.code === 1026 ? 'invalid' : 'error');
    });

    return () => { active = false; };
  }, [token, attempt, onVerified, setParams]);

  return (
    <section className="mx-auto max-w-md space-y-4 rounded-lg border bg-white p-6">
      <h1 className="text-xl font-semibold">验证邮箱</h1>
      {status === 'verified' ? (
        <p role="status">邮箱已验证。<Link to="/" className="underline">返回首页</Link></p>
      ) : !token || status === 'invalid' ? (
        <p role="alert">验证链接无效或已过期。<Link to="/login" className="underline">登录后可重新发送。</Link></p>
      ) : status === 'error' ? (
        <>
          <p role="alert">验证暂时失败。</p>
          <button type="button" className="news-primary" onClick={() => {
            setStatus('pending');
            setAttempt(value => value + 1);
          }}>重试验证</button>
        </>
      ) : (
        <p role="status">正在验证邮箱…</p>
      )}
    </section>
  );
}
