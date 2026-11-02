import React, { useState } from 'react';
import { Database, CheckCircle2, AlertCircle, Copy, Check, ExternalLink, X, RefreshCw } from 'lucide-react';
import { getSupabaseCredentials, saveCustomSupabaseCredentials, clearCustomSupabaseCredentials } from '../lib/supabase';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({ isOpen, onClose }) => {
  const current = getSupabaseCredentials();
  const [url, setUrl] = useState(current.url);
  const [anonKey, setAnonKey] = useState(current.anonKey);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) {
      setStatusMessage({ type: 'error', text: 'Please fill in both Supabase URL and Anon Key.' });
      return;
    }

    if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
      setStatusMessage({ type: 'error', text: 'Supabase URL typically looks like: https://xyzcompany.supabase.co' });
      return;
    }

    const success = saveCustomSupabaseCredentials(url.trim(), anonKey.trim());
    if (success) {
      setStatusMessage({ type: 'success', text: 'Supabase credentials saved! Connecting to cloud database...' });
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setStatusMessage({ type: 'error', text: 'Failed to save credentials to local storage.' });
    }
  };

  const handleClear = () => {
    clearCustomSupabaseCredentials();
    setUrl('');
    setAnonKey('');
    setStatusMessage({ type: 'success', text: 'Switched to local Demo Mode.' });
  };

  const handleCopySql = () => {
    const sqlScript = `-- Run this in your Supabase SQL Editor:
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('user', 'manager', 'admin')),
  company_name text default 'Timber & Lumber Co.',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.measurement_sheets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  sheet_name text not null,
  customer_name text default '',
  project_name text default '',
  reference_number text default '',
  measurement_date date default current_date not null,
  notes text default '',
  total_entries integer default 0 not null,
  total_pieces numeric(12, 3) default 0 not null,
  total_cft numeric(14, 4) default 0 not null,
  total_sqft numeric(14, 4) default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.measurement_items (
  id uuid default gen_random_uuid() primary key,
  sheet_id uuid references public.measurement_sheets(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  serial_number integer not null,
  length_feet numeric(10, 3) not null,
  width_inches numeric(10, 3) not null,
  thickness_inches numeric(10, 3) not null,
  number_of_pieces numeric(10, 3) not null,
  cft numeric(14, 4) not null,
  sqft numeric(14, 4) not null,
  wood_type text default '',
  remarks text default '',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;
alter table public.measurement_sheets enable row level security;
alter table public.measurement_items enable row level security;

create policy "Allow all on measurement_sheets" on public.measurement_sheets for all using (true) with check (true);
create policy "Allow all on measurement_items" on public.measurement_items for all using (true) with check (true);
create policy "Allow all on profiles" on public.profiles for all using (true) with check (true);`;

    navigator.clipboard.writeText(sqlScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '640px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 135, 94, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-400)'
              }}
            >
              <Database size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Supabase Cloud Connection</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                PostgreSQL database & multi-user authentication
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Current Status Pill */}
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            backgroundColor: current.isConfigured ? 'rgba(59, 135, 94, 0.15)' : 'rgba(245, 158, 11, 0.12)',
            border: `1px solid ${current.isConfigured ? 'rgba(59, 135, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {current.isConfigured ? (
              <CheckCircle2 size={18} color="var(--primary-400)" />
            ) : (
              <AlertCircle size={18} color="var(--amber-400)" />
            )}
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {current.isConfigured
                ? 'Supabase Cloud Connected (Live PostgreSQL & RLS)'
                : 'Demo / Offline Mode Active (Local Storage Fallback)'}
            </span>
          </div>
          {current.isConfigured && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleClear}
              style={{ fontSize: '0.8rem', color: 'var(--danger-400)' }}
            >
              Disconnect
            </button>
          )}
        </div>

        {statusMessage && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              backgroundColor: statusMessage.type === 'success' ? 'rgba(59, 135, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: statusMessage.type === 'success' ? 'var(--primary-400)' : 'var(--danger-400)',
              border: `1px solid ${statusMessage.type === 'success' ? 'rgba(59, 135, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
            }}
          >
            {statusMessage.text}
          </div>
        )}

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Project URL:
            </label>
            <input
              type="text"
              placeholder="https://your-project.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Anon Public Key:
            </label>
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              <RefreshCw size={15} /> Save & Connect
            </button>
          </div>
        </form>

        {/* Setup Helper Guide */}
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.95rem', margin: 0, color: 'var(--text-main)' }}>
              Quick Supabase Database Setup
            </h4>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCopySql}
              style={{ fontSize: '0.8rem' }}
            >
              {copied ? <Check size={14} color="var(--primary-400)" /> : <Copy size={14} />}
              {copied ? 'SQL Copied!' : 'Copy SQL Schema'}
            </button>
          </div>
          <ol style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            <li>Log in to your <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>Supabase Dashboard <ExternalLink size={12} /></a> and open your project.</li>
            <li>Go to the <strong>SQL Editor</strong>, paste the copied SQL schema, and click <strong>Run</strong>.</li>
            <li>Go to <strong>Project Settings &gt; API</strong> and copy your <em>Project URL</em> and <em>anon public key</em> into this dialog (or add them to <code>.env</code> as <code>VITE_SUPABASE_URL</code>).</li>
          </ol>
        </div>
      </div>
    </div>
  );
};
