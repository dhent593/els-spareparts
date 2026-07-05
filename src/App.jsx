import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import SuperadminDashboard from './components/SuperadminDashboard';
import CabangDashboard from './components/CabangDashboard';
import { db } from './utils/db';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Initialize App on first render
  useEffect(() => {

    // Check if user is already logged in (persistence)
    const savedUser = localStorage.getItem('els_current_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        db.getUsers().then((users) => {
          const exists = users.find(u => u.username === parsed.username);
          if (exists) {
            setCurrentUser(parsed);
          } else {
            localStorage.removeItem('els_current_user');
            setCurrentUser(null);
            window.dispatchEvent(new CustomEvent('show-toast', {
              detail: { message: 'Sesi Anda telah kedaluwarsa atau akun telah dihapus. Silakan login kembali.', type: 'error' }
            }));
          }
        }).catch(() => {
          // If offline or fetch failed, fallback to offline session
          setCurrentUser(parsed);
        });
      } catch {
        localStorage.removeItem('els_current_user');
      }
    }

    // Check saved theme
    const savedTheme = localStorage.getItem('els_theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.body.classList.add('dark-mode');
    }

    // Listener for Toast events
    const handleToast = (e) => {
      const { message, type } = e.detail;
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type }]);

      // Auto-remove toast after 1.5 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 1500);
    };

    window.addEventListener('show-toast', handleToast);
    return () => {
      window.removeEventListener('show-toast', handleToast);
    };
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    localStorage.setItem('els_current_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('els_current_user');
    window.dispatchEvent(new CustomEvent('show-toast', {
      detail: { message: 'Anda telah berhasil logout.', type: 'info' }
    }));
  };

  const toggleDarkMode = () => {
    const nextMode = !isDarkMode;
    setIsDarkMode(nextMode);
    if (nextMode) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('els_theme', 'dark');
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Mode gelap aktif', type: 'info' }
      }));
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('els_theme', 'light');
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Mode terang aktif', type: 'info' }
      }));
    }
  };

  return (
    <>
      {/* Floating Theme Toggle in Header/Login screen */}
      <div 
        style={{ 
          position: 'fixed', 
          top: '20px', 
          right: '20px', 
          zIndex: 10000, 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px' 
        }}
      >
        <button 
          onClick={toggleDarkMode} 
          className="theme-toggle-btn"
          title={isDarkMode ? "Ganti ke Mode Terang" : "Ganti ke Mode Gelap"}
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
            borderRadius: '50%',
            cursor: 'pointer'
          }}
        >
          {isDarkMode ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          )}
        </button>
      </div>

      {/* Main View Router */}
      {currentUser === null ? (
        <Login onLoginSuccess={handleLoginSuccess} />
      ) : currentUser.role === 'superadmin' ? (
        <SuperadminDashboard user={currentUser} onLogout={handleLogout} />
      ) : (
        <CabangDashboard user={currentUser} onLogout={handleLogout} />
      )}

      {/* Floating Toasts container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span style={{ fontSize: '18px', display: 'flex', alignItems: 'center' }}>
              {t.type === 'success' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--status-completed)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              ) : t.type === 'error' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--status-cancelled)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              )}
            </span>
            <div>{t.message}</div>
            <button 
              onClick={() => setToasts((prev) => prev.filter((toast) => toast.id !== t.id))}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: '12px',
                padding: '4px'
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
