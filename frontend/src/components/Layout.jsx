import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">B</span>
          BillShare
        </Link>
        <span className="topbar-spacer" />
        {user && (
          <>
            <span className="small muted" data-testid="current-user">{user.name}</span>
            <button
              className="btn-ghost btn-sm"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              Sign out
            </button>
          </>
        )}
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
