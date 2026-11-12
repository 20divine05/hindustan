import React, { useState } from 'react';
import {
  Calculator,
  LayoutDashboard,
  FileSpreadsheet,
  Settings,
  Database,
  UserCheck,
  ChevronDown,
  SlidersHorizontal
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { SupabaseConfigModal } from './SupabaseConfigModal';

interface NavbarProps {
  currentView: 'dashboard' | 'calculator' | 'history' | 'settings';
  onNavigate: (view: 'dashboard' | 'calculator' | 'history' | 'settings') => void;
  activeSheetName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, activeSheetName }) => {
  const { user, isSupabaseConnected, switchDemoUser } = useAuth();
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileNavMenuOpen, setIsMobileNavMenuOpen] = useState(false);

  return (
    <>
      <header
        className="no-print app-header"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-medium)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.07), 0 2px 4px -1px rgba(15, 23, 42, 0.03)'
        }}
      >
        <div
          className="header-inner"
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '0.65rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem'
          }}
        >
          {/* Logo & Brand (Desktop) / Logo & Mobile Navigation Buttons (Mobile) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <img
              src="/logo-icon-transparent.png"
              alt="Hindustan Saw Mill Logo"
              onClick={() => onNavigate('dashboard')}
              style={{
                width: '36px',
                height: '36px',
                objectFit: 'contain',
                flexShrink: 0,
                cursor: 'pointer',
                filter: 'drop-shadow(0 2px 8px rgba(79, 70, 229, 0.2))'
              }}
            />

            {/* Desktop Brand Text (Hidden in Phone View) */}
            <div
              className="brand-text-block"
              style={{ minWidth: 0, cursor: 'pointer' }}
              onClick={() => onNavigate('dashboard')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'nowrap' }}>
                <span className="brand-title" style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '0.02em', color: 'var(--text-main)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  HINDUSTAN <span style={{ color: 'var(--primary-600)', fontSize: '0.85rem', fontWeight: 700 }}>SAW MILL</span>
                </span>
                <span
                  className="brand-badge-since"
                  style={{
                    fontSize: '0.64rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
                    border: '1px solid #c7d2fe',
                    padding: '1.5px 7px',
                    borderRadius: '20px',
                    color: '#4338ca',
                    boxShadow: '0 1px 3px rgba(79, 70, 229, 0.12)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  SINCE 1971
                </span>
              </div>
              <p className="brand-subtitle" style={{ margin: 0, fontSize: '0.73rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                Wood Industries &bull; Precision CFT &amp; SQFT Calculator
              </p>
            </div>

            {/* Mobile Header Buttons (Shown only in phone view in place of title) */}
            <div className="mobile-header-buttons" style={{ display: 'none', alignItems: 'center', gap: '0.35rem' }}>
              {/* Navigation Switcher Button */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm mobile-header-btn"
                  onClick={() => {
                    setIsMobileNavMenuOpen(!isMobileNavMenuOpen);
                    setIsUserMenuOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    padding: '0.35rem 0.55rem',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-subtle, #f1f5f9)',
                    border: '1px solid var(--border-medium)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {currentView === 'dashboard' && <LayoutDashboard size={14} color="var(--primary-700)" />}
                  {currentView === 'calculator' && <Calculator size={14} color="var(--primary-700)" />}
                  {currentView === 'history' && <FileSpreadsheet size={14} color="var(--primary-700)" />}
                  {currentView === 'settings' && <Settings size={14} color="var(--primary-700)" />}
                  <span>
                    {currentView === 'dashboard' && 'Dashboard'}
                    {currentView === 'calculator' && 'Calculator'}
                    {currentView === 'history' && 'Saved'}
                    {currentView === 'settings' && 'Settings'}
                  </span>
                  <ChevronDown size={13} color="var(--text-muted)" />
                </button>

                {/* Backdrop overlay for closing nav menu */}
                {isMobileNavMenuOpen && (
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'transparent' }}
                    onClick={() => setIsMobileNavMenuOpen(false)}
                  />
                )}

                {/* Mobile Navigation Dropdown Popover */}
                {isMobileNavMenuOpen && (
                  <div
                    className="mobile-nav-dropdown-menu"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '100%',
                      marginTop: '0.45rem',
                      width: '210px',
                      backgroundColor: 'var(--bg-card, #ffffff)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '8px',
                      boxShadow: '0 16px 36px -4px rgba(15, 23, 42, 0.16), 0 6px 12px -2px rgba(15, 23, 42, 0.08)',
                      padding: '0.45rem',
                      zIndex: 200,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem'
                    }}
                  >
                    <button
                      type="button"
                      className={`btn btn-sm ${currentView === 'dashboard' ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ justifyContent: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', padding: '0.4rem 0.6rem' }}
                      onClick={() => {
                        onNavigate('dashboard');
                        setIsMobileNavMenuOpen(false);
                      }}
                    >
                      <LayoutDashboard size={16} /> Dashboard
                    </button>

                    <button
                      type="button"
                      className={`btn btn-sm ${currentView === 'calculator' ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ justifyContent: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', padding: '0.4rem 0.6rem' }}
                      onClick={() => {
                        onNavigate('calculator');
                        setIsMobileNavMenuOpen(false);
                      }}
                    >
                      <Calculator size={16} /> Calculator
                    </button>

                    <button
                      type="button"
                      className={`btn btn-sm ${currentView === 'history' ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ justifyContent: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', padding: '0.4rem 0.6rem' }}
                      onClick={() => {
                        onNavigate('history');
                        setIsMobileNavMenuOpen(false);
                      }}
                    >
                      <FileSpreadsheet size={16} /> Saved Sheets
                    </button>

                    <button
                      type="button"
                      className={`btn btn-sm ${currentView === 'settings' ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ justifyContent: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', padding: '0.4rem 0.6rem' }}
                      onClick={() => {
                        onNavigate('settings');
                        setIsMobileNavMenuOpen(false);
                      }}
                    >
                      <Settings size={16} /> Settings &amp; DB
                    </button>
                  </div>
                )}
              </div>

              {/* Actions Button (Top Only on Phone View) */}
              <button
                type="button"
                className="btn btn-primary btn-sm mobile-header-actions-btn"
                onClick={() => {
                  setIsMobileNavMenuOpen(false);
                  if (currentView !== 'calculator') {
                    onNavigate('calculator');
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('open-sheet-actions'));
                    }, 50);
                  } else {
                    window.dispatchEvent(new CustomEvent('open-sheet-actions'));
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  padding: '0.35rem 0.6rem',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap'
                }}
                title="Sheet Actions Menu: Save, Invoice, PDF, Print, CSV"
              >
                <SlidersHorizontal size={13} />
                <span>Actions</span>
              </button>
            </div>
          </div>

          {/* Desktop Navigation Links (Hidden on Mobile) */}
          <nav className="desktop-nav">
            <button
              type="button"
              className={`btn btn-sm ${currentView === 'dashboard' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => onNavigate('dashboard')}
            >
              <LayoutDashboard size={16} /> Dashboard
            </button>

            <button
              type="button"
              className={`btn btn-sm ${currentView === 'calculator' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => onNavigate('calculator')}
            >
              <Calculator size={16} />
              {activeSheetName ? (
                <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeSheetName}
                </span>
              ) : (
                'Calculator'
              )}
            </button>

            <button
              type="button"
              className={`btn btn-sm ${currentView === 'history' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => onNavigate('history')}
            >
              <FileSpreadsheet size={16} /> Saved Sheets
            </button>

            <button
              type="button"
              className={`btn btn-sm ${currentView === 'settings' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => onNavigate('settings')}
            >
              <Settings size={16} /> Settings &amp; DB
            </button>
          </nav>

          {/* Status & User Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {/* Supabase Connection Pill (Hidden on Mobile Phone View) */}
            <button
              type="button"
              onClick={() => setIsConfigModalOpen(true)}
              className={`badge ${isSupabaseConnected ? 'badge-connected' : 'badge-demo'} header-live-pill`}
              style={{
                cursor: 'pointer',
                border: 'none',
                padding: '0.35rem 0.55rem',
                fontSize: '0.72rem',
                whiteSpace: 'nowrap'
              }}
              title="Click to configure Supabase Cloud Database"
            >
              <Database size={13} />
              <span className="supabase-pill-long-text">
                {isSupabaseConnected ? 'Supabase Live' : 'Demo Mode (Offline)'}
              </span>
              <span className="supabase-pill-short-text">
                {isSupabaseConnected ? 'Live' : 'Demo'}
              </span>
            </button>

            {/* User Profile / Menu */}
            {user && (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--primary-100)',
                      color: 'var(--primary-800)',
                      border: '1px solid var(--primary-200)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700
                    }}
                  >
                    {user.fullName ? user.fullName[0].toUpperCase() : 'U'}
                  </div>
                  <span className="navbar-user-name" style={{ fontSize: '0.85rem', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.fullName || user.email.split('@')[0]}
                  </span>
                  <ChevronDown size={14} color="var(--text-muted)" />
                </button>

                {/* Backdrop overlay for closing user menu */}
                {isUserMenuOpen && (
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'transparent' }}
                    onClick={() => setIsUserMenuOpen(false)}
                  />
                )}

                {isUserMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      marginTop: '0.5rem',
                      width: '240px',
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-lg)',
                      padding: '0.75rem',
                      zIndex: 200
                    }}
                  >
                    <div style={{ paddingBottom: '0.5rem', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>
                      <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        {user.fullName}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {user.email}
                      </p>
                      <div style={{ marginTop: '0.35rem' }}>
                        <span className="badge badge-role">
                          <UserCheck size={11} /> {user.role.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {!isSupabaseConnected && switchDemoUser && (
                      <div style={{ paddingBottom: '0.5rem', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>
                        <p style={{ margin: '0 0 0.35rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-subtle)' }}>
                          Switch Demo Persona:
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ justifyContent: 'flex-start', fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                            onClick={() => {
                              switchDemoUser('user');
                              setIsUserMenuOpen(false);
                            }}
                          >
                            Sawyer / Operator (User)
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ justifyContent: 'flex-start', fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                            onClick={() => {
                              switchDemoUser('manager');
                              setIsUserMenuOpen(false);
                            }}
                          >
                            Mill Manager (Manager)
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ justifyContent: 'flex-start', fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                            onClick={() => {
                              switchDemoUser('admin');
                              setIsUserMenuOpen(false);
                            }}
                          >
                            Director (Admin)
                          </button>
                        </div>
                      </div>
                    )}

                    <div style={{ paddingTop: '0.25rem' }}>
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                          backgroundColor: 'rgba(59, 135, 94, 0.12)',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid rgba(59, 135, 94, 0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <UserCheck size={14} color="var(--primary-400)" />
                        <span>Open Access Mode: Any staff member can calculate, save, and export tally sheets.</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (Fixed for quick thumb navigation on phones) */}
      <nav className="mobile-bottom-nav no-print" aria-label="Mobile Navigation">
        <button
          type="button"
          className={`mobile-nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${currentView === 'calculator' ? 'active' : ''}`}
          onClick={() => onNavigate('calculator')}
        >
          <Calculator size={20} />
          <span>Calculator</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${currentView === 'history' ? 'active' : ''}`}
          onClick={() => onNavigate('history')}
        >
          <FileSpreadsheet size={20} />
          <span>Saved</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </nav>

      {/* Supabase Connection Setup Modal */}
      <SupabaseConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
      />
    </>
  );
};
