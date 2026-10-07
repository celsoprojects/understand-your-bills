import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login({ mode = 'login' }) {
  const isRegister = mode === 'register';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) {
        await register(form.name, form.email, form.password);
      } else {
        await login(form.email, form.password);
      }
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-page">
      <div className="auth-card">
        <div className="logo-row">
          <div className="brand">
            <span className="brand-mark">B</span>
            BillShare
          </div>
        </div>
        <div className="card">
          <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
          <p className="muted small">
            {isRegister
              ? 'Set up a household, import a bill, and share an even split everyone can see.'
              : 'Sign in to manage your households and bills.'}
          </p>
          {error && <div className="banner bad" data-testid="auth-error">{error}</div>}
          <form onSubmit={submit}>
            {isRegister && (
              <div className="field">
                <label htmlFor="name">Your name</label>
                <input id="name" value={form.name} onChange={update('name')} placeholder="Celso R." required />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={update('email')}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={update('password')}
                placeholder="At least 8 characters"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
              />
            </div>
            <button className="btn-primary" style={{ width: '100%' }} disabled={busy} data-testid="auth-submit">
              {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <div className="divider" />
          <p className="small muted" style={{ margin: 0 }}>
            {isRegister ? (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            ) : (
              <>
                New here? <Link to="/register">Create an account</Link>
              </>
            )}
          </p>
        </div>
        <p className="tiny muted" style={{ textAlign: 'center' }}>
          BillShare splits are household agreements — not carrier charges or legal debts.
        </p>
      </div>
    </div>
  );
}
