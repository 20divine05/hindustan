import React, { useState, useEffect } from 'react';
import { Printer, Search, FileText, Loader2, FileDown, Pencil, X, Check } from 'lucide-react';
import type { BusinessSettings, MeasurementSheet } from '../types';
import { dbService } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { formatValue } from '../utils/calculator';
import { printMeasurementSheetPdf, exportMeasurementSheetToPdf } from '../utils/exportPdf';

interface MeasurementSheetsPageProps {
  businessSettings?: BusinessSettings;
}

export interface MeasurementSheetDispatchDetails {
  gstNumber: string;
  billOfEntryNo: string;
  boeDate: string;
  motorVehicleNo: string;
  containerNo: string;
}

export function resolveSheetInvoiceNumber(sheet: MeasurementSheet): string {
  const customNo = sheet.proformaExportData?.invoiceNo;
  if (customNo !== undefined && customNo !== null && String(customNo).trim() !== '') {
    return String(customNo).trim();
  }
  if (sheet.referenceNumber && sheet.referenceNumber.trim() !== '') {
    return sheet.referenceNumber.trim().replace(/^REF-/i, '');
  }
  return '-';
}

export function resolveSheetDispatchDetails(sheet: MeasurementSheet): MeasurementSheetDispatchDetails {
  const exp = sheet.proformaExportData || {};
  return {
    gstNumber: String(sheet.gstNumber ?? exp.gstNumber ?? '').trim(),
    billOfEntryNo: String(sheet.billOfEntryNo ?? exp.billOfEntryNo ?? '').trim(),
    boeDate: String(sheet.boeDate ?? exp.boeDate ?? '').trim(),
    motorVehicleNo: String(sheet.motorVehicleNo ?? exp.motorVehicleNo ?? '').trim(),
    containerNo: String(sheet.containerNo ?? exp.containerNo ?? '').trim()
  };
}

