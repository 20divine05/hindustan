import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, RotateCcw, Copy, Sparkles, FileText, Check, FileDown } from 'lucide-react';
import type { MeasurementSheet, BusinessSettings } from '../types';
import { numberToIndianCurrencyWords, formatIndianCurrency } from '../utils/indianNumberWords';
import { PAYMENT_QR_BASE64 } from '../utils/paymentQrBase64';
import { exportSheetToPdf, printProformaInvoicePdf } from '../utils/exportPdf';
import { renderDimensionHtml, renderWithSmallDecimalHtml } from './PrintableProformaInvoice';
import './ProformaInvoice.css';

export interface ProformaInvoiceProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: MeasurementSheet | null;
  businessSettings?: BusinessSettings;
}

export interface InvoiceItemRow {
  slNo: number;
  description: string;
  hsn: string;
  cft: number;
  sqft?: number;
  widthInches?: number;
  rateUnit?: 'CFT' | 'SQFT';
  pieces: number;
  rate: number;
  per: string;
  discPercent: string;
  amount: number;
}

const STORAGE_KEY = 'timberpro_invoice_meta_draft';

function formatToInvoiceDate(dateStr?: string): string {
  try {
    const d = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  } catch {
    return '';
  }
}

// Sample from photo for quick reference
const SAMPLE_PHOTO_ITEMS: InvoiceItemRow[] = [
  { slNo: 1, description: '9X5X3 MAHAGONY', hsn: '4407', cft: 9.3750, pieces: 10, rate: 1200.00, per: 'CFT', discPercent: '', amount: 11250.00 },
  { slNo: 2, description: '8X5X3 MAHAGONY', hsn: '4407', cft: 41.6650, pieces: 50, rate: 1200.00, per: 'CFT', discPercent: '', amount: 49998.00 },
  { slNo: 3, description: '7X5X3 MAHAGONY', hsn: '4407', cft: 364.5500, pieces: 500, rate: 1200.00, per: 'CFT', discPercent: '', amount: 437460.00 },
  { slNo: 4, description: '6X5X3 MAHAGONY', hsn: '4407', cft: 15.6250, pieces: 25, rate: 1200.00, per: 'CFT', discPercent: '', amount: 18750.00 },
  { slNo: 5, description: '5X5X3 MAHAGONY', hsn: '4407', cft: 13.0200, pieces: 25, rate: 1200.00, per: 'CFT', discPercent: '', amount: 15624.00 },
  { slNo: 6, description: '4X5X3 MAHAGONY', hsn: '4407', cft: 31.2450, pieces: 75, rate: 1200.00, per: 'CFT', discPercent: '', amount: 37494.00 },
  { slNo: 7, description: '4.5X5X3 MAHAGONY', hsn: '4407', cft: 35.1525, pieces: 75, rate: 1200.00, per: 'CFT', discPercent: '', amount: 42183.00 },
  { slNo: 8, description: '3.5X5X3 MAHAGONY', hsn: '4407', cft: 9.1125, pieces: 25, rate: 1200.00, per: 'CFT', discPercent: '', amount: 10935.00 },
  { slNo: 9, description: '3X5X3 MAHAGONY', hsn: '4407', cft: 4.6875, pieces: 15, rate: 1200.00, per: 'CFT', discPercent: '', amount: 5625.00 },
  { slNo: 10, description: '7X6X4 MAHAGONY', hsn: '4407', cft: 34.9980, pieces: 30, rate: 1250.00, per: 'CFT', discPercent: '', amount: 43747.50 },
  { slNo: 11, description: '8X6X4 MAHAGONY', hsn: '4407', cft: 39.9900, pieces: 30, rate: 1250.00, per: 'CFT', discPercent: '', amount: 49987.50 }
];

