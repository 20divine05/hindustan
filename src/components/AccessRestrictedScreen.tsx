import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, Copy, Check, Lock, Laptop, Globe, Clock, UserCheck } from 'lucide-react';
import type { AppVisitor } from '../types';

interface AccessRestrictedScreenProps {
  visitor: AppVisitor | null;
  onRefresh: () => Promise<void>;
  onNavigateToAdmin: () => void;
}

export const AccessRestrictedScreen: React.FC<AccessRestrictedScreenProps> = ({
  visitor,
  onRefresh,
  onNavigateToAdmin
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isBlocked = visitor?.status === 'blocked';

  const handleCopyId = () => {
    if (visitor?.deviceId) {
      navigator.clipboard.writeText(visitor.deviceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCheckStatus = async () => {
    setIsRefreshing(true);
    setMessage(null);
    try {
      await onRefresh();
      setMessage('Status re-checked. If recently approved by admin, access will unlock automatically.');
    } catch {
      setMessage('Could not connect to verification server. Please try again in a few moments.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const formattedTime = visitor?.firstSeen
    ? new Date(visitor.firstSeen).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : new Date().toLocaleTimeString();

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f1f5f9',
      backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
      backgroundSize: '24px 24px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '1.25rem',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden'
      }}>
        {/* Top Header Banner */}
        <div style={{
          backgroundColor: isBlocked ? '#7f1d1d' : '#0f172a',
          color: '#ffffff',
          padding: '1.75rem 1.5rem',
          textAlign: 'center',
          borderBottom: '4px solid',
          borderColor: isBlocked ? '#ef4444' : '#eab308'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: isBlocked ? 'rgba(239, 68, 68, 0.2)' : 'rgba(234, 179, 8, 0.2)',
            color: isBlocked ? '#fca5a5' : '#fde047',
            marginBottom: '0.85rem'
          }}>
            {isBlocked ? <Lock size={28} /> : <ShieldAlert size={28} />}
          </div>
          <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Hindustan Saw Mill &amp; Wood Industries
          </h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#94a3b8', fontWeight: 500 }}>
            Saw Mill &amp; Wood Industries &bull; Established Since 1971
          </p>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            marginTop: '0.85rem',
            padding: '0.35rem 0.85rem',
            borderRadius: '9999px',
            backgroundColor: isBlocked ? '#b91c1c' : '#854d0e',
            color: '#ffffff',
            fontSize: '0.8rem',
            fontWeight: 700
          }}>
            {isBlocked ? '🚫 Access Revoked / Blocked' : '⏳ Pending Administrator Approval'}
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.5rem' }}>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.92rem', color: '#334155', lineHeight: 1.5, textAlign: 'center' }}>
            {isBlocked
              ? 'Your device or network access has been revoked by the sawmill administrator. If you believe this is an error, please reach out directly.'
              : 'This timber calculation and proforma invoice system is restricted to authorized devices. Your access request has been automatically sent to the administrator.'}
          </p>

          {/* Visitor Device & Network Card */}
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.25rem'
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
              Your Connection Credentials
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.85rem' }}>
              {/* Device ID */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Laptop size={14} /> Request / Device ID:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <code style={{ fontSize: '0.8rem', backgroundColor: '#e2e8f0', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                    {visitor?.deviceId ? `${visitor.deviceId.substring(0, 16)}...` : 'Generating...'}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#475569' }}
                    title="Copy full Device ID"
                  >
                    {copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* IP Address */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Globe size={14} /> IP &amp; Location:
                </span>
                <span style={{ fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                  {visitor?.ipAddress || 'Detecting...'}
                  {visitor?.city && ` (${visitor.city}${visitor.region ? `, ${visitor.region}` : ''})`}
                </span>
              </div>

              {/* Device & Browser */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Laptop size={14} /> Device &amp; Browser:
                </span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                  {visitor?.os || 'PC'} &bull; {visitor?.browser || 'Browser'} ({visitor?.deviceType || 'Desktop'})
                </span>
              </div>

              {/* Timestamp */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Clock size={14} /> Registered At:
                </span>
                <span style={{ color: '#475569' }}>
                  {formattedTime}
                </span>
              </div>
            </div>
          </div>

          {/* Refresh Check Status Button */}
          <button
            type="button"
            onClick={handleCheckStatus}
            disabled={isRefreshing}
            style={{
              width: '100%',
              padding: '0.85rem 1.25rem',
              borderRadius: '10px',
              backgroundColor: '#0f172a',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 700,
              border: 'none',
              cursor: isRefreshing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
              transition: 'background-color 0.15s ease'
            }}
          >
            <RefreshCw size={17} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            <span>{isRefreshing ? 'Checking Authorization...' : 'Check Approval Status'}</span>
          </button>

          {message && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              fontSize: '0.82rem',
              color: '#166534',
              textAlign: 'center'
            }}>
              {message}
            </div>
          )}

          {/* How to approve notice */}
          <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>
            Please notify the mill manager with your <strong>Device ID</strong> or <strong>IP</strong> to authorize this device.
          </div>
        </div>

        {/* Footer with Administrator Link */}
        <div style={{
          padding: '0.85rem 1.25rem',
          backgroundColor: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.82rem'
        }}>
          <span style={{ color: '#94a3b8' }}>Hindustan Security Guard</span>
          <button
            type="button"
            onClick={onNavigateToAdmin}
            style={{
              background: 'none',
              border: 'none',
              color: '#1e3a8a',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: 0
            }}
          >
            <UserCheck size={14} />
            <span>Administrator Login &rarr;</span>
          </button>
        </div>
      </div>
    </div>
  );
};
