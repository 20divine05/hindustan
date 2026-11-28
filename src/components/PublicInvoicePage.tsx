import React, { useEffect, useState, useMemo, useRef } from 'react';
import { FileDown, Printer, FileText, AlertCircle } from 'lucide-react';
import { dbService } from '../services/db';
import { getProformaInvoicePdfBlob, printProformaInvoicePdf, type ProformaInvoiceExportData } from '../utils/exportPdf';
import { formatIndianCurrency } from '../utils/indianNumberWords';
import { calculateRFT, calculateTotals, calculateSheetAmount, calculateSheetSqft, isCftRftOnlyWood, isTimberRftBilled, isTimberSqftBilled, resolveSheetRateUnit, resolveSheetWidth, getCutLogItemSectionHeading, getCutLogItemDescription, sortTimberEntries } from '../utils/calculator';
import type { BusinessSettings, MeasurementSheet } from '../types';

interface PublicInvoicePageProps {
  sheetId: string;
  businessSettings: BusinessSettings;
}

export const PublicInvoicePage: React.FC<PublicInvoicePageProps> = ({
  sheetId,
  businessSettings
}) => {
  const [sheet, setSheet] = useState<MeasurementSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>('invoice.pdf');
  const [showFallback, setShowFallback] = useState(false);
  const didRedirectRef = useRef(false);

  useEffect(() => {
    let active = true;
    const loadInvoice = async () => {
      setLoading(true);
      try {
        const fetched = await dbService.getPublicSheetById(sheetId);
        if (!active) return;
        if (!fetched) {
          setError('Invoice could not be found or may have been deleted.');
        } else {
          setSheet(fetched);
        }
      } catch (err) {
        console.error('Failed to load shared invoice:', err);
        if (active) setError('Unable to load the requested invoice. Please check your connection.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadInvoice();
    return () => { active = false; };
  }, [sheetId]);

  const resolvedExportData: ProformaInvoiceExportData | undefined = useMemo(() => {
    if (!sheet) return undefined;
    if (sheet.proformaExportData) {
      return sheet.proformaExportData as ProformaInvoiceExportData;
    }

    const rateDefault = businessSettings?.ratePerCft || 1400;
    const computed = calculateTotals(sheet.items || []);
    const isRoundLog = sheet.logType === 'round';
    const roundLogOutputUnit = sheet.roundLogOutputUnit || 'CFT';

    const cutInvoiceItems = sortTimberEntries(sheet.items || []).map((it, idx) => {
      const itWood = (it.woodType || '').toUpperCase();
      const isPly = it.itemCategory === 'plywood' || itWood.includes('PLYWOOD');
      const isReady = it.itemCategory === 'ready_board' || itWood.includes('READY');
      const isSheet = (isPly || isReady) && it.itemCategory !== 'timber';
      const woodHeading = getCutLogItemSectionHeading(it);
      const isCftRftOnly = !isSheet && isCftRftOnlyWood(it.woodType || woodHeading);
      const isRftBilled = !isSheet && isTimberRftBilled({ ...it, woodType: woodHeading });
      const isSqftBilled = !isSheet && isTimberSqftBilled({ ...it, woodType: woodHeading });
      const unit: 'CFT' | 'SQFT' | 'PCS' | 'RFT' = isSheet
        ? resolveSheetRateUnit(it.rateUnit)
        : (isRftBilled ? 'RFT' : (isSqftBilled ? 'SQFT' : 'CFT'));
      const pcs = typeof it.pieces === 'number' ? it.pieces : (parseFloat(String(it.pieces)) || 0);
      const sheetW = resolveSheetWidth(isPly, it.widthInches, it.boardSize);
      const sheetSqft = isSheet ? calculateSheetSqft(isPly, pcs, sheetW, it.boardSize) : (isCftRftOnly ? 0 : (it.sqft || 0));
      const rftVal = !isSheet ? calculateRFT(it.lengthFeet, pcs) : 0;
      const qty = unit === 'RFT' ? rftVal : (unit === 'SQFT' ? sheetSqft : unit === 'PCS' ? pcs : it.cft);
      const rate = typeof it.rate === 'number' ? it.rate : rateDefault;
      const amt = isSheet
        ? (rate > 0 ? calculateSheetAmount(isPly, pcs, rate, unit, sheetW, it.boardSize).amount : (it.amount || 0))
        : (typeof it.amount === 'number' ? it.amount : Math.round(qty * rate * 100) / 100);

      return {
        slNo: idx + 1,
        description: isSheet ? getCutLogItemDescription({ ...it, woodType: woodHeading }) : `${it.lengthFeet}X${it.widthInches}X${it.thicknessInches} ${woodHeading}`,
        woodType: woodHeading,
        hsn: isSheet ? '4412' : '4407',
        cft: it.cft || 0,
        sqft: sheetSqft,
        rft: rftVal,
        widthInches: it.widthInches || 0,
        rateUnit: unit,
        pieces: pcs,
        rate,
        per: unit,
        discPercent: '',
        amount: amt
      };
    });

    const roundInvoiceItems = (sheet.roundLogItems || []).map((it, idx) => ({
      slNo: idx + 1,
      description: `Log ${it.serialNumber || idx + 1}: ${it.girthFtInStr ? `G: ${it.girthFtInStr}` : `G: ${it.girth}"`} × L: ${it.length}'${it.slabLabel ? ` [${it.slabLabel}]` : ''}`,
      woodType: it.woodType || 'ROUND LOG',
      hsn: '4403',
      cft: roundLogOutputUnit === 'CFT' ? (it.volume || 0) : (it.cft || (it.volume || 0) * 35.3147),
      pieces: Number(it.pieces) || 1,
      rate: typeof it.rate === 'number' ? it.rate : 0,
      per: roundLogOutputUnit,
      discPercent: '',
      amount: it.amount || 0
    }));

    const effectiveTotal = (computed.totalAmount && computed.totalAmount > 0) ? computed.totalAmount : (sheet.finalGrandTotal || computed.totalCft * rateDefault);

    return {
      voucherType: sheet.voucherType || 'sales',
      customerName: sheet.customerName || undefined,
      logType: sheet.logType || 'cut',
      roundLogOutputUnit: sheet.roundLogOutputUnit,
      roundLogInputUnit: sheet.roundLogInputUnit,
      roundLogItems: sheet.roundLogItems,
      roundLogSlabRates: sheet.roundLogSlabRates,
      invoiceNo: sheet.referenceNumber ? sheet.referenceNumber.replace('REF-', '') : '8',
      invoiceDate: sheet.measurementDate,
      paymentTerms: sheet.paymentTerms,
      buyerOrderNo: sheet.buyerOrderNo,
      buyerOrderDate: sheet.buyerOrderDate,
      destination: sheet.destination || sheet.consigneeDistrict || sheet.customerState || 'Karnataka',
      motorVehicleNo: sheet.motorVehicleNo,
      termsOfDelivery: sheet.termsOfDelivery,
      consigneeName: sheet.consigneeName || sheet.customerName || '',
      consigneePhone: sheet.consigneePhone || sheet.customerPhone || '',
      consigneeAddress: sheet.consigneeAddress || sheet.customerAddress || '',
      consigneeGstin: sheet.consigneeGstin || sheet.customerGstin || '',
      consigneeState: sheet.consigneeState || sheet.customerState || 'Karnataka',
      consigneeStateCode: sheet.consigneeStateCode || sheet.customerStateCode || '29',
      buyerName: sheet.customerName || sheet.consigneeName || '',
      buyerPhone: sheet.customerPhone || sheet.consigneePhone || '',
      buyerAddress: sheet.customerAddress || sheet.consigneeAddress || '',
      buyerGstin: sheet.customerGstin || sheet.consigneeGstin || '',
      buyerState: sheet.customerState || sheet.consigneeState || 'Karnataka',
      buyerStateCode: sheet.customerStateCode || sheet.consigneeStateCode || '29',
      additionalCharges: sheet.additionalCharges,
      discountAmount: sheet.discount?.amount || 0,
      discountDesc: sheet.discount?.type === 'percentage' ? `${sheet.discount.value}%` : undefined,
      gstPercent: sheet.gstPercent,
      finalGrandTotal: effectiveTotal,
      advanceAmount: sheet.advanceAmount || 0,
      items: isRoundLog ? roundInvoiceItems : cutInvoiceItems
    };
  }, [sheet, businessSettings]);

  useEffect(() => {
    if (!sheet || !resolvedExportData) return;

    const { blob, filename } = getProformaInvoicePdfBlob(sheet, businessSettings, resolvedExportData);
    const url = URL.createObjectURL(blob);

    const pdfTitle = filename.replace(/\.pdf$/i, '');
    if (typeof document !== 'undefined' && pdfTitle) {
      document.title = pdfTitle;
    }

    // Open the raw PDF directly in the browser PDF viewer on Desktop & iOS so native browser Print prints the exact original PDF
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    const isAndroid = /Android/i.test(ua);
    let redirectAttempted = false;

    if (!isAndroid && typeof window !== 'undefined') {
      didRedirectRef.current = true;
      redirectAttempted = true;
      try {
        window.location.replace(url);
      } catch {
        didRedirectRef.current = false;
        redirectAttempted = false;
      }
    }

    const uiTimer = setTimeout(() => {
      setPdfUrl(url);
      setPdfFilename(filename);
      setShowFallback(true);
    }, redirectAttempted ? 2000 : 0);

    return () => {
      clearTimeout(uiTimer);
      if (!didRedirectRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, [sheet, resolvedExportData, businessSettings]);

  const triggerPdfBlobDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadPdf = () => {
    if (pdfUrl) {
      triggerPdfBlobDownload(pdfUrl, pdfFilename);
      return;
    }
    if (!sheet || !resolvedExportData) return;
    const { blob, filename } = getProformaInvoicePdfBlob(sheet, businessSettings, resolvedExportData);
    const url = URL.createObjectURL(blob);
    triggerPdfBlobDownload(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handlePrint = () => {
    if (!sheet || !resolvedExportData) return;
    printProformaInvoicePdf(sheet, businessSettings, resolvedExportData);
  };

  if (loading || (!error && sheet && resolvedExportData && !showFallback)) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#ffffff',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '1.5rem'
      }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: '#38bdf8',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '1rem'
        }} />
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Opening Invoice PDF...</h2>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.84rem', color: '#94a3b8' }}>
          Hindustan Saw Mill &amp; Wood Industries
        </p>
      </div>
    );
  }

  if (error || !sheet || !resolvedExportData) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1.5rem',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <div style={{
          maxWidth: '420px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 25px rgba(0,0,0,0.06)'
        }}>
          <AlertCircle size={42} color="#dc2626" style={{ margin: '0 auto 0.75rem' }} />
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
            Invoice Unavailable
          </h2>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', lineHeight: 1.5 }}>
            {error || 'This invoice link is invalid or has expired.'}
          </p>
        </div>
      </div>
    );
  }

  const grandTotal = resolvedExportData.finalGrandTotal || sheet.finalGrandTotal || 0;

  // Mobile / Android / Fallback screen when browser cannot navigate directly to an inline blob PDF viewer
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '1.5rem',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '1.75rem 1.5rem',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0,0,0,0.35)'
      }}>
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '12px',
          backgroundColor: '#fef2f2',
          color: '#dc2626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1rem'
        }}>
          <FileText size={26} />
        </div>
        <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
          {sheet.customerName || 'Proforma Invoice PDF'}
        </h2>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.86rem', color: '#64748b' }}>
          Invoice #{resolvedExportData.invoiceNo} &bull; <strong>₹{formatIndianCurrency(grandTotal)}</strong>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <button
            type="button"
            onClick={handleDownloadPdf}
            style={{
              width: '100%',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '0.8rem 1rem',
              fontSize: '0.92rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem'
            }}
          >
            <FileDown size={18} />
            <span>Open / Download PDF ({pdfFilename})</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            style={{
              width: '100%',
              backgroundColor: '#f1f5f9',
              color: '#0f172a',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem'
            }}
          >
            <Printer size={17} />
            <span>Print Original PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