export const ProformaInvoiceModal: React.FC<ProformaInvoiceProps> = ({
  isOpen,
  onClose,
  sheet,
  businessSettings
}) => {
  const [useSampleData, setUseSampleData] = useState(false);
  const [copiedShipTo, setCopiedShipTo] = useState(false);

  // Initialize editable fields with sensible blanks or sheet data
  const initialInvoiceNo = sheet?.referenceNumber?.replace('REF-', '') || '';
  const initialInvoiceDate = formatToInvoiceDate(sheet?.measurementDate);

  const savedDraft = useMemo(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, []);

  // All metadata fields are direct state, ready for the user to type in
  const [invoiceNo, setInvoiceNo] = useState(initialInvoiceNo);
  const [eWayBillNo, setEWayBillNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(initialInvoiceDate);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(savedDraft.paymentTerms || '');
  const [refNoAndDate, setRefNoAndDate] = useState(sheet?.referenceNumber || '');
  const [otherReferences, setOtherReferences] = useState('');
  const [buyerOrderNo, setBuyerOrderNo] = useState('');
  const [buyerOrderDate, setBuyerOrderDate] = useState('');
  const [dispatchDocNo, setDispatchDocNo] = useState('');
  const [deliveryNoteDate, setDeliveryNoteDate] = useState('');
  const [dispatchedThrough, setDispatchedThrough] = useState(savedDraft.dispatchedThrough || '');
  const [destination, setDestination] = useState('');
  const [billOfLadingNo, setBillOfLadingNo] = useState('');
  const [motorVehicleNo, setMotorVehicleNo] = useState('');
  const [termsOfDelivery, setTermsOfDelivery] = useState(savedDraft.termsOfDelivery || '');

  // Consignee (Ship to)
  const [consigneeName, setConsigneeName] = useState(sheet?.customerName || '');
  const [consigneeAddress, setConsigneeAddress] = useState(sheet?.customerAddress || '');
  const [consigneeGstin, setConsigneeGstin] = useState(sheet?.customerGstin || '29CJZPK3158H1ZG');
  const [consigneeState, setConsigneeState] = useState(sheet?.customerState || 'Karnataka');
  const [consigneeStateCode, setConsigneeStateCode] = useState(sheet?.customerStateCode || '29');

  // Buyer (Bill to)
  const [buyerName, setBuyerName] = useState(sheet?.customerName || '');
  const [buyerAddress, setBuyerAddress] = useState(sheet?.customerAddress || '');
  const [buyerGstin, setBuyerGstin] = useState(sheet?.customerGstin || '29CJZPK3158H1ZG');
  const [buyerState, setBuyerState] = useState(sheet?.customerState || 'Karnataka');
  const [buyerStateCode, setBuyerStateCode] = useState(sheet?.customerStateCode || '29');

  // Default global rate per CFT
  const [globalRate, setGlobalRate] = useState<number>(businessSettings?.ratePerCft || 1200);

  // Custom per-item rates map: index -> rate
  const [customRates, setCustomRates] = useState<Record<number, number>>({});
  // Custom per-item HSN map: index -> HSN
  const [customHsn, setCustomHsn] = useState<Record<number, string>>({});
  // Custom per-item discount map: index -> discount
  const [customDisc, setCustomDisc] = useState<Record<number, string>>({});

  // Save changes to localStorage draft
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          paymentTerms,
          dispatchedThrough,
          termsOfDelivery
        })
      );
    } catch {
      // ignore
    }
  }, [paymentTerms, dispatchedThrough, termsOfDelivery]);

  // One-click copy Consignee to Buyer
  const handleCopyShipToBillTo = () => {
    setBuyerName(consigneeName);
    setBuyerAddress(consigneeAddress);
    setBuyerGstin(consigneeGstin);
    setBuyerState(consigneeState);
    setBuyerStateCode(consigneeStateCode);
    setCopiedShipTo(true);
    setTimeout(() => setCopiedShipTo(false), 2000);
  };

  // Reset to clean blank fields
  const handleClearAllFields = () => {
    setInvoiceNo('');
    setEWayBillNo('');
    setInvoiceDate(formatToInvoiceDate());
    setDeliveryNote('');
    setPaymentTerms('');
    setRefNoAndDate('');
    setOtherReferences('');
    setBuyerOrderNo('');
    setBuyerOrderDate('');
    setDispatchDocNo('');
    setDeliveryNoteDate('');
    setDispatchedThrough('');
    setDestination('');
    setBillOfLadingNo('');
    setMotorVehicleNo('');
    setTermsOfDelivery('');
    setConsigneeName('');
    setConsigneeAddress('');
    setConsigneeGstin('');
    setConsigneeState('');
    setConsigneeStateCode('');
    setBuyerName('');
    setBuyerAddress('');
    setBuyerGstin('');
    setBuyerState('');
    setBuyerStateCode('');
    setCustomRates({});
    setCustomHsn({});
    setCustomDisc({});
    setUseSampleData(false);
  };

  // Load photo sample
  const handleLoadPhotoSample = () => {
    setInvoiceNo('8');
    setEWayBillNo('');
    setInvoiceDate('26-Oct-26');
    setDeliveryNote('');
    setPaymentTerms('IMMIDIEATE PAYMENT');
    setRefNoAndDate('');
    setOtherReferences('');
    setBuyerOrderNo('');
    setBuyerOrderDate('');
    setDispatchDocNo('');
    setDeliveryNoteDate('');
    setDispatchedThrough('ROAD');
    setDestination('BANGLORE');
    setBillOfLadingNo('dt. 26-Oct-26');
    setMotorVehicleNo('');
    setTermsOfDelivery('TRANSPORTATION EXTRA\nAPPLICABLE GST EXTRA');

    const sampleAddr = 'Sy.No.10/7 Khata No.27/2/100/10/7, Sir M\nVishveshwaraiah Layout, 3rd Block, Bengaluru, Near\nNammoora Thindi, Bengaluru Urban';
    setConsigneeName('New India Saw Mill');
    setConsigneeAddress(sampleAddr);
    setConsigneeGstin('29CJZPK3158H1ZG');
    setConsigneeState('Karnataka');
    setConsigneeStateCode('29');

    setBuyerName('New India Saw Mill');
    setBuyerAddress(sampleAddr);
    setBuyerGstin('29CJZPK3158H1ZG');
    setBuyerState('Karnataka');
    setBuyerStateCode('29');

    setGlobalRate(1200);
    setUseSampleData(true);
  };

  // Build items list from active tally sheet (or sample)
  const invoiceItems: InvoiceItemRow[] = useMemo(() => {
    if (useSampleData || !sheet || !sheet.items || sheet.items.length === 0) {
      if (useSampleData) {
        return SAMPLE_PHOTO_ITEMS;
      }
    }

    const sourceItems = sheet?.items && sheet.items.length > 0 ? sheet.items : [];

    return sourceItems
      .filter((it) => (typeof it.lengthFeet === 'number' && it.lengthFeet > 0 && typeof it.pieces === 'number' && it.pieces > 0))
      .map((it, idx) => {
        const l = it.lengthFeet;
        const w = typeof it.widthInches === 'number' ? it.widthInches : 0;
        const t = it.thicknessInches;
        const isSqftBilled = (typeof w === 'number' ? w : 0) >= 7 && it.rateUnit !== 'CFT';
        const defaultItemRate = isSqftBilled ? 120 : globalRate;
        const itemRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultItemRate;
        const rate = customRates[idx] ?? itemRate;
        const hsn = customHsn[idx] ?? '4407';
        const disc = customDisc[idx] ?? '';
        const wood = (it.woodType || 'TIMBER').toUpperCase();
        const desc = `${l}X${w}X${t} ${wood}`;
        const cft = it.cft;
        const sqft = it.sqft || (it.cft * 12);
        const pcs = typeof it.pieces === 'number' ? it.pieces : 0;
        const multiplier = isSqftBilled ? sqft : cft;
        const amount = Math.round(multiplier * rate * 100) / 100;

        return {
          slNo: idx + 1,
          description: desc,
          hsn,
          cft,
          sqft,
          widthInches: w,
          rateUnit: it.rateUnit,
          pieces: pcs,
          rate,
          per: isSqftBilled ? 'SQFT' : 'CFT',
          discPercent: disc,
          amount
        };
      });
  }, [sheet, useSampleData, customRates, customHsn, customDisc, globalRate]);

  // Aggregate Totals
  const { totalCft, totalSqft, totalPieces, totalAmount, totalCftBilled, totalSqftBilled } = useMemo(() => {
    let cftSum = 0;
    let sqftSum = 0;
    let pcsSum = 0;
    let amtSum = 0;
    let cftBilled = 0;
    let sqftBilled = 0;

    for (const it of invoiceItems) {
      cftSum += it.cft;
      sqftSum += (it.sqft || (it.cft * 12));
      pcsSum += it.pieces;
      amtSum += it.amount;
      if (it.rateUnit !== 'CFT' && (it.widthInches || 0) >= 7) {
        sqftBilled += (it.sqft || (it.cft * 12));
      } else {
        cftBilled += it.cft;
      }
    }

    return {
      totalCft: cftSum,
      totalSqft: sqftSum,
      totalPieces: pcsSum,
      totalAmount: amtSum,
      totalCftBilled: cftBilled,
      totalSqftBilled: sqftBilled
    };
  }, [invoiceItems]);

  const ac = sheet?.additionalCharges;
  const totalCarpentryWorks = (ac?.carpentry || 0) + (ac?.sawing || 0);
  const totalTransportation = ac?.transportation || 0;
  const totalPlaning = ac?.planing || 0;
  const totalOther = ac?.other || 0;
  const additionalChargesSum = totalCarpentryWorks + totalTransportation + totalPlaning + totalOther;
  const discAmount = sheet?.discount?.amount || 0;
  const gstAmount = sheet?.gstPercent ? Math.round(((totalAmount + additionalChargesSum - discAmount) * (sheet.gstPercent / 100)) * 100) / 100 : 0;
  const computedFallback = Math.max(0, totalAmount + additionalChargesSum - discAmount + gstAmount);
  const effectiveTotal = (sheet?.finalGrandTotal && sheet.finalGrandTotal > 0)
    ? sheet.finalGrandTotal
    : (computedFallback > 0 ? computedFallback : totalAmount);

  const amountInWords = useMemo(() => {
    return numberToIndianCurrencyWords(effectiveTotal);
  }, [effectiveTotal]);

  // Group invoice items by wood type while preserving sequential order
  const woodGroups = useMemo(() => {
    const groups: Array<{ wood: string; items: InvoiceItemRow[] }> = [];
    const map = new Map<string, InvoiceItemRow[]>();

    for (const it of invoiceItems) {
      let wood = 'MAHAGONY';
      const parts = it.description.trim().split(/\s+/);
      if (parts.length > 1) {
        wood = parts.slice(1).join(' ').toUpperCase();
      }
      if (!map.has(wood)) {
        const arr: InvoiceItemRow[] = [];
        map.set(wood, arr);
        groups.push({ wood, items: arr });
      }
      map.get(wood)!.push(it);
    }

    // Sort items within each wood group strictly by mill specification: Width Asc -> Length Desc -> Thickness Desc
    for (const group of groups) {
      group.items.sort((a, b) => {
        const parseDims = (item: InvoiceItemRow) => {
          let w = typeof item.widthInches === 'number' ? item.widthInches : 0;
          let l = 0;
          let t = 0;
          if (item.description) {
            const match = item.description.match(/^([\d.]+)[X|x]([\d.]+)[X|x]([\d.]+)/);
            if (match) {
              l = parseFloat(match[1]) || 0;
              if (!w) w = parseFloat(match[2]) || 0;
              t = parseFloat(match[3]) || 0;
            }
          }
          return { w, l, t };
        };
        const dA = parseDims(a);
        const dB = parseDims(b);
        if (dA.w !== dB.w) return dA.w - dB.w;
        if (dA.t !== dB.t) return dB.t - dA.t;
        if (dA.l !== dB.l) return dB.l - dA.l;
        return (b.pieces || 0) - (a.pieces || 0);
      });
    }

    return groups;
  }, [invoiceItems]);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('proforma-modal-open');
    } else {
      document.body.classList.remove('proforma-modal-open');
    }
    return () => {
      document.body.classList.remove('proforma-modal-open');
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownloadPdf = () => {
    if (!sheet) return;
    exportSheetToPdf(sheet, businessSettings, {
      invoiceNo,
      eWayBillNo,
      invoiceDate,
      deliveryNote,
      paymentTerms,
      refNoAndDate,
      otherReferences,
      buyerOrderNo,
      buyerOrderDate,
      dispatchDocNo,
      deliveryNoteDate,
      dispatchedThrough,
      destination,
      billOfLadingNo,
      motorVehicleNo,
      termsOfDelivery,
      consigneeName,
      consigneeAddress,
      consigneeGstin,
      consigneeState,
      consigneeStateCode,
      buyerName,
      buyerAddress,
      buyerGstin,
      buyerState,
      buyerStateCode,
      items: invoiceItems,
      additionalCharges: sheet.additionalCharges,
      discountAmount: discAmount,
      discountDesc: sheet.discount?.type === 'percentage' ? `${sheet.discount.value}%` : undefined,
      gstPercent: sheet.gstPercent,
      gstAmount: gstAmount,
      finalGrandTotal: effectiveTotal
    });
  };

  const handlePrint = () => {
    if (!sheet) return;
    printProformaInvoicePdf(sheet, businessSettings, {
      invoiceNo,
      eWayBillNo,
      invoiceDate,
      deliveryNote,
      paymentTerms,
      refNoAndDate,
      otherReferences,
      buyerOrderNo,
      buyerOrderDate,
      dispatchDocNo,
      deliveryNoteDate,
      dispatchedThrough,
      destination,
      billOfLadingNo,
      motorVehicleNo,
      termsOfDelivery,
      consigneeName,
      consigneeAddress,
      consigneeGstin,
      consigneeState,
      consigneeStateCode,
      buyerName,
      buyerAddress,
      buyerGstin,
      buyerState,
      buyerStateCode,
      items: invoiceItems,
      additionalCharges: sheet.additionalCharges,
      discountAmount: discAmount,
      discountDesc: sheet.discount?.type === 'percentage' ? `${sheet.discount.value}%` : undefined,
      gstPercent: sheet.gstPercent,
      gstAmount: gstAmount,
      finalGrandTotal: effectiveTotal
    });
  };

  return createPortal(
    <div className="proforma-modal-overlay">
      {/* Top Floating Control Bar (Hidden in Print) */}
      <div className="proforma-toolbar no-print">
        <div className="proforma-toolbar-left">
          <FileText size={20} className="text-emerald-400" />
          <span className="proforma-toolbar-title">
            Proforma Invoice &bull; Direct In-Place Editing
          </span>
          <span className="badge badge-connected" style={{ marginLeft: '6px' }}>
            A4 Print-Ready
          </span>
        </div>

        <div className="proforma-toolbar-right">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyShipToBillTo}
            title="Copy Consignee details to Buyer"
          >
            {copiedShipTo ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copiedShipTo ? 'Copied!' : 'Ship to ➔ Bill to'}
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleLoadPhotoSample}
            title="Load sample photo data (New India Saw Mill, 11 Mahogany items)"
          >
            <Sparkles size={14} /> Sample
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleClearAllFields}
            title="Clear all fields to blank"
          >
            <RotateCcw size={14} /> Clear
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleDownloadPdf}
            title="Download PDF Invoice matching official format"
            style={{ fontWeight: 700 }}
          >
            <FileDown size={15} /> Download PDF
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handlePrint}
            title="Print or Save as PDF via Browser"
          >
            <Printer size={15} /> Print / System PDF
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            title="Close Preview"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main Printable A4 Document Container */}
      <div className="proforma-document-container">
        <div className="proforma-box">

          {/* 1. Header Box */}
          <div className="p-header-title">
            PROFORMA INVOICE
          </div>

          {/* 2. Top Grid: Left (Seller + Consignee + Buyer) | Right (Dispatch Table) */}
          <div className="p-top-grid">
            
            {/* Left Column (50%) */}
            <div className="p-left-col">
              {/* Seller Sub-box */}
              <div className="p-seller-box">
                <div className="p-seller-logo">
                  <img
                    src="/logo-icon-transparent.png"
                    alt="Logo"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/logo-icon.png';
                    }}
                  />
                </div>
                <div className="p-seller-details">
                  <div className="p-seller-name">
                    {businessSettings?.companyName || 'HINDUSTAN SAW MILLS AND WOOD INDUSTRIES'}
                  </div>
                  <div className="p-seller-line">#99/C INDUSTRIAL SUBURB 2ND STAGE</div>
                  <div className="p-seller-line">VISHVESHWARA NAGAR MYSORE - 570008</div>
                  <div className="p-seller-line">ACCOUNTS DEPARTMENT - 7996222901</div>
                  <div className="p-seller-line">
                    <strong>GSTIN/UIN:</strong> 29APYPK6256P1ZL
                  </div>
                  <div className="p-seller-line">
                    State Name : Karnataka, Code : 29
                  </div>
                  <div className="p-seller-line">
                    E-Mail : hindustansawmill@gmail.com
                  </div>
                </div>
              </div>

              {/* Consignee (Ship to) - Editable In-Place */}
              <div className="p-party-box">
                <div className="p-party-heading">Consignee (Ship to)</div>
                <input
                  type="text"
                  className="p-input p-party-name-input"
                  value={consigneeName}
                  onChange={(e) => setConsigneeName(e.target.value)}
                />
                <textarea
                  className="p-input p-party-addr-input no-print"
                  rows={3}
                  value={consigneeAddress}
                  onChange={(e) => setConsigneeAddress(e.target.value)}
                />
                <div className="print-only p-print-preline">{consigneeAddress}</div>
                <div className="p-party-meta">
                  <span className="p-party-meta-label">GSTIN/UIN</span>
                  <span className="p-party-meta-separator">: </span>
                  <input
                    type="text"
                    className="p-input p-party-meta-input"
                    value={consigneeGstin}
                    onChange={(e) => setConsigneeGstin(e.target.value)}
                  />
                </div>
                <div className="p-party-meta">
                  <span className="p-party-meta-label">State Name</span>
                  <span className="p-party-meta-separator">: </span>
                  <input
                    type="text"
                    className="p-input p-party-meta-input"
                    value={consigneeState}
                    onChange={(e) => setConsigneeState(e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <span style={{ margin: '0 4px', alignSelf: 'center', fontSize: '8.5px' }}>Code:</span>
                  <input
                    type="text"
                    className="p-input p-party-meta-input"
                    value={consigneeStateCode}
                    onChange={(e) => setConsigneeStateCode(e.target.value)}
                    style={{ width: '38px', textAlign: 'center' }}
                  />
                </div>
              </div>

              {/* Buyer (Bill to) - Editable In-Place */}
              <div className="p-party-box" style={{ borderBottom: 'none' }}>
                <div className="p-party-heading">Buyer (Bill to)</div>
                <input
                  type="text"
                  className="p-input p-party-name-input"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                />
                <textarea
                  className="p-input p-party-addr-input no-print"
                  rows={3}
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value)}
                />
                <div className="print-only p-print-preline">{buyerAddress}</div>
                <div className="p-party-meta">
                  <span className="p-party-meta-label">GSTIN/UIN</span>
                  <span className="p-party-meta-separator">: </span>
                  <input
                    type="text"
                    className="p-input p-party-meta-input"
                    value={buyerGstin}
                    onChange={(e) => setBuyerGstin(e.target.value)}
                  />
                </div>
                <div className="p-party-meta">
                  <span className="p-party-meta-label">State Name</span>
                  <span className="p-party-meta-separator">: </span>
                  <input
                    type="text"
                    className="p-input p-party-meta-input"
                    value={buyerState}
                    onChange={(e) => setBuyerState(e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <span style={{ margin: '0 4px', alignSelf: 'center', fontSize: '8.5px' }}>Code:</span>
                  <input
                    type="text"
                    className="p-input p-party-meta-input"
                    value={buyerStateCode}
                    onChange={(e) => setBuyerStateCode(e.target.value)}
                    style={{ width: '38px', textAlign: 'center' }}
                  />
                </div>
              </div>
            </div>

            {/* Right Column (50%): Metadata Grid Table - Direct Inputs */}
            <div className="p-right-col">
              {/* Row 1: Invoice No | e-Way Bill No | Dated */}
              <div className="p-meta-grid-row cols-3">
                <div className="p-meta-cell">
                  <span className="p-label">Invoice No.</span>
                  <input
                    type="text"
                    className="p-input p-val-input"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                  />
                </div>
                <div className="p-meta-cell">
                  <span className="p-label">e-Way Bill No.</span>
                  <input
                    type="text"
                    className="p-input p-val-input"
                    value={eWayBillNo}
                    onChange={(e) => setEWayBillNo(e.target.value)}
                  />
                </div>
                <div className="p-meta-cell">
                  <span className="p-label">Dated</span>
                  <input
                    type="text"
                    className="p-input p-val-input"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 2: Mode/Terms of Payment | Destination */}
              <div className="p-meta-grid-row cols-2">
                <div className="p-meta-cell">
                  <span className="p-label">Mode/Terms of Payment</span>
                  <input
                    type="text"
                    className="p-input p-val-input"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  />
                </div>
                <div className="p-meta-cell">
                  <span className="p-label">Destination</span>
                  <input
                    type="text"
                    className="p-input p-val-input"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 3: Buyer's Order No. | Dated */}
              <div className="p-meta-grid-row cols-2">
                <div className="p-meta-cell">
                  <span className="p-label">Buyer's Order No.</span>
                  <input
                    type="text"
                    className="p-input p-val-input"
                    value={buyerOrderNo}
                    onChange={(e) => setBuyerOrderNo(e.target.value)}
                  />
                </div>
                <div className="p-meta-cell">
                  <span className="p-label">Dated</span>
                  <input
                    type="text"
                    className="p-input p-val-input"
                    value={buyerOrderDate}
                    onChange={(e) => setBuyerOrderDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 4: Motor Vehicle No. */}
              <div className="p-meta-grid-row full">
                <div className="p-meta-cell">
                  <span className="p-label">Motor Vehicle No.</span>
                  <input
                    type="text"
                    className="p-input p-val-input"
                    value={motorVehicleNo}
                    onChange={(e) => setMotorVehicleNo(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 5: Terms of Delivery (Expanded Big Column) */}
              <div className="p-meta-grid-row full" style={{ borderBottom: 'none', flex: 1, minHeight: '52px' }}>
                <div className="p-meta-cell" style={{ flex: 1, padding: '5px 8px' }}>
                  <span className="p-label" style={{ fontWeight: 700, fontSize: '8.5px', color: '#222' }}>Terms of Delivery</span>
                  <textarea
                    className="p-input p-val-textarea no-print"
                    rows={4}
                    value={termsOfDelivery}
                    onChange={(e) => setTermsOfDelivery(e.target.value)}
                    style={{ minHeight: '44px', fontSize: '9.2px', lineHeight: 1.45, fontWeight: 600 }}
                  />
                  <div className="print-only p-print-preline" style={{ fontWeight: 700, fontSize: '9px', lineHeight: 1.45 }}>{termsOfDelivery}</div>
                </div>
              </div>
            </div>

          </div>

          {/* 3. Items Table */}
          <div className="p-table-container">
            <table className="p-items-table">
              <thead>
                <tr>
                  <th style={{ width: '4%' }}>Sl<br />No.</th>
                  <th style={{ width: '32%', textAlign: 'left', paddingLeft: '8px' }}>Description of Goods</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>Quantity</th>
                  <th style={{ width: '13%', textAlign: 'right' }}>Alt. Quantity</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>SQFT</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>Rate</th>
                  <th style={{ width: '6%', textAlign: 'center', whiteSpace: 'nowrap' }}>per</th>
                  <th style={{ width: '12%', textAlign: 'left', paddingLeft: '8px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {woodGroups.map((group, gIdx) => {
                  const groupPieces = group.items.reduce((acc, it) => acc + (typeof it.pieces === 'number' ? it.pieces : 0), 0);
                  const groupCft = group.items.reduce((acc, it) => acc + (typeof it.cft === 'number' ? it.cft : 0), 0);
                  const groupAmount = group.items.reduce((acc, it) => acc + (typeof it.amount === 'number' ? it.amount : 0), 0);
                  const groupCftBilled = group.items.filter(it => !(it.rateUnit === 'SQFT' && (it.widthInches || 0) >= 7)).reduce((acc, it) => acc + (typeof it.cft === 'number' ? it.cft : 0), 0);
                  const groupSqftBilled = group.items.filter(it => it.rateUnit === 'SQFT' && (it.widthInches || 0) >= 7).reduce((acc, it) => acc + (typeof it.sqft === 'number' ? it.sqft : (it.cft * 12)), 0);

                  return (
                    <React.Fragment key={`wood-grp-${gIdx}`}>
                      {/* Wood Species Heading (no dots, continuous vertical borders) */}
                      <tr className="p-wood-heading-row">
                        <td></td>
                        <td className="p-wood-heading-desc">
                          {group.wood.toUpperCase()}
                        </td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>

                      {/* Measurements of that wood */}
                      {group.items.map((item, itemIdx) => {
                        const dimOnly = item.description.split(/\s+/)[0] || item.description;
                        const originalIdx = item.slNo - 1;
                        const isSqftBilled = item.rateUnit !== 'CFT' && (item.widthInches || 0) >= 7;
                        const slStr = item.slNo < 10 ? `0${item.slNo}` : item.slNo;
                        return (
                          <tr key={item.slNo} className={`p-item-row ${itemIdx % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                            <td className="text-center">{slStr}</td>
                            <td className="p-item-desc" style={{ paddingLeft: '8px', fontWeight: 700 }}>
                              {renderDimensionHtml(dimOnly)}
                            </td>
                            <td className="text-right p-mono">{item.pieces} PCS</td>
                            <td className="text-right p-mono">{renderWithSmallDecimalHtml(isSqftBilled ? '' : `${item.cft.toFixed(4)} CFT`)}</td>
                            <td className="text-right p-mono">{renderWithSmallDecimalHtml(isSqftBilled ? `${(item.sqft || item.cft * 12).toFixed(2)} SQFT` : '')}</td>
                            <td className="text-right p-mono">
                              <input
                                type="number"
                                className="p-input text-right p-mono"
                                value={item.rate}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setCustomRates((prev) => ({ ...prev, [originalIdx]: val }));
                                }}
                              />
                            </td>
                            <td className="text-center" style={{ whiteSpace: 'nowrap' }}>{item.per}</td>
                            <td className="text-left p-mono font-bold" style={{ paddingLeft: '8px' }}>
                              {renderWithSmallDecimalHtml(formatIndianCurrency(item.amount))}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Wood Subtotal Row (Total without wood species name) */}
                      <tr className="p-item-row" style={{ backgroundColor: '#f3f4f6', borderTop: '1px solid #222222', borderBottom: '1px solid #222222', fontWeight: 700 }}>
                        <td className="text-center" style={{ color: '#888' }}></td>
                        <td className="p-item-desc" style={{ paddingLeft: '8px', fontWeight: 800, textTransform: 'uppercase' }}>
                          Total
                        </td>
                        <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                          {groupPieces} PCS
                        </td>
                        <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                          {renderWithSmallDecimalHtml(groupCftBilled > 0 ? `${groupCftBilled.toFixed(4)} CFT` : (groupCft > 0 ? `${groupCft.toFixed(4)} CFT` : ''))}
                        </td>
                        <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                          {renderWithSmallDecimalHtml(groupSqftBilled > 0 ? `${groupSqftBilled.toFixed(2)} SQFT` : '')}
                        </td>
                        <td className="text-right p-mono"></td>
                        <td className="text-center"></td>
                        <td className="text-right p-mono" style={{ fontWeight: 800, paddingRight: '8px' }}>
                          {renderWithSmallDecimalHtml(formatIndianCurrency(groupAmount), 'Rs. ')}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}

                {/* Combined Total Wood Amount row at the end */}
                {totalPieces > 0 && (
                  <tr className="p-total-wood-row">
                    <td className="text-center" style={{ color: '#444' }}></td>
                    <td className="p-item-desc" style={{ paddingLeft: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      TOTAL WOOD AMOUNT
                    </td>
                    <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                      {totalPieces} PCS
                    </td>
                    <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                      {renderWithSmallDecimalHtml(totalCftBilled > 0 ? `${totalCftBilled.toFixed(4)} CFT` : `${totalCft.toFixed(4)} CFT`)}
                    </td>
                    <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                      {renderWithSmallDecimalHtml(totalSqftBilled > 0 ? `${totalSqftBilled.toFixed(2)} SQFT` : '')}
                    </td>
                    <td className="text-right p-mono"></td>
                    <td className="text-center"></td>
                    <td className="text-right p-mono" style={{ fontWeight: 800, paddingRight: '8px' }}>
                      {renderWithSmallDecimalHtml(formatIndianCurrency(totalAmount), 'Rs. ')}
                    </td>
                  </tr>
                )}

                {/* Additional Charges and Discount rows with zebra striping */}
                {(() => {
                  let chargeIdx = 0;
                  return (
                    <>
                      {/* 1. Next: Planing Charges immediately after wood */}
                      {totalPlaning > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            PLANING CHARGES
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(totalPlaning))}
                          </td>
                        </tr>
                      )}

                      {/* 2. Next: Carpentry Charges */}
                      {totalCarpentryWorks > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            CARPENTRY WORKS
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(totalCarpentryWorks))}
                          </td>
                        </tr>
                      )}

                      {/* 3. Next: Transport Charges */}
                      {totalTransportation > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            TRANSPORTATION &amp; DELIVERY CHARGES
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(totalTransportation))}
                          </td>
                        </tr>
                      )}

                      {/* 4. Next: Other Charges (if any) */}
                      {totalOther > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            {(ac?.otherLabel || 'OTHER CHARGES').toUpperCase()}
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(totalOther))}
                          </td>
                        </tr>
                      )}

                      {/* 5. Next: GST */}
                      {gstAmount > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            GST
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(gstAmount))}
                          </td>
                        </tr>
                      )}

                      {/* 6. Next: Discount */}
                      {discAmount > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase', color: '#166534' }}>
                            LESS: DISCOUNT
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#166534' }}>
                            - {renderWithSmallDecimalHtml(formatIndianCurrency(discAmount))}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })()}

                {/* Fill empty spacing to push total to bottom if few items */}
                {invoiceItems.length < 8 && (
                  <tr style={{ height: `${Math.max(20, (8 - invoiceItems.length) * 20)}px` }}>
                    <td colSpan={8} style={{ borderBottom: 'none' }}></td>
                  </tr>
                )}
              </tbody>

              {/* Total Row */}
              <tfoot>
                <tr className="p-total-row">
                  <td colSpan={2} style={{ textAlign: 'right', fontWeight: 800, paddingRight: '12px' }}>
                    Total
                  </td>
                  <td className="text-right p-mono font-bold">
                    {totalPieces} PCS
                  </td>
                  <td className="text-right p-mono font-bold">
                    {renderWithSmallDecimalHtml(`${totalCft.toFixed(4)} CFT`)}
                  </td>
                  <td className="text-right p-mono font-bold">
                    {renderWithSmallDecimalHtml(totalSqft.toFixed(2) !== '0.00' ? `${totalSqft.toFixed(2)} SQFT` : '')}
                  </td>
                  <td colSpan={3} className="text-right p-mono font-bold p-final-total-highlight">
                    {renderWithSmallDecimalHtml(formatIndianCurrency(effectiveTotal), 'Rs. ')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 4. Amount Chargeable in Words */}
          <div className="p-words-bar">
            <div>
              <span className="p-words-label">Amount Chargeable (in words)</span>
              <div className="p-words-text">{amountInWords}</div>
            </div>
            <div className="p-eoe">E. &amp; O.E</div>
          </div>

          {/* 5. Bottom Grid: Company's Bank Details (Left) | Payment Scanner (Middle) | Big Seals (Right) */}
          <div className="p-bottom-grid">
            {/* Left Box: Company's Bank Details */}
            <div className="p-bottom-bank-box">
              <div className="p-bank-heading">Company&apos;s Bank Details</div>
              <div className="p-bank-row">
                <span className="p-bank-label">A/c Holder&apos;s Name</span>
                <span className="p-bank-colon">:</span>
                <span className="p-bank-val font-bold">HINDUSTAN SAW MILLS AND WOOD INDUSTRIES 2024-25</span>
              </div>
              <div className="p-bank-row">
                <span className="p-bank-label">Bank Name</span>
                <span className="p-bank-colon">:</span>
                <span className="p-bank-val font-bold">ICICI BANK</span>
              </div>
              <div className="p-bank-row">
                <span className="p-bank-label">A/c No.</span>
                <span className="p-bank-colon">:</span>
                <span className="p-bank-val font-bold p-mono">464205000153</span>
              </div>
              <div className="p-bank-row">
                <span className="p-bank-label">Branch &amp; IFS Code</span>
                <span className="p-bank-colon">:</span>
                <span className="p-bank-val font-bold p-mono">JP NAGAR &amp; ICIC0004642</span>
              </div>
            </div>

            {/* Middle Box: Payment Scanner (UPI QR Code) */}
            <div className="p-bottom-qr-box">
              <div className="p-qr-header">Scan &amp; Pay via UPI</div>
              <div className="p-qr-image-wrapper">
                <img src={PAYMENT_QR_BASE64} alt="UPI Payment QR Code" className="p-qr-img" />
              </div>
              <div className="p-qr-apps">GPay &bull; PhonePe &bull; Paytm &bull; BHIM</div>
              <div className="p-qr-upi-id">UPI ID: <strong>hindustansawmill@icici</strong></div>
            </div>

            {/* Right Box: Big Customer Seal & Big Authorised Signatory */}
            <div className="p-bottom-seals-box">
              <div className="p-customer-seal-big">
                <div className="p-seal-title">Customer&apos;s Seal and Signature</div>
                <div className="p-seal-space"></div>
              </div>

              <div className="p-auth-seal-big">
                <div className="p-for-company">
                  for {businessSettings?.companyName || 'HINDUSTAN SAW MILLS AND WOOD INDUSTRIES'}
                </div>
                <div className="p-sign-space"></div>
                <div className="p-auth-title">Authorised Signatory</div>
              </div>
            </div>
          </div>

          {/* 7. Bottom Footnote */}
          <div className="p-computer-note">
            This is a Computer Generated Invoice
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
};
