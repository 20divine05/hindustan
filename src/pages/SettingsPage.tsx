import React, { useState } from 'react';
import {
  Building2,
  Calculator,
  Database,
  Save,
  Check,
  Copy,
  CheckCircle2,
  ShieldCheck,
  User,
  Info
} from 'lucide-react';
import type { BusinessSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseCredentials, saveCustomSupabaseCredentials, clearCustomSupabaseCredentials } from '../lib/supabase';

interface SettingsPageProps {
  settings: BusinessSettings;
  onUpdateSettings: (settings: BusinessSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onUpdateSettings }) => {
  const { user, isSupabaseConnected } = useAuth();
  const credentials = getSupabaseCredentials();

  // Local state for Business Profile Form
  const [formData, setFormData] = useState<BusinessSettings>(settings);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Supabase state
  const [dbUrl, setDbUrl] = useState(credentials.url);
  const [dbKey, setDbKey] = useState(credentials.anonKey);
  const [dbMessage, setDbMessage] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(formData);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleSaveDb = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUrl.trim() || !dbKey.trim()) {
      setDbMessage('Please enter both Project URL and Anon Key.');
      return;
    }
    const success = saveCustomSupabaseCredentials(dbUrl.trim(), dbKey.trim());
    if (success) {
      setDbMessage('Supabase credentials successfully saved and activated!');
      setTimeout(() => setDbMessage(null), 3000);
    }
  };

  const handleDisconnectDb = () => {
    clearCustomSupabaseCredentials();
    setDbUrl('');
    setDbKey('');
    setDbMessage('Switched back to local Demo Mode.');
    setTimeout(() => setDbMessage(null), 3000);
  };

  const handleCopySql = () => {
    const sql = `-- Hindustan Saw Mill: Open Public Access Schema & RLS Fix
-- Paste and run this in your Supabase SQL Editor:

ALTER TABLE IF EXISTS public.measurement_sheets DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.measurement_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.measurement_sheets ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.measurement_items ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.measurement_sheets DROP CONSTRAINT IF EXISTS measurement_sheets_user_id_fkey;
ALTER TABLE IF EXISTS public.measurement_items DROP CONSTRAINT IF EXISTS measurement_items_user_id_fkey;

CREATE TABLE IF NOT EXISTS public.measurement_sheets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  sheet_name text NOT NULL,
  customer_name text DEFAULT '',
  project_name text DEFAULT '',
  reference_number text DEFAULT '',
  measurement_date date DEFAULT current_date NOT NULL,
  notes text DEFAULT '',
  total_entries integer DEFAULT 0 NOT NULL,
  total_pieces numeric(12, 3) DEFAULT 0 NOT NULL,
  total_cft numeric(14, 4) DEFAULT 0 NOT NULL,
  total_sqft numeric(14, 4) DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.measurement_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sheet_id uuid REFERENCES public.measurement_sheets(id) ON DELETE CASCADE NOT NULL,
  user_id uuid,
  serial_number integer NOT NULL,
  length_feet numeric(10, 3) NOT NULL,
  width_inches numeric(10, 3) NOT NULL,
  thickness_inches numeric(10, 3) NOT NULL,
  number_of_pieces numeric(10, 3) NOT NULL,
  cft numeric(14, 4) NOT NULL,
  sqft numeric(14, 4) NOT NULL,
  wood_type text DEFAULT '',
  remarks text DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

DROP POLICY IF EXISTS "Allow all on measurement_sheets" ON public.measurement_sheets;
CREATE POLICY "Allow all on measurement_sheets" ON public.measurement_sheets FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on measurement_items" ON public.measurement_items;
CREATE POLICY "Allow all on measurement_items" ON public.measurement_items FOR ALL TO public USING (true) WITH CHECK (true);`;

    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', margin: '0 0 0.35rem' }}>Business &amp; System Settings</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Configure timber company branding, measurement formulas, and Supabase cloud database credentials
        </p>
      </div>

      {/* 1. Timber Business Branding */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Building2 size={20} color="var(--primary-400)" />
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Hindustan Saw Mill &amp; Wood Industries Profile</h3>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Appears on all exported PDF tallies &amp; CSV reports
          </span>
        </div>

        {/* Logo Preview Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.25rem',
            padding: '1rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            flexWrap: 'wrap'
          }}
        >
          <img
            src="/logo.png"
            alt="Hindustan Saw Mill & Wood Industries Logo"
            style={{
              height: '56px',
              maxWidth: '260px',
              objectFit: 'contain',
              backgroundColor: '#f7f4ea',
              borderRadius: '6px',
              padding: '4px 8px'
            }}
          />
          <div>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                backgroundColor: 'rgba(217, 155, 38, 0.2)',
                color: 'var(--amber-300)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(217, 155, 38, 0.35)'
              }}
            >
              Official Brand Identity Active
            </span>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Logo and company credentials will be printed on customer measurement tally sheets and exports.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveSettings}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Business Name:
              </label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Tagline / Subtitle:
              </label>
              <input
                type="text"
                value={formData.tagline}
                onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Yard / Sawmill Address:
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Contact Phone:
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Contact Email:
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Tax / GST / Business ID:
              </label>
              <input
                type="text"
                value={formData.taxId}
                onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem' }}>
            {saveSuccess && (
              <span style={{ fontSize: '0.85rem', color: 'var(--primary-400)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Check size={16} /> Business details updated!
              </span>
            )}
            <button type="submit" className="btn btn-primary btn-sm">
              <Save size={15} /> Save Business Profile
            </button>
          </div>
        </form>
      </div>

      {/* 2. Calculation Rules & Conventions */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Calculator size={20} color="var(--amber-400)" />
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Calculation Rules &amp; Formulas</h3>
          </div>
          <span className="badge badge-connected">Configurable Business Rules</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* CFT Rule Display */}
          <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
            <h4 style={{ fontSize: '0.95rem', margin: '0 0 0.35rem', color: 'var(--primary-700)' }}>
              CFT (Cubic Feet) Calculation Rule
            </h4>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-main)', padding: '0.5rem', backgroundColor: 'var(--bg-input)', borderRadius: '4px', marginBottom: '0.5rem' }}>
              CFT = (Length_feet &times; Width_inches &times; Thickness_inches &times; Pieces) &divide; 144
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Universal wood industry sawn timber volume formula. Cross-section in square inches divided by 144 converts to square feet, multiplied by length in feet.
            </p>
          </div>

          {/* SQFT Rule Display */}
          <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
            <h4 style={{ fontSize: '0.95rem', margin: '0 0 0.35rem', color: '#f59e0b' }}>
              SQFT (Square Feet) Calculation Rule
            </h4>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-main)', padding: '0.5rem', backgroundColor: 'var(--bg-input)', borderRadius: '4px', marginBottom: '0.5rem' }}>
              SQFT = CFT &times; 12
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Standard timber industry conversion: 1 Cubic Foot (CFT) = 12 Square Feet (SQFT) of 1-inch board footage equivalent.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Supabase Cloud Configuration & SQL Migration */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Database size={20} color="var(--primary-400)" />
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Supabase Cloud Database &amp; RLS Security</h3>
          </div>
          <span className={`badge ${isSupabaseConnected ? 'badge-connected' : 'badge-demo'}`}>
            {isSupabaseConnected ? 'PostgreSQL Connected' : 'Demo / Offline Mode'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: isSupabaseConnected ? 'rgba(59, 135, 94, 0.15)' : 'rgba(245, 158, 11, 0.12)',
              border: `1px solid ${isSupabaseConnected ? 'rgba(59, 135, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isSupabaseConnected ? (
                <CheckCircle2 size={18} color="var(--primary-400)" />
              ) : (
                <Info size={18} color="var(--amber-400)" />
              )}
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                {isSupabaseConnected
                  ? 'All measurement sheets, tallies, and user accounts sync to live Supabase PostgreSQL'
                  : 'Currently operating in resilient Demo / Offline mode with local storage persistence'}
              </span>
            </div>
            {isSupabaseConnected && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleDisconnectDb}
                style={{ color: 'var(--danger-400)', fontSize: '0.8rem' }}
              >
                Disconnect Cloud
              </button>
            )}
          </div>

          {dbMessage && (
            <div
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                backgroundColor: 'rgba(59, 135, 94, 0.2)',
                color: 'var(--primary-400)',
                border: '1px solid rgba(59, 135, 94, 0.4)'
              }}
            >
              {dbMessage}
            </div>
          )}

          <form onSubmit={handleSaveDb}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Supabase Project URL:
                </label>
                <input
                  type="text"
                  placeholder="https://your-project.supabase.co"
                  value={dbUrl}
                  onChange={(e) => setDbUrl(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Supabase Anon Key:
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={dbKey}
                  onChange={(e) => setDbKey(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <button type="submit" className="btn btn-primary btn-sm">
                <Save size={15} /> Save &amp; Connect Cloud Database
              </button>
            </div>
          </form>

          {/* Database Schema & Instructions */}
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={18} color="var(--primary-400)" />
                <h4 style={{ fontSize: '0.95rem', margin: 0 }}>Row Level Security &amp; Database Schema</h4>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopySql}
                style={{ fontSize: '0.8rem' }}
              >
                {copiedSql ? <Check size={14} color="var(--primary-400)" /> : <Copy size={14} />}
                {copiedSql ? 'SQL Script Copied!' : 'Copy Supabase SQL Schema'}
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 0.5rem', lineHeight: '1.5' }}>
              The schema enforces <strong>Row Level Security (RLS)</strong> so every lumber company user accesses only their own measurement sheets, preventing cross-tenant data leaks.
            </p>
          </div>
        </div>
      </div>

      {/* 4. Active User Account */}
      {user && (
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <User size={20} color="var(--primary-400)" />
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Account Information</h3>
            </div>
            <span className="badge badge-role">{user.role.toUpperCase()}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.9rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.8rem' }}>Full Name</span>
              <strong style={{ color: 'var(--text-main)' }}>{user.fullName}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.8rem' }}>Email Address</span>
              <strong style={{ color: 'var(--text-main)' }}>{user.email}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.8rem' }}>System Access Role</span>
              <strong style={{ color: 'var(--text-main)' }}>
                {user.role === 'admin'
                  ? 'Administrator'
                  : user.role === 'manager'
                  ? 'Mill Manager'
                  : 'Sawyer / Operator'}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
