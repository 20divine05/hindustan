import React, { useState } from 'react';
import {
  Lock,
  Mail,
  User,
  Building,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Database,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const AuthPage: React.FC = () => {
  const { signIn, signUp, resetPassword, isSupabaseConnected } = useAuth();

  const [tab, setTab] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('TimberCraft Wood Industries');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (tab === 'signin') {
        const result = await signIn(email, password);
        if (result.error) {
          setError(result.error);
        }
      } else if (tab === 'signup') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }
        const result = await signUp(email, password, fullName, companyName);
        if (result.error) {
          setError(result.error);
        } else if (result.message) {
          setSuccessMessage(result.message);
        }
      } else if (tab === 'forgot') {
        const result = await resetPassword(email);
        if (result.error) {
          setError(result.error);
        } else if (result.message) {
          setSuccessMessage(result.message);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected authentication error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        background: 'radial-gradient(ellipse at top, #f0e6d6 0%, #dfd0bb 100%)'
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '2.25rem',
          backgroundColor: 'var(--bg-card)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-medium)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/logo.png"
            alt="Hindustan Saw Mill & Wood Industries"
            style={{
              maxWidth: '320px',
              width: '100%',
              height: 'auto',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-sm)',
              marginBottom: '1rem',
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-light)',
              padding: '8px 12px'
            }}
          />
          <h1 style={{ fontSize: '1.35rem', margin: 0, color: 'var(--text-main)', fontWeight: 800, textTransform: 'uppercase' }}>
            HINDUSTAN <span style={{ color: 'var(--primary-600)' }}>SAW MILL</span>
          </h1>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Wood Industries &bull; Since 1971 &bull; CFT &amp; SQFT Calculator
          </p>

          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center' }}>
            <span className={`badge ${isSupabaseConnected ? 'badge-connected' : 'badge-demo'}`}>
              <Database size={12} />
              {isSupabaseConnected ? 'Supabase Auth & Database' : 'Demo Mode (Offline Enabled)'}
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px',
            marginBottom: '1.5rem',
            border: '1px solid var(--border-light)'
          }}
        >
          <button
            type="button"
            className="btn btn-sm"
            style={{
              flex: 1,
              backgroundColor: tab === 'signin' ? 'var(--primary-700)' : 'transparent',
              color: tab === 'signin' ? '#ffffff' : 'var(--text-muted)',
              borderRadius: '4px',
              border: 'none',
              padding: '0.45rem'
            }}
            onClick={() => {
              setTab('signin');
              setError(null);
              setSuccessMessage(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              flex: 1,
              backgroundColor: tab === 'signup' ? 'var(--primary-700)' : 'transparent',
              color: tab === 'signup' ? '#ffffff' : 'var(--text-muted)',
              borderRadius: '4px',
              border: 'none',
              padding: '0.45rem'
            }}
            onClick={() => {
              setTab('signup');
              setError(null);
              setSuccessMessage(null);
            }}
          >
            Register
          </button>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: 'var(--danger-400)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.25rem'
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(59, 135, 94, 0.15)',
              border: '1px solid rgba(59, 135, 94, 0.35)',
              color: 'var(--primary-400)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.25rem'
            }}
          >
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tab === 'signup' && (
            <>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  <User size={13} /> Full Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. David Miller"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  <Building size={13} /> Company / Sawmill Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. TimberCraft Wood Ltd"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              <Mail size={13} /> Email Address:
            </label>
            <input
              type="email"
              placeholder="sawyer@timbermill.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {tab !== 'forgot' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  <Lock size={13} /> Password:
                </label>
                {tab === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab('forgot');
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--primary-400)', fontSize: '0.78rem', cursor: 'pointer' }}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <input
                type="password"
                placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          {tab === 'signup' && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                <Lock size={13} /> Confirm Password:
              </label>
              <input
                type="password"
                placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}
          >
            {loading ? (
              'Processing...'
            ) : tab === 'signin' ? (
              <>
                Sign In to TimberPro <ArrowRight size={16} />
              </>
            ) : tab === 'signup' ? (
              <>
                Create Account <ArrowRight size={16} />
              </>
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>

        {tab === 'forgot' && (
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setTab('signin')}
            >
              Back to Sign In
            </button>
          </div>
        )}

        {/* Quick Demo Credentials Fill (Instant Evaluation) */}
        <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '1.75rem', paddingTop: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--amber-400)', marginBottom: '0.65rem' }}>
            <Sparkles size={14} /> Quick Demo Logins:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.5rem' }}
              onClick={() => handleQuickDemo('operator@timbermill.com', 'password123')}
            >
              Sawyer (User)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.5rem' }}
              onClick={() => handleQuickDemo('manager@timbermill.com', 'password123')}
            >
              Manager (Admin)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
