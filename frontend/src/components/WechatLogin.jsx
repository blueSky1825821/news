import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function WechatLogin({ onLogin }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const pending = useRef(null);
  useEffect(() => {
    let cancelled = false;
    if (!pending.current) {
      const ticket = new URLSearchParams(window.location.hash.slice(1)).get('ticket');
      window.history.replaceState(null, '', window.location.pathname);
      pending.current = ticket ? onLogin(ticket) : Promise.reject(new Error('登录凭证缺失，请重新登录'));
    }
    pending.current.then((returnTo) => {
      if (!cancelled) navigate(returnTo || '/', { replace: true });
    }).catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [onLogin, navigate]);
  return <div className="mx-auto max-w-md rounded-lg bg-white p-6 text-center">
    {error ? <><p className="mb-4 text-red-600">{error}</p><Link to="/login" className="text-blue-600">返回登录</Link></> : <p>正在完成微信登录...</p>}
  </div>;
}
