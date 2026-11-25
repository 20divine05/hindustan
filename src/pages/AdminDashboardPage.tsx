import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck,
  Users,
  CheckCircle2,
  Clock,
  Ban,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  Check,
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Laptop,
  Smartphone,
  Tablet,
  Globe,
  Radio
} from 'lucide-react';
import type { AppVisitor, VisitorStatus } from '../types';
import { visitorService } from '../services/visitorService';

const ADMIN_AUTH_KEY = 'hs_admin_auth_token';
const DEFAULT_ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'hindustan@1971';

interface AdminDashboardPageProps {
  onBackToApp: () => void;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ onBackToApp }) => {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Visitors State
  const [visitors, setVisitors] = useState<AppVisitor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | VisitorStatus>('all');

  // Whitelist IP Form
  const [whitelistIp, setWhitelistIp] = useState('');
  const [whitelistLabel, setWhitelistLabel] = useState('');
  const [whitelistSuccess, setWhitelistSuccess] = useState<string | null>(null);

  // Inline editing state for visitor label
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabelText, setEditLabelText] = useState('');

  // Fetch visitors list
  const loadVisitors = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await visitorService.getAllVisitors();
      setVisitors(data);
    } catch (err) {
      console.error('Failed to load visitors:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadVisitors();
      // Optional polling every 15 seconds for live dashboard updates
      const interval = setInterval(loadVisitors, 15000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, loadVisitors]);

  // Handle Login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === DEFAULT_ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
      setIsAuthenticated(true);
      setLoginError(null);
    } else {
      setLoginError('Invalid Administrator Password. Please check and try again.');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    setIsAuthenticated(false);
    setPasswordInput('');
  };

  // Actions
  const handleStatusChange = async (visitor: AppVisitor, newStatus: VisitorStatus) => {
    const success = await visitorService.updateVisitorStatus(visitor.id, newStatus);
    if (success) {
      setVisitors(prev => prev.map(v => v.id === visitor.id ? { ...v, status: newStatus } : v));
    }
  };

  const handleDelete = async (visitorId: string) => {
    if (window.confirm('Are you sure you want to delete this visitor record?')) {
      const success = await visitorService.deleteVisitor(visitorId);
      if (success) {
        setVisitors(prev => prev.filter(v => v.id !== visitorId));
      }
    }
  };

  const handleStartEditLabel = (visitor: AppVisitor) => {
    setEditingId(visitor.id);
    setEditLabelText(visitor.label || '');
  };

  const handleSaveLabel = async (visitorId: string) => {
    await visitorService.updateVisitorLabel(visitorId, editLabelText);
    setVisitors(prev => prev.map(v => v.id === visitorId ? { ...v, label: editLabelText } : v));
    setEditingId(null);
  };

  const handleWhitelistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whitelistIp || !whitelistIp.trim()) return;
    try {
      const newVisitor = await visitorService.whitelistIpAddress(whitelistIp.trim(), whitelistLabel.trim());
      setVisitors(prev => [newVisitor, ...prev.filter(v => v.ipAddress !== whitelistIp.trim())]);
      setWhitelistSuccess(`IP ${whitelistIp} has been pre-approved!`);
      setWhitelistIp('');
      setWhitelistLabel('');
      setTimeout(() => setWhitelistSuccess(null), 3000);
    } catch (err) {
      console.error('Whitelist error:', err);
    }
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = visitors.length;
    const approved = visitors.filter(v => v.status === 'approved').length;
    const pending = visitors.filter(v => v.status === 'pending').length;
    const blocked = visitors.filter(v => v.status === 'blocked').length;
    return { total, approved, pending, blocked };
  }, [visitors]);

  // Filtered visitors
  const filteredVisitors = useMemo(() => {
    return visitors.filter(v => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesIp = (v.ipAddress || '').toLowerCase().includes(query);
        const matchesDevice = (v.deviceId || '').toLowerCase().includes(query);
        const matchesLabel = (v.label || '').toLowerCase().includes(query);
        const matchesCity = (v.city || '').toLowerCase().includes(query);
        const matchesIsp = (v.isp || '').toLowerCase().includes(query);
        const matchesBrowser = (v.browser || '').toLowerCase().includes(query);
        return matchesIp || matchesDevice || matchesLabel || matchesCity || matchesIsp || matchesBrowser;
      }
      return true;
    });
  }, [visitors, statusFilter, searchQuery]);

  // Format relative timestamp
  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHr = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHr / 24);

      if (diffSec < 60) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHr < 24) return `${diffHr}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  // -------------------------------------------------------------------------
  // 1. LOGIN GATE SCREEN
  // -------------------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1.25rem',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <div style={{
          maxWidth: '420px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          padding: '2rem 1.75rem',
          textAlign: 'center'
        }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '12px',
            backgroundColor: '#1e3a8a',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem'
          }}>
            <Lock size={26} />
          </div>

          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.25rem' }}>
            Hindustan Administrator
          </h2>
          <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 1.5rem' }}>
            Visitor Access Control &amp; Device Approvals
          </p>

          <form onSubmit={handleLogin}>
            <div style={{ position: 'relative', textAlign: 'left', marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Master Admin Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter admin password"
                required
                autoFocus
                style={{
                  width: '100%',
                  padding: '0.75rem 2.5rem 0.75rem 0.85rem',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  bottom: '10px',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer'
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {loginError && (
              <div style={{
                marginBottom: '1rem',
                padding: '0.55rem',
                borderRadius: '6px',
                backgroundColor: '#fef2f2',
                color: '#b91c1c',
                fontSize: '0.82rem',
                fontWeight: 600
              }}>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '0.85rem',
                borderRadius: '8px',
                backgroundColor: '#1e3a8a',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.95rem',
                border: 'none',
                cursor: 'pointer',
                marginBottom: '1rem'
              }}
            >
              Sign In to Dashboard
            </button>
          </form>

          <button
            type="button"
            onClick={onBackToApp}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <ArrowLeft size={14} /> Back to Calculator
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // 2. AUTHENTICATED ADMIN DASHBOARD
  // -------------------------------------------------------------------------
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#0f172a'
    }}>
      {/* Top Navbar */}
      <header style={{
        backgroundColor: '#0f172a',
        color: '#ffffff',
        padding: '0.85rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        borderBottom: '1px solid #1e293b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onBackToApp}
            style={{
              backgroundColor: '#1e293b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.45rem 0.75rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <ArrowLeft size={15} /> <span>App</span>
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <ShieldCheck size={20} color="#22c55e" /> Visitor Access Control
            </h1>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
              Hindustan Saw Mill &bull; Device Authorization Center
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={loadVisitors}
            disabled={isLoading}
            style={{
              backgroundColor: '#1e293b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.45rem 0.75rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              backgroundColor: '#b91c1c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.45rem 0.75rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <LogOut size={14} /> <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        {/* Summary Stat Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          {/* Total Visitors */}
          <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 700, textTransform: 'uppercase' }}>Total Visitors</span>
              <Users size={18} color="#0f172a" />
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#0f172a' }}>{stats.total}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>All logged devices &amp; IPs</div>
          </div>

          {/* Approved */}
          <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1.5px solid #86efac', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#16a34a', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 700, textTransform: 'uppercase' }}>Approved</span>
              <CheckCircle2 size={18} color="#16a34a" />
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#15803d' }}>{stats.approved}</div>
            <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.2rem' }}>Full access to calculator</div>
          </div>

          {/* Pending Approval */}
          <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1.5px solid #fde047', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ca8a04', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 700, textTransform: 'uppercase' }}>Pending Approval</span>
              <Clock size={18} color="#ca8a04" />
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#a16207' }}>{stats.pending}</div>
            <div style={{ fontSize: '0.75rem', color: '#a16207', marginTop: '0.2rem' }}>Waiting for authorization</div>
          </div>

          {/* Blocked */}
          <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1.5px solid #fca5a5', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#dc2626', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 700, textTransform: 'uppercase' }}>Blocked</span>
              <Ban size={18} color="#dc2626" />
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#b91c1c' }}>{stats.blocked}</div>
            <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '0.2rem' }}>Locked out devices</div>
          </div>
        </div>

        {/* Manual Whitelist IP Card */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.98rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Plus size={17} color="#1e3a8a" /> Pre-Approve &amp; Whitelist IP Address
          </h3>
          <p style={{ margin: '0 0 0.85rem', fontSize: '0.82rem', color: '#64748b' }}>
            Enter a static office IP or owner connection. Any device visiting from this IP will be granted immediate approved access.
          </p>

          <form onSubmit={handleWhitelistSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="IP Address (e.g., 103.24.120.5)"
              value={whitelistIp}
              onChange={(e) => setWhitelistIp(e.target.value)}
              required
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.88rem',
                minWidth: '220px',
                flex: 1
              }}
            />
            <input
              type="text"
              placeholder="Label / Note (e.g., Hindustan Sawmill Office Static)"
              value={whitelistLabel}
              onChange={(e) => setWhitelistLabel(e.target.value)}
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.88rem',
                minWidth: '240px',
                flex: 1.5
              }}
            />
            <button
              type="submit"
              style={{
                backgroundColor: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.65rem 1.25rem',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <Check size={16} /> Whitelist &amp; Approve IP
            </button>
          </form>

          {whitelistSuccess && (
            <div style={{ marginTop: '0.65rem', color: '#15803d', fontWeight: 600, fontSize: '0.82rem' }}>
              ✓ {whitelistSuccess}
            </div>
          )}
        </div>

        {/* Search & Filter Toolbar */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '1rem',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          marginBottom: '1rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {/* Search Input */}
          <div style={{ position: 'relative', minWidth: '260px', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search by IP, Device ID, Label, City, ISP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.86rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'inline-flex', borderRadius: '8px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
            {(['all', 'pending', 'approved', 'blocked'] as const).map((filterKey) => (
              <button
                key={filterKey}
                type="button"
                onClick={() => setStatusFilter(filterKey)}
                style={{
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  backgroundColor: statusFilter === filterKey ? '#0f172a' : '#ffffff',
                  color: statusFilter === filterKey ? '#ffffff' : '#475569',
                  border: 'none',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {filterKey} {filterKey === 'all' ? `(${visitors.length})` : `(${visitors.filter(v => v.status === filterKey).length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Visitors Table */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                <th style={{ padding: '0.75rem 1rem' }}>Visitor Label &amp; Device ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>IP Address &amp; Location</th>
                <th style={{ padding: '0.75rem 1rem' }}>Device &amp; Browser</th>
                <th style={{ padding: '0.75rem 1rem' }}>Activity</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVisitors.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                    No visitors found matching your filter.
                  </td>
                </tr>
              ) : (
                filteredVisitors.map((visitor) => {
                  const isEditing = editingId === visitor.id;

                  return (
                    <tr
                      key={visitor.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: visitor.status === 'pending' ? '#fffbeb' : '#ffffff'
                      }}
                    >
                      {/* Label & Device ID */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <input
                              type="text"
                              value={editLabelText}
                              onChange={(e) => setEditLabelText(e.target.value)}
                              placeholder="Name this visitor..."
                              autoFocus
                              style={{
                                padding: '0.35rem 0.55rem',
                                borderRadius: '6px',
                                border: '1px solid #94a3b8',
                                fontSize: '0.82rem'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveLabel(visitor.id)}
                              style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.35rem 0.55rem', cursor: 'pointer' }}
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <strong style={{ color: visitor.label ? '#0f172a' : '#94a3b8' }}>
                              {visitor.label || 'Unnamed Device'}
                            </strong>
                            <button
                              type="button"
                              onClick={() => handleStartEditLabel(visitor)}
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px' }}
                              title="Edit visitor name / note"
                            >
                              <Edit2 size={13} />
                            </button>
                          </div>
                        )}
                        <div style={{ fontSize: '0.74rem', color: '#64748b', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                          ID: {visitor.deviceId}
                        </div>
                      </td>

                      {/* IP & Location */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Globe size={14} color="#2563eb" /> {visitor.ipAddress}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '0.15rem' }}>
                          {visitor.city ? `${visitor.city}${visitor.region ? `, ${visitor.region}` : ''}` : 'Location unknown'}
                          {visitor.isp ? ` &bull; ${visitor.isp}` : ''}
                        </div>
                      </td>

                      {/* Device & Browser */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          {visitor.deviceType === 'Mobile' ? (
                            <Smartphone size={14} color="#0f172a" />
                          ) : visitor.deviceType === 'Tablet' ? (
                            <Tablet size={14} color="#0f172a" />
                          ) : (
                            <Laptop size={14} color="#0f172a" />
                          )}
                          <span>{visitor.os || 'OS'} &bull; {visitor.browser || 'Browser'}</span>
                        </div>
                      </td>

                      {/* Timestamps */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {formatRelativeTime(visitor.lastSeen)}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                          First: {new Date(visitor.firstSeen).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '9999px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          backgroundColor:
                            visitor.status === 'approved' ? '#dcfce7' :
                            visitor.status === 'blocked' ? '#fee2e2' : '#fef9c3',
                          color:
                            visitor.status === 'approved' ? '#15803d' :
                            visitor.status === 'blocked' ? '#b91c1c' : '#a16207'
                        }}>
                          {visitor.status === 'approved' && <CheckCircle2 size={12} />}
                          {visitor.status === 'pending' && <Radio size={12} style={{ animation: 'pulse 1.5s infinite' }} />}
                          {visitor.status === 'blocked' && <Ban size={12} />}
                          {visitor.status.toUpperCase()}
                        </span>
                      </td>

                      {/* Action Buttons */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                          {visitor.status !== 'approved' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(visitor, 'approved')}
                              style={{
                                backgroundColor: '#16a34a',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '0.35rem 0.65rem',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                              title="Approve access"
                            >
                              <Check size={13} /> Approve
                            </button>
                          )}

                          {visitor.status !== 'blocked' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(visitor, 'blocked')}
                              style={{
                                backgroundColor: '#dc2626',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '0.35rem 0.65rem',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                              title="Block or revoke access"
                            >
                              <Ban size={13} /> Block
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDelete(visitor.id)}
                            style={{
                              backgroundColor: '#f1f5f9',
                              color: '#64748b',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '0.35rem 0.45rem',
                              cursor: 'pointer'
                            }}
                            title="Delete visitor record"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};
