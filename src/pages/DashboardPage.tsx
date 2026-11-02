import React, { useState, useEffect } from 'react';
import {
  Plus,
  FileSpreadsheet,
  Layers,
  Box,
  Maximize2,
  Calendar,
  User,
  ArrowRight,
  Search,
  ExternalLink,
  Trash2,
  Copy,
  FileDown
} from 'lucide-react';
import type { MeasurementSheet } from '../types';
import { dbService } from '../services/db';
import { formatCompact, formatValue } from '../utils/calculator';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';
import { exportSheetToPdf } from '../utils/exportPdf';

interface DashboardPageProps {
  onNewSheet: () => void;
  onOpenSheet: (sheet: MeasurementSheet) => void;
  onViewAllSheets: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNewSheet,
  onOpenSheet,
  onViewAllSheets
}) => {
  const { user } = useAuth();
  const [sheets, setSheets] = useState<MeasurementSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sheetToDelete, setSheetToDelete] = useState<MeasurementSheet | null>(null);

  // Load sheets on mount
  useEffect(() => {
    loadUserSheets();
  }, [user]);

  const loadUserSheets = async () => {
    setLoading(true);
    const uid = user?.id || 'guest';
    const role = user?.role;
    const data = await dbService.getSheets(uid, role);
    setSheets(data);
    setLoading(false);
  };

  // Compute aggregate stats across all sheets
  const totalSheetsCount = sheets.length;
  const totalCumulativePieces = sheets.reduce((sum, s) => sum + (s.totalPieces || 0), 0);
  const totalCumulativeCft = sheets.reduce((sum, s) => sum + (s.totalCft || 0), 0);
  const totalCumulativeSqft = sheets.reduce((sum, s) => sum + (s.totalSqft || 0), 0);

  // Filter sheets by search query
  const filteredSheets = sheets.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.sheetName.toLowerCase().includes(q) ||
      (s.customerName && s.customerName.toLowerCase().includes(q)) ||
      (s.projectName && s.projectName.toLowerCase().includes(q)) ||
      (s.referenceNumber && s.referenceNumber.toLowerCase().includes(q))
    );
  });

  const recentSheets = filteredSheets.slice(0, 5);

  const handleDuplicate = async (sheetId: string) => {
    const uid = user?.id || 'guest';
    const duplicated = await dbService.duplicateSheet(sheetId, uid);
    if (duplicated) {
      loadUserSheets();
    }
  };

  const confirmDelete = async () => {
    if (!sheetToDelete) return;
    const uid = user?.id || 'guest';
    await dbService.deleteSheet(sheetToDelete.id, uid);
    setSheetToDelete(null);
    loadUserSheets();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Welcome Banner Card */}
      <div
        className="dashboard-welcome-banner"
        style={{
          background: 'linear-gradient(135deg, #f3ebe0 0%, #e6d7c3 100%)',
          borderRadius: 'var(--radius-xl)',
          padding: '1.75rem 2rem',
          border: '1px solid var(--border-medium)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.25rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1, minWidth: '240px' }}>
          <img
            src="/logo-icon-transparent.png"
            alt="Hindustan Saw Mill Logo"
            className="welcome-banner-logo"
            style={{
              width: '64px',
              height: '64px',
              objectFit: 'contain',
              flexShrink: 0,
              filter: 'drop-shadow(0 4px 12px rgba(38, 29, 21, 0.2))'
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  backgroundColor: 'rgba(140, 84, 43, 0.12)',
                  color: 'var(--primary-700)',
                  border: '1px solid var(--primary-300)',
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}
              >
                Hindustan Saw Mill &amp; Wood Industries &bull; Est. 1971
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Logged in as {user?.email}
              </span>
            </div>
            <h1 style={{ fontSize: '1.85rem', color: 'var(--text-main)', margin: 0 }}>
              Welcome back, {user?.fullName || 'Mill Sawyer'}
            </h1>
            <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '580px' }}>
              Industrial CFT (Cubic Feet) &amp; SQFT (Square Feet) measurement platform.
              Manage lumber tallies, record sawing dimensions, and export certified reports.
            </p>
          </div>
        </div>

        {/* Primary Action Button */}
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={onNewSheet}
          style={{ boxShadow: '0 4px 14px rgba(140, 84, 43, 0.35)' }}
        >
          <Plus size={20} /> Create New Measurement Sheet
        </button>
      </div>

      {/* Aggregate Metric Cards across All User Sheets */}
      <div>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-main)' }}>
          Portfolio Cumulative Totals
        </h2>
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-label">
              <FileSpreadsheet size={16} color="var(--primary-400)" />
              <span>Saved Sheets</span>
            </div>
            <div className="summary-value">
              {formatCompact(totalSheetsCount)}
              <span className="summary-unit" style={{ color: 'var(--text-subtle)' }}>sheets</span>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-label">
              <Layers size={16} color="var(--amber-400)" />
              <span>Total Pieces</span>
            </div>
            <div className="summary-value">
              {formatCompact(totalCumulativePieces)}
              <span className="summary-unit">pcs</span>
            </div>
          </div>

          <div className="summary-card highlight-cft">
            <div className="summary-label">
              <Box size={16} color="var(--primary-600)" />
              <span>Total Volume</span>
            </div>
            <div className="summary-value" style={{ color: 'var(--primary-700)' }}>
              {formatValue(totalCumulativeCft, 3)}
              <span className="summary-unit" style={{ color: 'var(--primary-600)' }}>CFT</span>
            </div>
          </div>

          <div className="summary-card highlight">
            <div className="summary-label">
              <Maximize2 size={16} color="var(--amber-400)" />
              <span>Total Area</span>
            </div>
            <div className="summary-value" style={{ color: '#f59e0b' }}>
              {formatValue(totalCumulativeSqft, 3)}
              <span className="summary-unit">SQFT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Measurement Sheets List */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.25rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--border-light)'
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Recently Edited Sheets</h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Open and continue editing your saved timber tallies
            </p>
          </div>

          {/* Quick Search & View All */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '240px' }}>
              <Search
                size={16}
                color="var(--text-subtle)"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="Search sheets, customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.25rem', fontSize: '0.85rem' }}
              />
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onViewAllSheets}
            >
              View All ({totalSheetsCount}) <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            Loading measurement sheets...
          </div>
        ) : recentSheets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
            <FileSpreadsheet size={40} color="var(--primary-600)" style={{ marginBottom: '0.75rem' }} />
            <h4 style={{ color: 'var(--text-main)', fontSize: '1.1rem', margin: '0 0 0.5rem' }}>
              {searchQuery ? 'No sheets matching your search' : 'No saved sheets yet'}
            </h4>
            <p style={{ fontSize: '0.9rem', margin: '0 0 1.25rem', maxWidth: '380px', marginInline: 'auto' }}>
              Get started by creating your first timber measurement sheet. Calculate CFT &amp; SQFT in real time.
            </p>
            <button type="button" className="btn btn-primary btn-sm" onClick={onNewSheet}>
              <Plus size={16} /> Create New Sheet
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="calc-table">
              <thead>
                <tr>
                  <th>Sheet Details</th>
                  <th>Customer / Project</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Pieces</th>
                  <th style={{ textAlign: 'right' }}>Total CFT</th>
                  <th style={{ textAlign: 'right' }}>Total SQFT</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentSheets.map((sheet) => (
                  <tr key={sheet.id}>
                    <td>
                      <div>
                        <span
                          style={{
                            fontWeight: 700,
                            color: 'var(--text-main)',
                            cursor: 'pointer',
                            fontSize: '0.95rem'
                          }}
                          onClick={async () => {
                            const full = await dbService.getSheetById(sheet.id, user?.id || '');
                            if (full) onOpenSheet(full);
                          }}
                        >
                          {sheet.sheetName}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
                          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>
                            {sheet.referenceNumber || 'NO-REF'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                            &bull; {sheet.totalEntries} entries
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.88rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-main)' }}>
                          <User size={13} color="var(--primary-400)" />
                          <span>{sheet.customerName || 'Direct Customer'}</span>
                        </div>
                        {sheet.projectName && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            {sheet.projectName}
                          </div>
                        )}
                      </div>
                    </td>

                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Calendar size={13} /> {sheet.measurementDate}
                      </div>
                    </td>

                    <td className="col-numeric" style={{ color: 'var(--text-main)' }}>
                      {formatCompact(sheet.totalPieces)}
                    </td>

                    <td className="col-numeric col-cft">
                      {formatValue(sheet.totalCft, 3)}
                    </td>

                    <td className="col-numeric col-sqft">
                      {formatValue(sheet.totalSqft, 3)}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          title="Open & Continue Editing"
                          onClick={async () => {
                            const full = await dbService.getSheetById(sheet.id, user?.id || sheet.userId || 'guest', user?.role);
                            onOpenSheet(full || sheet);
                          }}
                        >
                          <ExternalLink size={13} /> Open
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Download PDF"
                          style={{ padding: '5px' }}
                          onClick={async () => {
                            const full = await dbService.getSheetById(sheet.id, user?.id || sheet.userId || 'guest', user?.role);
                            exportSheetToPdf(full || sheet);
                          }}
                        >
                          <FileDown size={14} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Duplicate sheet"
                          style={{ padding: '5px' }}
                          onClick={() => handleDuplicate(sheet.id)}
                        >
                          <Copy size={14} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Delete sheet"
                          style={{ padding: '5px', color: 'var(--danger-400)' }}
                          onClick={() => setSheetToDelete(sheet)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(sheetToDelete)}
        title="Delete Measurement Sheet?"
        message={`Are you sure you want to permanently delete "${sheetToDelete?.sheetName}"? All ${sheetToDelete?.totalEntries || 0} measurement rows and calculated records will be removed.`}
        confirmLabel="Delete Sheet"
        isDestructive={true}
        onConfirm={confirmDelete}
        onCancel={() => setSheetToDelete(null)}
      />
    </div>
  );
};
