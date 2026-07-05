import React, { useState } from 'react';
import { db } from '../utils/db';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!username || !password) {
        throw new Error('Username dan password wajib diisi!');
      }
      const user = await db.login(username, password);
      onLoginSuccess(user);
      
      // Dispatch success toast
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: `Selamat datang kembali, ${user.displayName || user.display_name}!`, type: 'success' }
      }));
    } catch (err) {
      setError(err.message);
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: err.message, type: 'error' }
      }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <img src="/favicon.png" alt="ELS Logo" style={{ width: '42px', height: '42px', borderRadius: '10px', objectFit: 'cover' }} />
          <div className="sidebar-brand-name" style={{ color: 'var(--text-main)', fontSize: '24px', fontWeight: '800' }}>
            ELS Spareparts
          </div>
        </div>

        <h2 className="auth-title">Pemesanan Suku Cadang</h2>
        <p className="auth-subtitle">Login untuk mengakses katalog & manajemen order</p>

        {error && (
          <div 
            style={{ 
              backgroundColor: 'var(--status-cancelled-bg)', 
              color: 'var(--status-cancelled)', 
              padding: '12px', 
              borderRadius: 'var(--radius-sm)', 
              fontSize: '14px', 
              marginBottom: '20px',
              border: '1px solid rgba(220,38,38,0.15)',
              textAlign: 'center',
              fontWeight: 500
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              className="form-input"
              placeholder="Masukkan username Anda"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '28px' }}>
            <label className="form-label" htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              className="form-input"
              placeholder="Masukkan password Anda"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '14px' }}
            disabled={isLoading}
          >
            {isLoading ? 'Memproses...' : 'Masuk ke Dashboard'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
          <p>Lupa password? Hubungi Superadmin ELS Pusat</p>
        </div>
      </div>
    </div>
  );
}
