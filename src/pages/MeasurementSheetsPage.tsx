import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  Search,
  FileText,
  Loader2,
  FileDown,
  Pencil,
  X,
  Check,
  Paperclip,
  Eye,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import type { BusinessSettings, MeasurementSheet, MeasurementSheetAttachment } from '../types';
import { dbService } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { formatValue } from '../utils/calculator';
import {
  printMeasurementSheetPdf,
  exportMeasurementSheetToPdf,
  createMeasurementSheetDocWithPages,
  type MeasurementSheetPdfPageMeta
} from '../utils/exportPdf';
import {
  processMeasurementAttachmentFiles,
  renderPdfArrayBufferToPreviewImages
} from '../utils/sheetAttachments';

interface MeasurementSheetsPageProps {
  businessSettings?: BusinessSettings;
  onSheetUpdated?: (sheet: MeasurementSheet) => void;
}

export interface MeasurementSheetDispatchDetails {
  gstNumber: string;
  billOfEntryNo: string;
  boeDate: string;
  motorVehicleNo: string;
  containerNo: string;
}

interface PreviewRenderedPage extends MeasurementSheetPdfPageMeta {
  imageUrl: string;
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
  businessSettings,
  onSheetUpdated
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

  // Attachment upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileUploadTargetRef = useRef<MeasurementSheet | null>(null);
  const [attachingSheetId, setAttachingSheetId] = useState<string | null>(null);
  const [attachmentNotice, setAttachmentNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // PDF preview modal state
  const [previewSheet, setPreviewSheet] = useState<MeasurementSheet | null>(null);
  const [previewPages, setPreviewPages] = useState<PreviewRenderedPage[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [hasUnsavedOrder, setHasUnsavedOrder] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savedOrderSuccess, setSavedOrderSuccess] = useState(false);
  const previewRequestSeqRef = useRef(0);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);

  const extractUnitOrderFromPages = (pages: PreviewRenderedPage[]): string[] => {
    const order: string[] = [];
    const seen = new Set<string>();
    for (const p of pages) {
      if (!p.unitKey || seen.has(p.unitKey)) continue;
      seen.add(p.unitKey);
      order.push(p.unitKey);
    }
    return order;
  };

