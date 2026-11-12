import React, { useState, useEffect } from 'react';
import {
  Search,
  Calendar,
  User,
  Plus,
  FileDown,
  Share2,
  Trash2,
  Copy,
  ExternalLink,
  Edit2,
  Filter,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import type { MeasurementSheet, BusinessSettings } from '../types';
import { dbService } from '../services/db';
import { formatCompact, formatValue } from '../utils/calculator';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';
import { ProformaInvoiceModal } from '../components/ProformaInvoiceModal';
import { exportSheetToPdf } from '../utils/exportPdf';
import { exportSheetToCsv } from '../utils/exportCsv';

interface HistoryPageProps {
  onOpenSheet: (sheet: MeasurementSheet) => void;
  onNewSheet: () => void;
  businessSettings?: BusinessSettings;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  onOpenSheet,
  onNewSheet,
  businessSettings
}) => {
  const { user } = useAuth();
  const [sheets, setSheets] = useState<MeasurementSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'cft_desc' | 'pieces_desc'>('newest');

  const [sheetToDelete, setSheetToDelete] = useState<MeasurementSheet | null>(null);
  const [editingSheet, setEditingSheet] = useState<{ id: string; name: string } | null>(null);
  const [proformaSheet, setProformaSheet] = useState<MeasurementSheet | null>(null);

  useEffect(() => {
    loadSheets();
  }, [user]);

  const loadSheets = async () => {
    setLoading(true);
    const uid = user?.id || 'guest';
    const role = user?.role;
    const data = await dbService.getSheets(uid, role);
    setSheets(data);
    setLoading(false);
  };

  const handleDuplicate = async (sheetId: string) => {
    const uid = user?.id || 'guest';
    const duplicated = await dbService.duplicateSheet(sheetId, uid);
    if (duplicated) {
      loadSheets();
    }
  };

  const confirmDelete = async () => {
    if (!sheetToDelete) return;
    const uid = user?.id || 'guest';
    await dbService.deleteSheet(sheetToDelete.id, uid);
    setSheetToDelete(null);
    loadSheets();
  };

  const handleRenameSubmit = async (sheetId: string, newName: string) => {
    if (!newName.trim()) return;
    const uid = user?.id || 'guest';
    const sheet = await dbService.getSheetById(sheetId, uid, user?.role);
    if (sheet) {
      sheet.sheetName = newName.trim();
      await dbService.saveSheet(sheet, uid);
      setEditingSheet(null);
      loadSheets();
    }
  };

  // Filter sheets
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const filteredSheets = sheets.filter((sheet) => {
    // Search filter
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      sheet.sheetName.toLowerCase().includes(q) ||
      (sheet.customerName && sheet.customerName.toLowerCase().includes(q)) ||
      (sheet.projectName && sheet.projectName.toLowerCase().includes(q)) ||
      (sheet.referenceNumber && sheet.referenceNumber.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    // Date filter
    if (dateFilter === 'today') {
      return sheet.measurementDate === todayStr;
    } else if (dateFilter === 'week') {
      const sheetDate = new Date(sheet.measurementDate);
      const diffDays = (now.getTime() - sheetDate.getTime()) / (1000 * 3600 * 24);
      return diffDays <= 7;
    } else if (dateFilter === 'month') {
      const sheetDate = new Date(sheet.measurementDate);
      const diffDays = (now.getTime() - sheetDate.getTime()) / (1000 * 3600 * 24);
      return diffDays <= 30;
    }

    return true;
  });

  // Sort sheets
  const sortedSheets = [...filteredSheets].sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
    if (sortBy === 'oldest') {
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    }
    if (sortBy === 'cft_desc') {
      return (b.totalCft || 0) - (a.totalCft || 0);
    }
    if (sortBy === 'pieces_desc') {
      return (b.totalPieces || 0) - (a.totalPieces || 0);
    }
    return 0;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header and Controls Card */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.5rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--border-light)'
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Measurement Sheet Records</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              Manage, search, export, and reopen your historical timber calculations
            </p>
          </div>

          <button type="button" className="btn btn-primary btn-sm" onClick={onNewSheet}>
            <Plus size={16} /> New Sheet
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="history-filter-bar">
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search
              size={16}
              color="var(--text-subtle)"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search by Sheet Name, Customer, Project, or Ref No..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.25rem', width: '100%' }}
            />
          </div>

          <div className="history-selects-row">
            {/* Date Range Quick Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}>
              <Filter size={14} color="var(--text-subtle)" />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                style={{ fontSize: '0.88rem', width: '100%' }}
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="week">Past 7 Days</option>
                <option value="month">Past 30 Days</option>
              </select>
            </div>

            {/* Sorting */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{ fontSize: '0.88rem', width: '100%' }}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="cft_desc">Highest CFT</option>
                <option value="pieces_desc">Highest Pieces</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Sheets Table */}
      <div className="card" style={{ padding: '1.25rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
            Loading records from database...
          </div>
        ) : sortedSheets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
            <FileSpreadsheet size={40} color="var(--primary-600)" style={{ marginBottom: '0.75rem' }} />
            <h4 style={{ color: 'var(--text-main)', fontSize: '1.1rem', margin: '0 0 0.5rem' }}>
              No measurement sheets found
            </h4>
            <p style={{ fontSize: '0.9rem', margin: '0 0 1.25rem' }}>
              {searchQuery || dateFilter !== 'all'
                ? 'Try adjusting your search criteria or date filters.'
                : 'Create your first measurement sheet in the calculator.'}
            </p>
            <button type="button" className="btn btn-primary btn-sm" onClick={onNewSheet}>
              <Plus size={16} /> Create Sheet
            </button>
          </div>
        ) : (
          <>
            <div className="mobile-hide">
              <div className="table-responsive">
            <table className="calc-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                  <th>Sheet Name &amp; Ref</th>
                  <th>Customer &amp; Project</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Entries</th>
                  <th style={{ textAlign: 'right' }}>Pieces</th>
                  <th style={{ textAlign: 'right' }}>Total CFT</th>
                  <th style={{ textAlign: 'right' }}>Total SQFT</th>
                  <th style={{ textAlign: 'center', width: '180px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedSheets.map((sheet, index) => (
                  <tr key={sheet.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                      {index + 1}
                    </td>

                    <td>
                      {editingSheet?.id === sheet.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <input
                            type="text"
                            value={editingSheet.name}
                            onChange={(e) => setEditingSheet({ ...editingSheet, name: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameSubmit(sheet.id, editingSheet.name);
                              if (e.key === 'Escape') setEditingSheet(null);
                            }}
                            autoFocus
                            style={{ fontSize: '0.9rem', padding: '0.25rem 0.5rem' }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                            onClick={() => handleRenameSubmit(sheet.id, editingSheet.name)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '3px 6px', fontSize: '0.75rem' }}
                            onClick={() => setEditingSheet(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '2px', color: 'var(--text-subtle)' }}
                              title="Rename sheet"
                              onClick={() => setEditingSheet({ id: sheet.id, name: sheet.sheetName })}
                            >
                              <Edit2 size={12} />
                            </button>
                          </div>
                          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>
                            {sheet.referenceNumber || 'NO-REF'}
                          </span>
                        </div>
                      )}
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

                    <td className="col-numeric" style={{ color: 'var(--text-muted)' }}>
                      {sheet.totalEntries || 0}
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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          title="Open & Edit"
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
                          title="Export PDF report"
                          style={{ padding: '5px' }}
                          onClick={async () => {
                            const full = await dbService.getSheetById(sheet.id, user?.id || sheet.userId || 'guest', user?.role);
                            exportSheetToPdf(full || sheet, businessSettings);
                          }}
                        >
                          <FileDown size={14} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="View & Print Proforma Invoice (Tally Format)"
                          style={{ padding: '5px', color: '#10b981' }}
                          onClick={async () => {
                            const full = await dbService.getSheetById(sheet.id, user?.id || sheet.userId || 'guest', user?.role);
                            setProformaSheet(full || sheet);
                          }}
                        >
                          <FileText size={14} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Export CSV"
                          style={{ padding: '5px' }}
                          onClick={async () => {
                            const full = await dbService.getSheetById(sheet.id, user?.id || sheet.userId || 'guest', user?.role);
                            exportSheetToCsv(full || sheet, businessSettings);
                          }}
                        >
                          <Share2 size={14} />
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
        </div>

        {/* Mobile Cards View (Fits 100% Mobile Screen, Zero Horizontal Scroll) */}
        <div className="mobile-show" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {sortedSheets.map((sheet, index) => (
            <div
              key={sheet.id}
              style={{
                backgroundColor: '#fff',
                border: '1px solid var(--border-medium)',
                borderRadius: '10px',
                padding: '0.75rem',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem'
              }}
            >
              {/* Header: Sheet Name, Ref & Date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingSheet?.id === sheet.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                      <input
                        type="text"
                        value={editingSheet.name}
                        onChange={(e) => setEditingSheet({ ...editingSheet, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSubmit(sheet.id, editingSheet.name);
                          if (e.key === 'Escape') setEditingSheet(null);
                        }}
                        autoFocus
                        style={{ fontSize: '0.85rem', padding: '0.2rem 0.4rem', width: '100%' }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                        onClick={() => handleRenameSubmit(sheet.id, editingSheet.name)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 4px', fontSize: '0.72rem' }}
                        onClick={() => setEditingSheet(null)}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary-700)', fontFamily: 'var(--font-mono)' }}>
                        #{index + 1}
                      </span>
                      <strong
                        style={{
                          fontSize: '0.9rem',
                          color: 'var(--text-main)',
                          fontWeight: 800,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        onClick={async () => {
                          const full = await dbService.getSheetById(sheet.id, user?.id || '');
                          if (full) onOpenSheet(full);
                        }}
                      >
                        {sheet.sheetName}
                      </strong>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px', color: 'var(--text-subtle)' }}
                        title="Rename sheet"
                        onClick={() => setEditingSheet({ id: sheet.id, name: sheet.sheetName })}
                      >
                        <Edit2 size={11} />
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{sheet.referenceNumber || 'NO-REF'}</span>
                    <span>•</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      <User size={11} color="var(--primary-600)" />
                      {sheet.customerName || 'Direct Customer'}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <Calendar size={11} /> {sheet.measurementDate}
                </div>
              </div>

              {/* Totals Summary Row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--bg-subtle, #f8fafc)',
                borderRadius: '6px',
                padding: '0.35rem 0.55rem',
                fontSize: '0.78rem',
                fontWeight: 700
              }}>
                <span style={{ color: 'var(--text-main)' }}>
                  {sheet.totalEntries || 0} rows • {formatCompact(sheet.totalPieces)} pcs
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--primary-800)', fontWeight: 800 }}>
                    {formatValue(sheet.totalCft, 3)} CFT
                  </span>
                  <span style={{ color: '#b45309' }}>
                    {formatValue(sheet.totalSqft, 2)} SQFT
                  </span>
                </div>
              </div>

              {/* Actions Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem', paddingTop: '0.2rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', fontWeight: 800, flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                  onClick={async () => {
                    const full = await dbService.getSheetById(sheet.id, user?.id || sheet.userId || 'guest', user?.role);
                    onOpenSheet(full || sheet);
                  }}
                >
                  <ExternalLink size={13} /> Open
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title="Export PDF"
                    style={{ padding: '0.35rem 0.5rem' }}
                    onClick={async () => {
                      const full = await dbService.getSheetById(sheet.id, user?.id || sheet.userId || 'guest', user?.role);
                      exportSheetToPdf(full || sheet, businessSettings);
                    }}
                  >
                    <FileDown size={13} />
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title="Proforma Invoice"
                    style={{ padding: '0.35rem 0.5rem', color: '#059669' }}
                    onClick={async () => {
                      const full = await dbService.getSheetById(sheet.id, user?.id || sheet.userId || 'guest', user?.role);
                      setProformaSheet(full || sheet);
                    }}
                  >
                    <FileText size={13} />
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title="Export CSV"
                    style={{ padding: '0.35rem 0.5rem' }}
                    onClick={async () => {
                      const full = await dbService.getSheetById(sheet.id, user?.id || sheet.userId || 'guest', user?.role);
                      exportSheetToCsv(full || sheet, businessSettings);
                    }}
                  >
                    <Share2 size={13} />
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title="Duplicate"
                    style={{ padding: '0.35rem 0.5rem' }}
                    onClick={() => handleDuplicate(sheet.id)}
                  >
                    <Copy size={13} />
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    title="Delete"
                    style={{ padding: '0.35rem 0.5rem', color: 'var(--danger-500, #dc2626)' }}
                    onClick={() => setSheetToDelete(sheet)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    )}
      </div>

      {/* Delete Sheet Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(sheetToDelete)}
        title="Delete Measurement Sheet?"
        message={`Are you sure you want to permanently delete "${sheetToDelete?.sheetName}"? All ${sheetToDelete?.totalEntries || 0} measurement rows and records will be permanently removed.`}
        confirmLabel="Delete Sheet"
        isDestructive={true}
        onConfirm={confirmDelete}
        onCancel={() => setSheetToDelete(null)}
      />

      {/* Proforma Invoice Modal */}
      <ProformaInvoiceModal
        isOpen={proformaSheet !== null}
        onClose={() => setProformaSheet(null)}
        sheet={proformaSheet}
        businessSettings={businessSettings}
      />
    </div>
  );
};
