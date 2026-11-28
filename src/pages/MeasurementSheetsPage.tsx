import React, { useState, useEffect } from 'react';
import { Printer, Search, FileText, Loader2, FileDown } from 'lucide-react';
import type { BusinessSettings, MeasurementSheet } from '../types';
import { dbService } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { formatValue } from '../utils/calculator';
import { printMeasurementSheetPdf, exportMeasurementSheetToPdf } from '../utils/exportPdf';

interface MeasurementSheetsPageProps {
  businessSettings?: BusinessSettings;
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

export const MeasurementSheetsPage: React.FC<MeasurementSheetsPageProps> = ({
  businessSettings
}) => {
  const { user } = useAuth();
  const [sheets, setSheets] = useState<MeasurementSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [printingId, setPrintingId] = useState<string | null>(null);

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

  const q = searchQuery.trim().toLowerCase();
  const filteredSheets = sheets.filter((sheet) => {
    if (!q) return true;
    const customer = (sheet.customerName || 'Direct Customer').toLowerCase();
    const invoiceNo = resolveSheetInvoiceNumber(sheet).toLowerCase();
    const ref = (sheet.referenceNumber || '').toLowerCase();
    return customer.includes(q) || invoiceNo.includes(q) || ref.includes(q);
  });

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
                      <th style={{ textAlign: 'center', width: '190px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSheets.map((sheet) => {
                      const invoiceNo = resolveSheetInvoiceNumber(sheet);
                      const isPrinting = printingId === sheet.id;
                      return (
                        <tr key={sheet.id}>
                          <td style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                            {sheet.customerName || 'Direct Customer'}
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
                      gap: '0.6rem'
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
    </div>
  );
};