function formatTodayShort(): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}-${months[now.getMonth()]}-${String(now.getFullYear()).slice(-2)}`;
}

export const MeasurementSheetsPage: React.FC<MeasurementSheetsPageProps> = ({
  businessSettings
}) => {
  const { user } = useAuth();
  const [sheets, setSheets] = useState<MeasurementSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [printingId, setPrintingId] = useState<string | null>(null);

  const [editingSheet, setEditingSheet] = useState<MeasurementSheet | null>(null);
  const [detailForm, setDetailForm] = useState<MeasurementSheetDispatchDetails>({
    gstNumber: '',
    billOfEntryNo: '',
    boeDate: '',
    motorVehicleNo: '',
    containerNo: ''
  });
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadSheets = async () => {
      setLoading(true);
      try {
        const uid = user?.id || 'guest';
        const data = await dbService.getSheets(uid, user?.role);
        if (active) setSheets(data);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadSheets();
    return () => {
      active = false;
    };
  }, [user]);

  const handleMeasurementSheetAction = async (summary: MeasurementSheet, action: 'print' | 'download') => {
    setPrintingId(summary.id);
    try {
      const uid = user?.id || summary.userId || 'guest';
      const full = await dbService.getSheetById(summary.id, uid, user?.role || 'admin');
      const target = full || ((summary.items && summary.items.length > 0) || summary.totalEntries === 0 ? summary : null);
      if (!target) {
        alert('Could not load measurement rows from the database. Please check your connection and try again.');
        return;
      }
      if (action === 'download') {
        exportMeasurementSheetToPdf(target, businessSettings, target.proformaExportData);
      } else {
        printMeasurementSheetPdf(target, businessSettings, target.proformaExportData);
      }
    } finally {
      setPrintingId(null);
    }
  };

  const openDetailsModal = (sheet: MeasurementSheet) => {
    setEditingSheet(sheet);
    setDetailForm(resolveSheetDispatchDetails(sheet));
    setDetailError(null);
  };

  const handleSaveDetails = async (andPrint: boolean) => {
    if (!editingSheet || savingDetails) return;
    setSavingDetails(true);
    setDetailError(null);
    try {
      const uid = user?.id || editingSheet.userId || 'guest';
      const full = await dbService.getSheetById(editingSheet.id, uid, user?.role || 'admin');
      const base = full || ((editingSheet.items && editingSheet.items.length > 0) || editingSheet.totalEntries === 0 ? editingSheet : null);
      if (!base) {
        setDetailError('Could not load measurement rows from the database. Please check your connection and try again.');
        return;
      }

      const nextDetails: MeasurementSheetDispatchDetails = {
        gstNumber: detailForm.gstNumber.trim(),
        billOfEntryNo: detailForm.billOfEntryNo.trim(),
        boeDate: detailForm.boeDate.trim(),
        motorVehicleNo: detailForm.motorVehicleNo.trim(),
        containerNo: detailForm.containerNo.trim()
      };

      const nextExportData = {
        ...(base.proformaExportData || {}),
        ...nextDetails
      };

      const updatedPayload: MeasurementSheet = {
        ...base,
        ...nextDetails,
        proformaExportData: nextExportData
      };

      const res = await dbService.saveSheet(updatedPayload, uid);
      const savedSheet = res.sheet;
      setSheets((prev) =>
        prev.map((s) =>
          s.id === savedSheet.id
            ? {
                ...s,
                ...nextDetails,
                proformaExportData: savedSheet.proformaExportData || nextExportData
              }
            : s
        )
      );
      setEditingSheet(null);

      if (andPrint) {
        printMeasurementSheetPdf(savedSheet, businessSettings, savedSheet.proformaExportData);
      }
    } catch (err) {
      console.error('Failed saving measurement sheet dispatch details:', err);
      setDetailError('Failed to save details. Please try again.');
    } finally {
      setSavingDetails(false);
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredSheets = sheets.filter((sheet) => {
    if (!q) return true;
    const customer = (sheet.customerName || 'Direct Customer').toLowerCase();
    const invoiceNo = resolveSheetInvoiceNumber(sheet).toLowerCase();
    const ref = (sheet.referenceNumber || '').toLowerCase();
    const details = resolveSheetDispatchDetails(sheet);
    return (
      customer.includes(q) ||
      invoiceNo.includes(q) ||
      ref.includes(q) ||
      details.gstNumber.toLowerCase().includes(q) ||
      details.billOfEntryNo.toLowerCase().includes(q) ||
      details.motorVehicleNo.toLowerCase().includes(q) ||
      details.containerNo.toLowerCase().includes(q)
    );
  });

  const formatDetailsSummary = (d: MeasurementSheetDispatchDetails): string => {
    const parts: string[] = [];
    if (d.gstNumber) parts.push(`Inv: ${d.gstNumber}`);
    if (d.billOfEntryNo) parts.push(`BOE: ${d.billOfEntryNo}`);
    if (d.boeDate) parts.push(`Date: ${d.boeDate}`);
    if (d.motorVehicleNo) parts.push(`Veh: ${d.motorVehicleNo}`);
    if (d.containerNo) parts.push(`Cont: ${d.containerNo}`);
    return parts.join(' • ');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="card" style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.85rem',
            marginBottom: '1rem',
            paddingBottom: '0.85rem',
            borderBottom: '1px solid var(--border-light)'
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Measurement Sheet</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Quick customer measurement overview &amp; direct sheet print
            </p>
          </div>

          <div style={{ position: 'relative', minWidth: '220px', flex: '0 1 320px' }}>
            <Search
              size={15}
              color="var(--text-subtle)"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search customer or invoice no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.15rem', width: '100%' }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            Loading measurement sheets...
          </div>
        ) : filteredSheets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <FileText size={36} color="var(--primary-600)" style={{ marginBottom: '0.65rem' }} />
            <h4 style={{ color: 'var(--text-main)', fontSize: '1.05rem', margin: '0 0 0.35rem' }}>
              No measurement sheets found
            </h4>
            <p style={{ fontSize: '0.88rem', margin: 0 }}>
              {q ? 'Try a different customer name or invoice number.' : 'Saved sheets will appear here ready to print.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="mobile-hide">
              <div className="table-responsive">
                <table className="calc-table">
                  <thead>
                    <tr>
                      <th>Customer Name</th>
                      <th>Invoice Number</th>
                      <th style={{ textAlign: 'right' }}>Total CFT</th>
                      <th style={{ textAlign: 'center', width: '310px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSheets.map((sheet) => {
                      const invoiceNo = resolveSheetInvoiceNumber(sheet);
                      const isPrinting = printingId === sheet.id;
                      const details = resolveSheetDispatchDetails(sheet);
                      const detailsSummary = formatDetailsSummary(details);
                      return (
                        <tr key={sheet.id}>
                          <td style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                            <div>{sheet.customerName || 'Direct Customer'}</div>
                            {detailsSummary && (
                              <div style={{ fontSize: '0.73rem', fontWeight: 500, color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                {detailsSummary}
                              </div>
                            )}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-main)' }}>
                            {invoiceNo}
                          </td>
                          <td className="col-numeric col-cft" style={{ fontWeight: 800 }}>
                            {formatValue(sheet.totalCft, 3)} CFT
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={isPrinting}
                                onClick={() => openDetailsModal(sheet)}
                                title="Enter Bill of Entry No., BOE Date, Motor Vehicle No. & Container Number"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.32rem', fontWeight: 600 }}
                              >
                                <Pencil size={13} />
                                {detailsSummary ? 'Edit Details' : 'Add Details'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={isPrinting}
                                onClick={() => handleMeasurementSheetAction(sheet, 'print')}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                              >
                                {isPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                                {isPrinting ? 'Preparing...' : 'Print Measurement Sheet'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                title="Download PDF named after customer"
                                disabled={isPrinting}
                                onClick={() => handleMeasurementSheetAction(sheet, 'download')}
                                style={{ padding: '0.35rem 0.5rem' }}
                              >
                                <FileDown size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="mobile-show" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {filteredSheets.map((sheet) => {
                const invoiceNo = resolveSheetInvoiceNumber(sheet);
                const isPrinting = printingId === sheet.id;
                const details = resolveSheetDispatchDetails(sheet);
                const detailsSummary = formatDetailsSummary(details);
                return (
                  <div
                    key={sheet.id}
                    style={{
                      backgroundColor: '#fff',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '10px',
                      padding: '0.85rem',
                      boxShadow: 'var(--shadow-xs)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Customer Name
                        </div>
                        <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-main)', wordBreak: 'break-word' }}>
                          {sheet.customerName || 'Direct Customer'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Invoice No.
                        </div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                          {invoiceNo}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.5rem',
                        borderTop: '1px dashed var(--border-light)',
                        paddingTop: '0.45rem'
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: detailsSummary ? 'var(--text-main)' : 'var(--text-muted)',
                          fontWeight: detailsSummary ? 600 : 500,
                          lineHeight: 1.35,
                          wordBreak: 'break-word'
                        }}
                      >
                        {detailsSummary || 'BOE, Vehicle & Container details'}
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={isPrinting}
                        onClick={() => openDetailsModal(sheet)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          flexShrink: 0,
                          fontSize: '0.76rem',
                          padding: '0.28rem 0.6rem',
                          fontWeight: 700
                        }}
                      >
                        <Pencil size={12} />
                        {detailsSummary ? 'Edit Details' : 'Add Details'}
                      </button>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                        backgroundColor: 'var(--bg-subtle, #f8fafc)',
                        borderRadius: '8px',
                        padding: '0.5rem 0.65rem'
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total CFT: </span>
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--primary-800)' }}>
                          {formatValue(sheet.totalCft, 3)} CFT
                        </span>
                      </div>

                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={isPrinting}
                          onClick={() => handleMeasurementSheetAction(sheet, 'print')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                        >
                          {isPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                          {isPrinting ? 'Preparing...' : 'Print Sheet'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          title="Download PDF"
                          disabled={isPrinting}
                          onClick={() => handleMeasurementSheetAction(sheet, 'download')}
                          style={{ padding: '0.35rem 0.5rem' }}
                        >
                          <FileDown size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {editingSheet && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(3px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => !savingDetails && setEditingSheet(null)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '1.25rem',
              backgroundColor: '#fff',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.9rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>
                  Measurement Sheet Details
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {editingSheet.customerName || 'Direct Customer'} • Invoice #{resolveSheetInvoiceNumber(editingSheet)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={savingDetails}
                onClick={() => setEditingSheet(null)}
                style={{ padding: '0.3rem 0.45rem' }}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {detailError && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  borderRadius: '8px',
                  padding: '0.55rem 0.75rem',
                  fontSize: '0.82rem',
                  fontWeight: 600
                }}
              >
                {detailError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.28rem', color: 'var(--text-main)' }}>
                  GST Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. HSM/26-27/042"
                  value={detailForm.gstNumber}
                  onChange={(e) => setDetailForm((prev) => ({ ...prev, gstNumber: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.28rem', color: 'var(--text-main)' }}>
                  Bill of Entry No.
                </label>
                <input
                  type="text"
                  placeholder="e.g. 4589210"
                  value={detailForm.billOfEntryNo}
                  onChange={(e) => setDetailForm((prev) => ({ ...prev, billOfEntryNo: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.28rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    BOE Date
                  </label>
                  <button
                    type="button"
                    onClick={() => setDetailForm((prev) => ({ ...prev, boeDate: formatTodayShort() }))}
                    style={{
                      border: '1px solid var(--border-medium)',
                      background: 'var(--bg-subtle, #f8fafc)',
                      borderRadius: '6px',
                      padding: '0.12rem 0.45rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--primary-800)',
                      cursor: 'pointer'
                    }}
                  >
                    Today
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. 28-Nov-26"
                  value={detailForm.boeDate}
                  onChange={(e) => setDetailForm((prev) => ({ ...prev, boeDate: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.28rem', color: 'var(--text-main)' }}>
                  Motor Vehicle No.
                </label>
                <input
                  type="text"
                  placeholder="e.g. KA-09-AB-1234"
                  value={detailForm.motorVehicleNo}
                  onChange={(e) => setDetailForm((prev) => ({ ...prev, motorVehicleNo: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.28rem', color: 'var(--text-main)' }}>
                  Container Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. MSKU1234567"
                  value={detailForm.containerNo}
                  onChange={(e) => setDetailForm((prev) => ({ ...prev, containerNo: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.35rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={savingDetails}
                onClick={() => setEditingSheet(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={savingDetails}
                onClick={() => handleSaveDetails(false)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}
              >
                {savingDetails ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Save Details
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={savingDetails}
                onClick={() => handleSaveDetails(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}
              >
                {savingDetails ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                Save &amp; Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