  const scrollPreviewBy = (direction: -1 | 1) => {
    const el = previewScrollRef.current;
    if (!el) return;
    const step = Math.max(300, Math.round(el.clientWidth * 0.85));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

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

  const loadAuthoritativeSheet = async (summary: MeasurementSheet): Promise<MeasurementSheet | null> => {
    const uid = user?.id || summary.userId || 'guest';
    const full = await dbService.getSheetById(summary.id, uid, user?.role || 'admin');
    if (full) return full;
    if ((summary.items && summary.items.length > 0) || summary.totalEntries === 0) {
      return summary;
    }
    return null;
  };

  const syncSheetState = (savedSheet: MeasurementSheet, extraAttachments?: MeasurementSheetAttachment[]) => {
    const resolvedAttachments = extraAttachments !== undefined ? extraAttachments : savedSheet.attachedFiles;
    setSheets((prev) =>
      prev.map((s) =>
        s.id === savedSheet.id
          ? {
              ...s,
              gstNumber: savedSheet.gstNumber,
              billOfEntryNo: savedSheet.billOfEntryNo,
              boeDate: savedSheet.boeDate,
              motorVehicleNo: savedSheet.motorVehicleNo,
              containerNo: savedSheet.containerNo,
              proformaExportData: savedSheet.proformaExportData || s.proformaExportData,
              attachedFiles: resolvedAttachments,
              pageOrder: savedSheet.pageOrder
            }
          : s
      )
    );
    setPreviewSheet((prev) =>
      prev && prev.id === savedSheet.id
        ? { ...savedSheet, attachedFiles: resolvedAttachments }
        : prev
    );
    onSheetUpdated?.({ ...savedSheet, attachedFiles: resolvedAttachments });
  };

  const handleMeasurementSheetAction = async (
    summary: MeasurementSheet,
    action: 'print' | 'download',
    pageOrderOverride?: string[]
  ) => {
    setPrintingId(summary.id);
    try {
      const target = await loadAuthoritativeSheet(summary);
      if (!target) {
        alert('Could not load measurement rows from the database. Please check your connection and try again.');
        return;
      }
      const effectiveTarget: MeasurementSheet =
        pageOrderOverride !== undefined ? { ...target, pageOrder: pageOrderOverride } : target;
      if (action === 'download') {
        exportMeasurementSheetToPdf(effectiveTarget, businessSettings, effectiveTarget.proformaExportData);
      } else {
        printMeasurementSheetPdf(effectiveTarget, businessSettings, effectiveTarget.proformaExportData);
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
      const base = await loadAuthoritativeSheet(editingSheet);
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
      syncSheetState(savedSheet);
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

  const renderPreviewForSheet = async (target: MeasurementSheet) => {
    const reqSeq = ++previewRequestSeqRef.current;
    setPreviewSheet(target);
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const { doc, pages } = createMeasurementSheetDocWithPages(
        target,
        businessSettings,
        target.proformaExportData
      );
      const pdfBuffer = doc.output('arraybuffer');
      const images = await renderPdfArrayBufferToPreviewImages(pdfBuffer);

      if (previewRequestSeqRef.current !== reqSeq) return;

      const merged: PreviewRenderedPage[] = pages.map((meta, idx) => ({
        ...meta,
        imageUrl: images[idx] || ''
      }));
      setPreviewPages(merged);
    } catch (err) {
      console.error('Failed generating measurement sheet preview:', err);
      if (previewRequestSeqRef.current === reqSeq) {
        setPreviewError('Could not render PDF preview. Please try again.');
      }
    } finally {
      if (previewRequestSeqRef.current === reqSeq) {
        setPreviewLoading(false);
      }
    }
  };

  const handleOpenPreview = async (summary: MeasurementSheet) => {
    const reqSeq = ++previewRequestSeqRef.current;
    setPreviewSheet(summary);
    setPreviewPages([]);
    setPreviewLoading(true);
    setPreviewError(null);
    setHasUnsavedOrder(false);
    setSavedOrderSuccess(false);

    try {
      const target = await loadAuthoritativeSheet(summary);
      if (previewRequestSeqRef.current !== reqSeq) return;
      if (!target) {
        setPreviewError('Could not load measurement rows from the database. Please check your connection and try again.');
        setPreviewLoading(false);
        return;
      }
      await renderPreviewForSheet(target);
    } catch (err) {
      console.error('Failed loading sheet for PDF preview:', err);
      if (previewRequestSeqRef.current === reqSeq) {
        setPreviewError('Could not open PDF preview. Please try again.');
        setPreviewLoading(false);
      }
    }
  };

  const closePreviewModal = () => {
    previewRequestSeqRef.current++;
    setPreviewSheet(null);
    setPreviewPages([]);
    setPreviewError(null);
    setPreviewLoading(false);
    setDeletingAttachmentId(null);
    setHasUnsavedOrder(false);
    setSavingOrder(false);
    setSavedOrderSuccess(false);
  };

  const handleMovePreviewPage = (unitKey: string, direction: -1 | 1) => {
    if (previewLoading || savingOrder || Boolean(deletingAttachmentId)) return;
    setPreviewPages((prev) => {
      // Group contiguous pages by unitKey so multi-page units (e.g. a 2-page core sheet) stay together when moved
      const groups: Array<{ unitKey: string; items: PreviewRenderedPage[] }> = [];
      for (const page of prev) {
        const last = groups[groups.length - 1];
        if (last && last.unitKey === page.unitKey) {
          last.items.push(page);
        } else {
          groups.push({ unitKey: page.unitKey, items: [page] });
        }
      }
      const idx = groups.findIndex((g) => g.unitKey === unitKey);
      const targetIdx = idx + direction;
      if (idx < 0 || targetIdx < 0 || targetIdx >= groups.length) {
        return prev;
      }
      const nextGroups = [...groups];
      const [moved] = nextGroups.splice(idx, 1);
      nextGroups.splice(targetIdx, 0, moved);

      let pageNum = 1;
      const flattened: PreviewRenderedPage[] = [];
      for (const grp of nextGroups) {
        for (const item of grp.items) {
          flattened.push({ ...item, pageNumber: pageNum++ });
        }
      }
      return flattened;
    });
    setHasUnsavedOrder(true);
    setSavedOrderSuccess(false);
    setPreviewError(null);
  };

  const handleSavePageOrder = async () => {
    if (!previewSheet || savingOrder || previewPages.length === 0) return;
    setSavingOrder(true);
    setPreviewError(null);
    try {
      const uid = user?.id || previewSheet.userId || 'guest';
      const base = await loadAuthoritativeSheet(previewSheet);
      if (!base) {
        setPreviewError('Could not load measurement sheet rows from the database.');
        return;
      }

      const nextOrder = extractUnitOrderFromPages(previewPages);
      const updatedPayload: MeasurementSheet = {
        ...base,
        pageOrder: nextOrder
      };

      const res = await dbService.saveSheet(updatedPayload, uid);
      if (res.error) {
        setPreviewError(res.error);
        return;
      }
      syncSheetState(res.sheet);
      setHasUnsavedOrder(false);
      setSavedOrderSuccess(true);
      setTimeout(() => setSavedOrderSuccess(false), 2500);
    } catch (err) {
      console.error('Failed saving measurement sheet page order:', err);
      setPreviewError('Failed to save page order. Please try again.');
    } finally {
      setSavingOrder(false);
    }
  };

  const triggerAddFiles = (sheet: MeasurementSheet) => {
    if (attachingSheetId) return;
    fileUploadTargetRef.current = sheet;
    setAttachmentNotice(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetSummary = fileUploadTargetRef.current;
    const selectedFiles = e.target.files;
    if (!targetSummary || !selectedFiles || selectedFiles.length === 0) return;

    const files = Array.from(selectedFiles);
    setAttachingSheetId(targetSummary.id);
    setAttachmentNotice(null);

    try {
      const processedAttachments = await processMeasurementAttachmentFiles(files);
      if (processedAttachments.length === 0) return;

      const uid = user?.id || targetSummary.userId || 'guest';
      const base = await loadAuthoritativeSheet(targetSummary);
      if (!base) {
        setAttachmentNotice({
          type: 'error',
          text: 'Could not load measurement sheet rows from the database.'
        });
        return;
      }

      const nextAttachments: MeasurementSheetAttachment[] = [
        ...(base.attachedFiles || []),
        ...processedAttachments
      ];
      const activePreviewOrder =
        previewSheet && previewSheet.id === targetSummary.id && previewPages.length > 0
          ? extractUnitOrderFromPages(previewPages)
          : base.pageOrder;
      const nextOrder = activePreviewOrder
        ? [...activePreviewOrder, ...processedAttachments.map((a) => `att:${a.id}`)]
        : undefined;

      const updatedPayload: MeasurementSheet = {
        ...base,
        attachedFiles: nextAttachments,
        pageOrder: nextOrder
      };

      const res = await dbService.saveSheet(updatedPayload, uid);
      if (res.error) {
        setAttachmentNotice({
          type: 'error',
          text: res.error
        });
      }
      const savedSheet: MeasurementSheet = {
        ...res.sheet,
        attachedFiles: nextAttachments,
        pageOrder: nextOrder
      };
      syncSheetState(savedSheet, nextAttachments);

      if (!res.error) {
        setAttachmentNotice({
          type: 'success',
          text: `Added ${processedAttachments.length} ${processedAttachments.length === 1 ? 'page' : 'pages'} to ${base.customerName || 'sheet'}.`
        });
      }

      if (previewSheet && previewSheet.id === savedSheet.id) {
        setHasUnsavedOrder(false);
        await renderPreviewForSheet(savedSheet);
      }
    } catch (err: any) {
      console.error('Failed adding attachment files:', err);
      const msg = err?.message || 'Failed to attach file(s). Please upload valid PDF or image files.';
      if (previewSheet && previewSheet.id === targetSummary.id) {
        setPreviewError(msg);
      } else {
        setAttachmentNotice({ type: 'error', text: msg });
      }
    } finally {
      setAttachingSheetId(null);
      fileUploadTargetRef.current = null;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAttachedPage = async (attachmentId: string) => {
    if (!previewSheet || deletingAttachmentId) return;
    setDeletingAttachmentId(attachmentId);
    setPreviewError(null);

    try {
      const uid = user?.id || previewSheet.userId || 'guest';
      const base = await loadAuthoritativeSheet(previewSheet);
      if (!base) {
        setPreviewError('Could not load measurement sheet rows from the database.');
        return;
      }

      const nextAttachments = (base.attachedFiles || []).filter((att) => att.id !== attachmentId);
      const currentOrder =
        previewPages.length > 0 ? extractUnitOrderFromPages(previewPages) : base.pageOrder;
      const nextOrder = currentOrder?.filter((tok) => tok !== `att:${attachmentId}`);
      const updatedPayload: MeasurementSheet = {
        ...base,
        attachedFiles: nextAttachments,
        pageOrder: nextOrder
      };

      const res = await dbService.saveSheet(updatedPayload, uid);
      const savedSheet: MeasurementSheet = {
        ...res.sheet,
        attachedFiles: nextAttachments.length > 0 ? nextAttachments : undefined,
        pageOrder: nextOrder
      };
      syncSheetState(savedSheet, savedSheet.attachedFiles);
      setHasUnsavedOrder(false);
      await renderPreviewForSheet(savedSheet);
      if (res.error) {
        setPreviewError(res.error);
      }
    } catch (err) {
      console.error('Failed deleting attached page:', err);
      setPreviewError('Failed to delete page. Please try again.');
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredSheets = sheets.filter((sheet) => {
    if (!q) return true;
    const customer = (sheet.customerName || 'Direct Customer').toLowerCase();
    const phone = (sheet.customerPhone || sheet.consigneePhone || '').toLowerCase();
    const district = (sheet.consigneeDistrict || sheet.destination || sheet.customerState || '').toLowerCase();
    const invoiceNo = resolveSheetInvoiceNumber(sheet).toLowerCase();
    const ref = (sheet.referenceNumber || '').toLowerCase();
    const details = resolveSheetDispatchDetails(sheet);
    return (
      customer.includes(q) ||
      phone.includes(q) ||
      district.includes(q) ||
      invoiceNo.includes(q) ||
      ref.includes(q) ||
      details.gstNumber.toLowerCase().includes(q) ||
      details.billOfEntryNo.toLowerCase().includes(q) ||
      details.motorVehicleNo.toLowerCase().includes(q) ||
      details.containerNo.toLowerCase().includes(q)
    );
  });

  const formatCustomerMetaSummary = (sheet: MeasurementSheet): string => {
    const exp = sheet.proformaExportData || {};
    const phone = String(sheet.customerPhone || sheet.consigneePhone || exp.buyerPhone || exp.consigneePhone || '').trim();
    const distRaw = String(sheet.consigneeDistrict || sheet.destination || exp.destination || sheet.customerState || '').trim();
    const state = String(sheet.customerState || sheet.consigneeState || '').trim();
    const parts: string[] = [];
    if (phone) parts.push(`Ph: ${phone}`);
    if (distRaw && (!state || distRaw.toLowerCase() !== state.toLowerCase())) {
      parts.push(`Dist: ${distRaw}`);
    } else if (distRaw || state) {
      parts.push(distRaw || state);
    }
    return parts.join(' • ');
  };

  const formatDetailsSummary = (d: MeasurementSheetDispatchDetails): string => {
    const parts: string[] = [];
    if (d.gstNumber) parts.push(`Inv: ${d.gstNumber}`);
    if (d.billOfEntryNo) parts.push(`BOE: ${d.billOfEntryNo}`);
    if (d.boeDate) parts.push(`Date: ${d.boeDate}`);
    if (d.motorVehicleNo) parts.push(`Veh: ${d.motorVehicleNo}`);
    if (d.containerNo) parts.push(`Cont: ${d.containerNo}`);
    return parts.join(' • ');
  };

  const userAddedCountInPreview = previewPages.filter((p) => p.kind === 'attachment').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

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

        {attachmentNotice && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '0.85rem',
              padding: '0.55rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 600,
              backgroundColor: attachmentNotice.type === 'error' ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${attachmentNotice.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
              color: attachmentNotice.type === 'error' ? '#b91c1c' : '#166534'
            }}
          >
            <span>{attachmentNotice.text}</span>
            <button
              type="button"
              onClick={() => setAttachmentNotice(null)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'inherit',
                padding: '0.15rem'
              }}
              aria-label="Dismiss notice"
            >
              <X size={14} />
            </button>
          </div>
        )}

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
                      <th style={{ textAlign: 'center', width: '430px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSheets.map((sheet) => {
                      const invoiceNo = resolveSheetInvoiceNumber(sheet);
                      const isPrinting = printingId === sheet.id;
                      const isAttaching = attachingSheetId === sheet.id;
                      const busy = isPrinting || isAttaching;
                      const attachedCount = sheet.attachedFiles?.length || 0;
                      const details = resolveSheetDispatchDetails(sheet);
                      const detailsSummary = formatDetailsSummary(details);
                      const customerMeta = formatCustomerMetaSummary(sheet);
                      return (
                        <tr key={sheet.id}>
                          <td style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                            <div>{sheet.customerName || 'Direct Customer'}</div>
                            {customerMeta && (
                              <div style={{ fontSize: '0.73rem', fontWeight: 600, color: '#475569', marginTop: '0.12rem' }}>
                                {customerMeta}
                              </div>
                            )}
                            {detailsSummary && (
                              <div style={{ fontSize: '0.73rem', fontWeight: 500, color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                {detailsSummary}
                              </div>
                            )}
                            {attachedCount > 0 && (
                              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1d4ed8', marginTop: '0.15rem' }}>
                                {attachedCount} extra {attachedCount === 1 ? 'page' : 'pages'} attached
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
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={busy}
                                onClick={() => openDetailsModal(sheet)}
                                title="Enter GST Invoice Number, BOE No., BOE Date, Motor Vehicle No. & Container Number"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
                              >
                                <Pencil size={13} />
                                {detailsSummary ? 'Edit Details' : 'Add Details'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={busy}
                                onClick={() => triggerAddFiles(sheet)}
                                title="Attach PDF or image pages to the end of this measurement sheet"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
                              >
                                {isAttaching ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                                {isAttaching ? 'Adding...' : attachedCount > 0 ? `Add Files (${attachedCount})` : 'Add Files'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={busy}
                                onClick={() => handleOpenPreview(sheet)}
                                title="Preview all pages in this measurement sheet PDF"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
                              >
                                <Eye size={13} />
                                Preview PDF
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={busy}
                                onClick={() => handleMeasurementSheetAction(sheet, 'print')}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                              >
                                {isPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                                {isPrinting ? 'Preparing...' : 'Print Sheet'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                title="Download PDF named after customer"
                                disabled={busy}
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
                const isAttaching = attachingSheetId === sheet.id;
                const busy = isPrinting || isAttaching;
                const attachedCount = sheet.attachedFiles?.length || 0;
                const details = resolveSheetDispatchDetails(sheet);
                const detailsSummary = formatDetailsSummary(details);
                const customerMeta = formatCustomerMetaSummary(sheet);
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
                        {customerMeta && (
                          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#475569', marginTop: '0.14rem', wordBreak: 'break-word' }}>
                            {customerMeta}
                          </div>
                        )}
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
                        disabled={busy}
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

                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => triggerAddFiles(sheet)}
                        style={{
                          flex: '1 1 0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.32rem',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isAttaching ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                        {isAttaching ? 'Adding...' : attachedCount > 0 ? `Add Files (${attachedCount})` : 'Add Files'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => handleOpenPreview(sheet)}
                        style={{
                          flex: '1 1 0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.32rem',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <Eye size={13} />
                        Preview PDF
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
                          disabled={busy}
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
                          disabled={busy}
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

      {/* Add / Edit Details Modal */}
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
                  GST Invoice Number
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

      {/* Preview PDF Modal */}
      {previewSheet && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(3px)',
            zIndex: 10050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.75rem'
          }}
          onClick={closePreviewModal}
        >
          <div
            className="card"
            style={{
              width: 'min(96vw, 960px)',
              height: '92vh',
              maxHeight: '92vh',
              backgroundColor: '#f1f5f9',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                flexShrink: 0,
                backgroundColor: '#fff',
                borderBottom: '1px solid var(--border-medium)',
                padding: '0.85rem 1.1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.65rem'
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '1.08rem', color: 'var(--text-main)' }}>
                  Preview PDF — {previewSheet.customerName || 'Direct Customer'}
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Invoice #{resolveSheetInvoiceNumber(previewSheet)}
                  {previewPages.length > 0 && (
                    <>
                      {' • '}
                      <strong>{previewPages.length} total {previewPages.length === 1 ? 'page' : 'pages'}</strong>
                      {userAddedCountInPreview > 0 ? ` (${userAddedCountInPreview} added)` : ''}
                      {' • Scroll horizontally to view pages'}
                    </>
                  )}
                </p>
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                {previewPages.length > 1 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginRight: '0.2rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => scrollPreviewBy(-1)}
                      title="Scroll left"
                      aria-label="Previous page"
                      style={{ padding: '0.35rem 0.45rem' }}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => scrollPreviewBy(1)}
                      title="Scroll right"
                      aria-label="Next page"
                      style={{ padding: '0.35rem 0.45rem' }}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={previewLoading || savingOrder || Boolean(deletingAttachmentId)}
                  onClick={handleSavePageOrder}
                  title="Save current page order for this measurement sheet"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontWeight: 700,
                    backgroundColor: savedOrderSuccess
                      ? '#dcfce7'
                      : hasUnsavedOrder
                        ? '#15803d'
                        : '#ffffff',
                    color: savedOrderSuccess
                      ? '#166534'
                      : hasUnsavedOrder
                        ? '#ffffff'
                        : 'var(--text-main)',
                    border: savedOrderSuccess
                      ? '1px solid #86efac'
                      : hasUnsavedOrder
                        ? '1px solid #15803d'
                        : '1px solid var(--border-medium)'
                  }}
                >
                  {savingOrder ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  {savingOrder ? 'Saving...' : savedOrderSuccess ? 'Order Saved' : 'Save Order'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={previewLoading || attachingSheetId === previewSheet.id || Boolean(deletingAttachmentId) || savingOrder}
                  onClick={() => triggerAddFiles(previewSheet)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 700 }}
                >
                  {attachingSheetId === previewSheet.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  Add Files
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={previewLoading || printingId === previewSheet.id}
                  onClick={() =>
                    handleMeasurementSheetAction(
                      previewSheet,
                      'print',
                      hasUnsavedOrder ? extractUnitOrderFromPages(previewPages) : undefined
                    )
                  }
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 700 }}
                >
                  <Printer size={14} />
                  Print
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={previewLoading || printingId === previewSheet.id}
                  onClick={() =>
                    handleMeasurementSheetAction(
                      previewSheet,
                      'download',
                      hasUnsavedOrder ? extractUnitOrderFromPages(previewPages) : undefined
                    )
                  }
                  title="Download PDF"
                  style={{ padding: '0.35rem 0.5rem' }}
                >
                  <FileDown size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={closePreviewModal}
                  aria-label="Close Preview"
                  style={{ padding: '0.35rem 0.5rem' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {previewError && (
              <div
                style={{
                  flexShrink: 0,
                  margin: '0.75rem 1rem 0',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  borderRadius: '8px',
                  padding: '0.6rem 0.85rem',
                  fontSize: '0.84rem',
                  fontWeight: 600
                }}
              >
                {previewError}
              </div>
            )}

            {/* Modal Body (Horizontally Scrollable Full Pages) */}
            <div
              ref={previewScrollRef}
              style={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                overflowX: 'auto',
                overflowY: 'hidden',
                scrollSnapType: 'x mandatory',
                padding: '0.9rem 1rem',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'stretch',
                gap: '1rem'
              }}
            >
              {previewLoading ? (
                <div
                  style={{
                    flex: '1 0 100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    gap: '0.65rem'
                  }}
                >
                  <Loader2 size={28} className="animate-spin" color="var(--primary-700)" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Rendering all PDF pages...</span>
                </div>
              ) : (
                previewPages.map((page, pageIdx) => {
                  const isAdded = page.kind === 'attachment' && Boolean(page.attachmentId);
                  const isDeletingThis = Boolean(isAdded && deletingAttachmentId === page.attachmentId);
                  const canMoveLeft = pageIdx > 0 && previewPages[0].unitKey !== page.unitKey;
                  const canMoveRight =
                    pageIdx < previewPages.length - 1 &&
                    previewPages[previewPages.length - 1].unitKey !== page.unitKey;
                  const badgeStyle =
                    page.kind === 'attachment'
                      ? { backgroundColor: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' }
                      : page.kind === 'forest'
                        ? { backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #86efac' }
                        : { backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' };

                  return (
                    <div
                      key={`${page.unitKey}_${page.pageNumber}`}
                      style={{
                        flex: '0 0 min(86vw, 600px)',
                        height: '100%',
                        scrollSnapAlign: 'start',
                        backgroundColor: '#fff',
                        borderRadius: '10px',
                        border: isAdded ? '1.5px solid #93c5fd' : '1px solid #cbd5e1',
                        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          flexShrink: 0,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                          padding: '0.55rem 0.8rem',
                          backgroundColor: '#f8fafc',
                          borderBottom: '1px solid #e2e8f0'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.45rem', minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              color: '#0f172a',
                              backgroundColor: '#e2e8f0',
                              borderRadius: '6px',
                              padding: '0.15rem 0.45rem'
                            }}
                          >
                            Page {page.pageNumber} of {previewPages.length}
                          </span>
                          <span
                            style={{
                              fontSize: '0.73rem',
                              fontWeight: 700,
                              borderRadius: '6px',
                              padding: '0.14rem 0.45rem',
                              ...badgeStyle
                            }}
                          >
                            {page.label}
                          </span>
                          {page.attachmentName && (
                            <span
                              style={{
                                fontSize: '0.76rem',
                                color: '#475569',
                                fontWeight: 600,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '190px'
                              }}
                              title={page.attachmentName}
                            >
                              {page.attachmentName}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                          {previewPages.length > 1 && (
                            <>
                              <button
                                type="button"
                                disabled={!canMoveLeft || savingOrder || Boolean(deletingAttachmentId)}
                                onClick={() => handleMovePreviewPage(page.unitKey, -1)}
                                title="Move page earlier"
                                aria-label="Move page left"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.15rem',
                                  backgroundColor: canMoveLeft ? '#ffffff' : '#f1f5f9',
                                  color: canMoveLeft ? '#0f172a' : '#94a3b8',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  padding: '0.24rem 0.42rem',
                                  fontSize: '0.73rem',
                                  fontWeight: 700,
                                  cursor: canMoveLeft && !savingOrder ? 'pointer' : 'not-allowed'
                                }}
                              >
                                <ArrowLeft size={12} />
                              </button>
                              <button
                                type="button"
                                disabled={!canMoveRight || savingOrder || Boolean(deletingAttachmentId)}
                                onClick={() => handleMovePreviewPage(page.unitKey, 1)}
                                title="Move page later"
                                aria-label="Move page right"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.15rem',
                                  backgroundColor: canMoveRight ? '#ffffff' : '#f1f5f9',
                                  color: canMoveRight ? '#0f172a' : '#94a3b8',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  padding: '0.24rem 0.42rem',
                                  fontSize: '0.73rem',
                                  fontWeight: 700,
                                  cursor: canMoveRight && !savingOrder ? 'pointer' : 'not-allowed'
                                }}
                              >
                                <ArrowRight size={12} />
                              </button>
                            </>
                          )}

                          {isAdded && page.attachmentId && (
                            <button
                              type="button"
                              disabled={Boolean(deletingAttachmentId) || attachingSheetId === previewSheet.id || savingOrder}
                              onClick={() => handleDeleteAttachedPage(page.attachmentId!)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                backgroundColor: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                borderRadius: '6px',
                                padding: '0.24rem 0.5rem',
                                fontSize: '0.73rem',
                                fontWeight: 700,
                                cursor: deletingAttachmentId ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {isDeletingThis ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                              {isDeletingThis ? 'Deleting...' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </div>

                      {page.imageUrl && (
                        <div
                          style={{
                            flex: 1,
                            minHeight: 0,
                            overflowY: 'auto',
                            backgroundColor: '#f8fafc',
                            padding: '0.6rem'
                          }}
                        >
                          <img
                            src={page.imageUrl}
                            alt={`Measurement Sheet Page ${page.pageNumber}`}
                            style={{
                              width: '100%',
                              height: 'auto',
                              display: 'block',
                              backgroundColor: '#fff',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px'
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
