import React from 'react';
import type {
  BusinessSettings,
  MeasurementItem,
  RoundLogOutputUnit,
  RoundLogInputUnitType,
  RoundLogItem
} from '../types';
import { formatIndianCurrency, numberToIndianCurrencyWords } from '../utils/indianNumberWords';
import { PAYMENT_QR_BASE64 } from '../utils/paymentQrBase64';
import { groupRoundLogsBySpeciesFirst, getRoundLogUnitConfig } from '../utils/roundLogCalculator';
import { calculateRFT, formatValue, calculateSheetAmount, calculateSheetSqft, getCutLogItemDescription, getCutLogItemSectionHeading, hasWidthGroupTransition, isCftRftOnlyWood, isTimberRftBilled, isTimberSqftBilled, resolveSheetRateUnit } from '../utils/calculator';
import './ProformaInvoice.css';

export const renderDimensionHtml = (dim: string) => {
  if (!dim) return null;
  const brandMatch = dim.match(/\(([^)]+)\)/);
  const brandSuffix = brandMatch ? ` (${brandMatch[1]})` : '';
  let pureDim = dim.replace(/\s*\([^)]+\)/, '').trim();

  // If pureDim ends with x0 or ×0, strip it! (e.g. 8x4x0 -> 8x4, 8x12x0 -> 8x12)
  pureDim = pureDim.replace(/([xX×*]\s*0+)+$/, '').trim();

  const parts = pureDim.split(/([xX×*])/);
  if (parts.length <= 1) {
    const clean = pureDim.trim().replace(/^0+(\d)/, '$1');
    return (
      <span>
        <span className="p-dim-num">{clean}</span>
        {brandSuffix && <span className="p-dim-brand" style={{ fontWeight: 700, fontSize: '0.92em', marginLeft: '3px', color: '#1e293b' }}>{brandSuffix}</span>}
      </span>
    );
  }

  // Standard 3-axis L × W × T timber dimension row: fixed 5-track tabular grid alignment
  if (!brandSuffix && parts.length === 5 && /^[xX×*]$/.test(parts[1]) && /^[xX×*]$/.test(parts[3])) {
    const lenStr = parts[0].trim().replace(/^0+(\d)/, '$1');
    const widStr = parts[2].trim().replace(/^0+(\d)/, '$1');
    const thkStr = parts[4].trim().replace(/^0+(\d)/, '$1');
    return (
      <span
        className="p-dim-grid"
        style={{
          display: 'inline-grid',
          gridTemplateColumns: '4.2em 1.1em 2.3em 1.1em 2.7em',
          alignItems: 'center',
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        <span className="p-dim-num" style={{ textAlign: 'left' }}>{lenStr}</span>
        <span className="p-dim-mul" style={{ textAlign: 'center', padding: 0 }}>×</span>
        <span className="p-dim-num" style={{ textAlign: 'left' }}>{widStr}</span>
        <span className="p-dim-mul" style={{ textAlign: 'center', padding: 0 }}>×</span>
        <span className="p-dim-num" style={{ textAlign: 'left' }}>{thkStr}</span>
      </span>
    );
  }

  return (
    <span>
      {parts.map((p, idx) => {
        if (p.toLowerCase() === 'x' || p === '×' || p === '*') {
          return (
            <span key={idx} className="p-dim-mul">
              ×
            </span>
          );
        }
        const clean = p.trim().replace(/^0+(\d)/, '$1');
        return (
          <span key={idx} className="p-dim-num">
            {clean}
          </span>
        );
      })}
      {brandSuffix && <span className="p-dim-brand" style={{ fontWeight: 700, fontSize: '0.92em', marginLeft: '3px', color: '#1e293b' }}>{brandSuffix}</span>}
    </span>
  );
};

export const getCftIntWidthCh = (items: Array<{ cft?: number }>) =>
  Math.max(3, ...items.map((it) => (typeof it.cft === 'number' && it.cft > 0 ? `${Math.floor(it.cft)}.`.length : 0)));

export const renderWithSmallDecimalHtml = (val: string | number | undefined | null, prefix: string = '', suffix: string = '', intWidthCh?: number) => {
  if (val === undefined || val === null) return null;
  const str = typeof val === 'number' ? val.toString() : val;
  if (!str || str === '-') return null;
  const dotIdx = str.lastIndexOf('.');

  // Auto-scale font size dynamically based on number/text length to prevent overflowing box boundaries
  const rawText = `${prefix}${str}${suffix}`;
  const charCount = rawText.length;
  let scaleStyle: React.CSSProperties = { display: 'inline-block', whiteSpace: 'nowrap' };
  if (charCount >= 22) {
    scaleStyle = { display: 'inline-block', fontSize: '0.72em', letterSpacing: '-0.035em', whiteSpace: 'nowrap' };
  } else if (charCount >= 18) {
    scaleStyle = { display: 'inline-block', fontSize: '0.80em', letterSpacing: '-0.025em', whiteSpace: 'nowrap' };
  } else if (charCount >= 14) {
    scaleStyle = { display: 'inline-block', fontSize: '0.88em', letterSpacing: '-0.015em', whiteSpace: 'nowrap' };
  } else if (charCount >= 11) {
    scaleStyle = { display: 'inline-block', fontSize: '0.94em', letterSpacing: '-0.01em', whiteSpace: 'nowrap' };
  }

  if (dotIdx === -1) {
    return <span style={scaleStyle}>{prefix}{str}{suffix}</span>;
  }
  const before = str.slice(0, dotIdx);
  if (!/\d/.test(before)) {
    return <span style={scaleStyle}>{prefix}{str}{suffix}</span>;
  }
  const after = str.slice(dotIdx + 1);
  const match = after.match(/^(\d+)(.*)$/);
  if (!match) {
    return <span style={scaleStyle}>{prefix}{str}{suffix}</span>;
  }
  const intStr = str.slice(0, dotIdx + 1);
  const decStr = match[1];
  const postStr = match[2];

  return (
    <span style={scaleStyle}>
      {prefix}
      <span style={intWidthCh ? { display: 'inline-block', minWidth: `${intWidthCh}ch`, textAlign: 'right' } : undefined}>{intStr}</span>
      <span className="p-dec-small">{decStr}</span>
      {postStr}
      {suffix}
    </span>
  );
};

export const renderAdvanceFooterRows = (
  advanceAmt: number,
  remainingAmt: number,
  labelColSpan: number,
  amountColSpan: number = 1,
  leadingEmptyCell: boolean = false
) => {
  if (!advanceAmt || advanceAmt <= 0) return null;
  return (
    <>
      <tr className="p-total-row">
        {leadingEmptyCell && <td style={{ backgroundColor: '#ffffff' }}></td>}
        <td
          colSpan={labelColSpan}
          style={{ textAlign: 'right', fontWeight: 700, paddingRight: '12px', color: '#166534', backgroundColor: '#ffffff' }}
        >
          LESS: ADVANCE
        </td>
        <td
          colSpan={amountColSpan}
          className="text-right p-mono font-bold"
          style={{ color: '#166534', paddingRight: '8px', backgroundColor: '#ffffff' }}
        >
          - {renderWithSmallDecimalHtml(formatIndianCurrency(advanceAmt), 'Rs. ')}
        </td>
      </tr>
      <tr className="p-total-row">
        {leadingEmptyCell && <td></td>}
        <td colSpan={labelColSpan} style={{ textAlign: 'right', fontWeight: 800, paddingRight: '12px' }}>
          AMOUNT TO BE PAID (REMAINING AMOUNT)
        </td>
        <td colSpan={amountColSpan} className="text-right p-mono font-bold p-final-total-highlight">
          {renderWithSmallDecimalHtml(formatIndianCurrency(remainingAmt), 'Rs. ')}
        </td>
      </tr>
    </>
  );
};

export const renderWidthSpacerRow = (colCount: number, key: string) => (
  <tr key={key} className="p-width-spacer-row" aria-hidden="true">
    {Array.from({ length: colCount }, (_, idx) => (
      <td key={idx}>
        <div style={{ height: '5px', lineHeight: 0, fontSize: 0 }} />
      </td>
    ))}
  </tr>
);

export interface PrintableProformaInvoiceProps {
  businessSettings?: BusinessSettings;
  voucherType?: 'sales' | 'purchase';
  invoiceNo?: string;
  eWayBillNo?: string;
  invoiceDate?: string;
  deliveryNote?: string;
  paymentTerms?: string;
  refNoAndDate?: string;
  otherReferences?: string;
  buyerOrderNo?: string;
  buyerOrderDate?: string;
  dispatchDocNo?: string;
  deliveryNoteDate?: string;
  dispatchedThrough?: string;
  destination?: string;
  billOfLadingNo?: string;
  motorVehicleNo?: string;
  termsOfDelivery?: string;

  consigneeName?: string;
  consigneePhone?: string;
  consigneeAddress?: string;
  consigneeGstin?: string;
  consigneeState?: string;
  consigneeStateCode?: string;

  buyerName?: string;
  buyerPhone?: string;
  buyerAddress?: string;
  buyerGstin?: string;
  buyerState?: string;
  buyerStateCode?: string;

  logType?: 'cut' | 'round';
  roundLogOutputUnit?: RoundLogOutputUnit;
  roundLogInputUnit?: RoundLogInputUnitType;
  roundLogItems?: RoundLogItem[];
  roundLogSlabRates?: Record<string, number>;

  items?: MeasurementItem[];
  ratePerCft?: number;

  additionalCharges?: {
    carpentry?: number;
    transportation?: number;
    planing?: number;
    planingRatePerCft?: number;
    sawing?: number;
    other?: number;
    otherLabel?: string;
  };
  discountAmount?: number;
  discountDesc?: string;
  gstPercent?: number;
  gstTaxableBase?: number;
  gstAmount?: number;
  finalGrandTotal?: number;
  advanceAmount?: number;

  upiId?: string;
  bankHolder?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
}

export const PrintableProformaInvoice: React.FC<PrintableProformaInvoiceProps> = ({
  businessSettings,
  voucherType = 'sales',
  invoiceNo = '8',
  eWayBillNo = '',
  invoiceDate = '29-Oct-26',
  paymentTerms = 'IMMEDIATE PAYMENT',
  buyerOrderNo = '',
  buyerOrderDate = '',
  destination = '',
  motorVehicleNo = '',
  termsOfDelivery = 'TRANSPORTATION EXTRA\nAPPLICABLE GST EXTRA',

  consigneeName = '',
  consigneePhone = '',
  consigneeAddress = '',
  consigneeGstin = '',
  consigneeState = '',
  consigneeStateCode = '',

  buyerName = '',
  buyerPhone = '',
  buyerAddress = '',
  buyerGstin = '',
  buyerState = '',
  buyerStateCode = '',

  logType = 'cut',
  roundLogOutputUnit = 'CFT',
  roundLogInputUnit = 'girth_ft_length_ft',
  roundLogItems = [],
  roundLogSlabRates = {},

  items = [],
  ratePerCft = 1200,

  additionalCharges,
  discountAmount = 0,
  discountDesc = '',
  gstPercent: _gstPercent = 0,
  gstTaxableBase: _gstTaxableBase,
  gstAmount = 0,
  finalGrandTotal,
  advanceAmount = 0
}) => {
  const isRound = logType === 'round';
  const roundSpeciesData = groupRoundLogsBySpeciesFirst(
    roundLogItems,
    roundLogOutputUnit,
    roundLogInputUnit,
    roundLogSlabRates
  );

  const validItems = items.filter(
    (it) => {
      const itDesc = (it.remarks || (it as any).description || '').toUpperCase();
      const itWood = (it.woodType || '').toUpperCase();
      const isSheet = it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || itWood.includes('PLYWOOD') || itDesc.includes('PLYWOOD') || itWood.includes('READY') || itDesc.includes('READY') || it.rateUnit === 'PCS';
      if (isSheet) {
        return typeof it.pieces === 'number' && it.pieces > 0;
      }
      return typeof it.lengthFeet === 'number' && it.lengthFeet > 0 && typeof it.pieces === 'number' && it.pieces > 0;
    }
  );

  // Group valid timber items by wood type while preserving sequential order
  const woodGroups: Array<{ wood: string; items: typeof validItems }> = [];
  const woodMap = new Map<string, typeof validItems>();

  for (const it of validItems) {
    const wood = getCutLogItemSectionHeading({
      woodType: it.woodType,
      itemCategory: it.itemCategory,
      teakGrade: it.teakGrade,
      brand: it.brand,
      description: it.remarks || (it as any).description
    });
    if (!woodMap.has(wood)) {
      const arr: typeof validItems = [];
      woodMap.set(wood, arr);
      woodGroups.push({ wood, items: arr });
    }
    woodMap.get(wood)!.push(it);
  }

  // Ensure items within each wood species group are sorted strictly by mill specification: Width Asc -> Thickness Desc -> Length Desc
  for (const group of woodGroups) {
    group.items.sort((a, b) => {
      const isSheetA = a.itemCategory === 'plywood' || a.itemCategory === 'ready_board' || (a.woodType && (a.woodType.toUpperCase().includes('PLYWOOD') || a.woodType.toUpperCase().includes('READY')));
      const isSheetB = b.itemCategory === 'plywood' || b.itemCategory === 'ready_board' || (b.woodType && (b.woodType.toUpperCase().includes('PLYWOOD') || b.woodType.toUpperCase().includes('READY')));
      if (isSheetA || isSheetB) {
        const wA = typeof a.widthInches === 'number' ? a.widthInches : parseFloat(String(a.widthInches)) || 0;
        const wB = typeof b.widthInches === 'number' ? b.widthInches : parseFloat(String(b.widthInches)) || 0;
        if (wA !== wB) return wA - wB;

        const brandA = a.brand || '';
        const brandB = b.brand || '';
        if (brandA !== brandB) return brandA.localeCompare(brandB);

        const rA = typeof a.rate === 'number' ? a.rate : 0;
        const rB = typeof b.rate === 'number' ? b.rate : 0;
        if (rA !== rB) return rA - rB;

        const pA = typeof a.pieces === 'number' ? a.pieces : parseFloat(String(a.pieces)) || 0;
        const pB = typeof b.pieces === 'number' ? b.pieces : parseFloat(String(b.pieces)) || 0;
        return pB - pA;
      }

      const wA = typeof a.widthInches === 'number' ? a.widthInches : parseFloat(String(a.widthInches)) || 0;
      const wB = typeof b.widthInches === 'number' ? b.widthInches : parseFloat(String(b.widthInches)) || 0;
      if (wA !== wB) return wA - wB;

      const tA = typeof a.thicknessInches === 'number' ? a.thicknessInches : parseFloat(String(a.thicknessInches)) || 0;
      const tB = typeof b.thicknessInches === 'number' ? b.thicknessInches : parseFloat(String(b.thicknessInches)) || 0;
      if (tA !== tB) return tB - tA;

      const lA = typeof a.lengthFeet === 'number' ? a.lengthFeet : parseFloat(String(a.lengthFeet)) || 0;
      const lB = typeof b.lengthFeet === 'number' ? b.lengthFeet : parseFloat(String(b.lengthFeet)) || 0;
      if (lA !== lB) return lA - lB;

      const pA = typeof a.pieces === 'number' ? a.pieces : parseFloat(String(a.pieces)) || 0;
      const pB = typeof b.pieces === 'number' ? b.pieces : parseFloat(String(b.pieces)) || 0;
      return pB - pA;
    });
  }

  let totalCft = 0;
  let totalCbm = 0;
  let totalPieces = 0;
  let totalSqftBilled = 0;
  let totalRftBilled = 0;
  let timberTotalAmount = 0;
  const showRftCol = !isRound && validItems.some((it) => isTimberRftBilled(it));
  const showSqftCol = !isRound && validItems.some((it) => {
    const itDesc = (it.remarks || (it as any).description || '').toUpperCase();
    const itWood = (it.woodType || '').toUpperCase();
    const isSheet = it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || itWood.includes('PLYWOOD') || itDesc.includes('PLYWOOD') || itWood.includes('READY') || itDesc.includes('READY') || it.rateUnit === 'PCS';
    return isSheet || !isCftRftOnlyWood(it.woodType);
  });

  if (isRound) {
    totalPieces = roundSpeciesData.overallTotals.totalPieces;
    totalCft = roundSpeciesData.overallTotals.totalCft;
    totalCbm = roundSpeciesData.overallTotals.totalCbm;
    timberTotalAmount = roundSpeciesData.overallTotals.totalAmount;
  } else {
    totalCft = validItems.reduce((acc, it) => {
      const itDesc = (it.remarks || (it as any).description || '').toUpperCase();
      const itWood = (it.woodType || '').toUpperCase();
      const isPureSheet = it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || itWood.includes('PLYWOOD') || itDesc.includes('PLYWOOD') || itWood.includes('READY') || itDesc.includes('READY') || it.rateUnit === 'PCS';
      if (isPureSheet || isTimberRftBilled(it)) return acc;
      return acc + (typeof it.cft === 'number' ? it.cft : 0);
    }, 0);
    totalPieces = validItems.reduce((acc, it) => acc + (typeof it.pieces === 'number' ? it.pieces : 0), 0);

    totalSqftBilled = validItems.reduce((acc, it) => {
      const isSheet = (it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready')) && it.itemCategory !== 'timber';
      if (isSheet) {
        if (resolveSheetRateUnit(it.rateUnit, (it as any).per) !== 'SQFT') return acc;
        const p = typeof it.pieces === 'number' ? it.pieces : (parseFloat(String(it.pieces)) || 0);
        const isPly = Boolean(it.itemCategory === 'plywood' || (it.woodType && it.woodType.toLowerCase().includes('plywood')));
        const sqft = calculateSheetSqft(isPly, p, it.widthInches, (it as any).boardSize);
        return acc + sqft;
      }
      if (isTimberRftBilled(it)) return acc;
      if (isTimberSqftBilled(it)) {
        return acc + (typeof it.sqft === 'number' ? it.sqft : 0);
      }
      return acc;
    }, 0);

    totalRftBilled = validItems.reduce((acc, it) => {
      const isSheet = (it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready')) && it.itemCategory !== 'timber';
      if (isSheet || !isTimberRftBilled(it)) return acc;
      const rftVal = typeof it.rft === 'number' && it.rft > 0 ? it.rft : calculateRFT(it.lengthFeet, it.pieces);
      return acc + rftVal;
    }, 0);

    timberTotalAmount = validItems.reduce((acc, it) => {
      const isSheet = (it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready')) && it.itemCategory !== 'timber';
      if (isSheet) {
        const p = typeof it.pieces === 'number' ? it.pieces : (parseFloat(String(it.pieces)) || 0);
        const isPly = Boolean(it.itemCategory === 'plywood' || (it.woodType && it.woodType.toLowerCase().includes('plywood')));
        const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : 0;
        const sheetCalc = calculateSheetAmount(isPly, p, r, resolveSheetRateUnit(it.rateUnit, (it as any).per), it.widthInches, (it as any).boardSize);
        const amt = sheetCalc.amount > 0 ? sheetCalc.amount : (typeof it.amount === 'number' ? it.amount : 0);
        return acc + amt;
      }
      if (isTimberRftBilled(it)) {
        const rftVal = typeof it.rft === 'number' && it.rft > 0 ? it.rft : calculateRFT(it.lengthFeet, it.pieces);
        const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : 0;
        const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(rftVal * r * 100) / 100;
        return acc + amt;
      }
      const isSqft = isTimberSqftBilled(it);
      const defaultRowRate = isSqft ? 120 : ratePerCft;
      const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
      const mult = isSqft ? (typeof it.sqft === 'number' ? it.sqft : 0) : it.cft;
      const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(mult * r * 100) / 100;
      return acc + amt;
    }, 0);
  }

  const totalCarpentryWorks = (additionalCharges?.carpentry || 0) + (additionalCharges?.sawing || 0);
  const totalTransportation = additionalCharges?.transportation || 0;
  const totalPlaning = additionalCharges?.planing || 0;
  const billingBaseVol = isRound ? (roundLogOutputUnit === 'CBM' ? totalCbm : totalCft) : totalCft;
  const planingRate = (additionalCharges?.planingRatePerCft && additionalCharges.planingRatePerCft > 0)
    ? additionalCharges.planingRatePerCft
    : (totalPlaning > 0 && billingBaseVol > 0 ? Math.round((totalPlaning / billingBaseVol) * 100) / 100 : 0);
  const planingUnitLabel = isRound ? roundLogOutputUnit : 'CFT';
  const planingLabel = planingRate > 0 ? `PLAINING CHARGES (Rs. ${planingRate}/${planingUnitLabel})` : 'PLAINING CHARGES';
  const totalOther = additionalCharges?.other || 0;
  const additionalChargesSum = totalCarpentryWorks + totalTransportation + totalPlaning + totalOther;

  const subtotalWithCharges = timberTotalAmount + additionalChargesSum;
  const computedFallback = Math.max(0, subtotalWithCharges - (discountAmount || 0) + (gstAmount || 0));
  const effectiveTotal = (subtotalWithCharges > 0 || isRound)
    ? computedFallback
    : (finalGrandTotal !== undefined && finalGrandTotal > 0 ? finalGrandTotal : timberTotalAmount);
  const advanceAmt = Math.max(0, Math.round((advanceAmount || 0) * 100) / 100);
  const remainingAmt = Math.max(0, Math.round((effectiveTotal - advanceAmt) * 100) / 100);
  const amountInWords = numberToIndianCurrencyWords(effectiveTotal);

  let runningSl = 1;

  return (
    <div className="proforma-document-container">
      <div className="proforma-box">
        {/* 1. Header Box */}
        <div className="p-header-title">
          <span>PROFORMA INVOICE</span>
          <div className="p-header-voucher-badge">
            {voucherType === 'purchase' ? 'PURCHASE' : 'SALES'}
          </div>
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

            {/* Consignee (Ship to) */}
            <div className="p-party-box">
              <div className="p-party-heading">Consignee (Ship to)</div>
              <div style={{ fontWeight: 800, fontSize: '9.2px', textTransform: 'uppercase', marginBottom: '2px' }}>
                {consigneeName || 'New India Saw Mill'}
              </div>
              <div className="p-print-preline" style={{ whiteSpace: 'pre-line', fontSize: '8.2px', lineHeight: 1.35, color: '#1a1a1a' }}>
                {consigneeAddress || 'Local Mill Pickup'}
              </div>
              {consigneePhone && (
                <div className="p-party-meta" style={{ marginTop: '2px' }}>
                  <span className="p-party-meta-label">Contact No.</span>
                  <span className="p-party-meta-separator">: </span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>
                    {consigneePhone}
                  </span>
                </div>
              )}
              <div className="p-party-meta" style={{ marginTop: consigneePhone ? '1px' : '3px' }}>
                <span className="p-party-meta-label">GSTIN/UIN</span>
                <span className="p-party-meta-separator">: </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 800 }}>
                  {consigneeGstin || ''}
                </span>
              </div>
              <div className="p-party-meta">
                <span className="p-party-meta-label">State Name</span>
                <span className="p-party-meta-separator">: </span>
                <span style={{ flex: 2 }}>{consigneeState || ''}</span>
                <span style={{ margin: '0 4px', fontSize: '8.5px' }}>Code:</span>
                <span style={{ width: '38px', textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>
                  {consigneeStateCode || ''}
                </span>
              </div>
            </div>

            {/* Buyer (Bill to) */}
            <div className="p-party-box" style={{ borderBottom: 'none' }}>
              <div className="p-party-heading">Buyer (Bill to)</div>
              <div style={{ fontWeight: 800, fontSize: '9.2px', textTransform: 'uppercase', marginBottom: '2px' }}>
                {buyerName || consigneeName || ''}
              </div>
              <div className="p-print-preline" style={{ whiteSpace: 'pre-line', fontSize: '8.2px', lineHeight: 1.35, color: '#1a1a1a' }}>
                {buyerAddress || consigneeAddress || ''}
              </div>
              {(buyerPhone || consigneePhone) && (
                <div className="p-party-meta" style={{ marginTop: '2px' }}>
                  <span className="p-party-meta-label">Contact No.</span>
                  <span className="p-party-meta-separator">: </span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>
                    {buyerPhone || consigneePhone}
                  </span>
                </div>
              )}
              <div className="p-party-meta" style={{ marginTop: (buyerPhone || consigneePhone) ? '1px' : '3px' }}>
                <span className="p-party-meta-label">GSTIN/UIN</span>
                <span className="p-party-meta-separator">: </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 800 }}>
                  {buyerGstin || ''}
                </span>
              </div>
              <div className="p-party-meta">
                <span className="p-party-meta-label">State Name</span>
                <span className="p-party-meta-separator">: </span>
                <span style={{ flex: 2 }}>{buyerState || consigneeState || ''}</span>
                <span style={{ margin: '0 4px', fontSize: '8.5px' }}>Code:</span>
                <span style={{ width: '38px', textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>
                  {buyerStateCode || consigneeStateCode || ''}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column (50%): Metadata Grid Table */}
          <div className="p-right-col">
            {/* Row 1: Invoice No | e-Way Bill No | Dated */}
            <div className="p-meta-grid-row cols-3">
              <div className="p-meta-cell">
                <span className="p-label">Invoice No.</span>
                <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono, monospace)' }}>{invoiceNo || '8'}</span>
              </div>
              <div className="p-meta-cell">
                <span className="p-label">e-Way Bill No.</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{eWayBillNo || ''}</span>
              </div>
              <div className="p-meta-cell">
                <span className="p-label">Dated</span>
                <span style={{ fontWeight: 700 }}>{invoiceDate || '29-Oct-26'}</span>
              </div>
            </div>

            {/* Row 2: Mode/Terms of Payment | Destination */}
            <div className="p-meta-grid-row cols-2">
              <div className="p-meta-cell">
                <span className="p-label">Mode/Terms of Payment</span>
                <span style={{ fontWeight: 700 }}>{paymentTerms || 'IMMEDIATE PAYMENT'}</span>
              </div>
              <div className="p-meta-cell">
                <span className="p-label">Destination</span>
                <span style={{ fontWeight: 700 }}>{destination || consigneeState?.toUpperCase() || ''}</span>
              </div>
            </div>

            {/* Row 3: Buyer's Order No. | Dated */}
            <div className="p-meta-grid-row cols-2">
              <div className="p-meta-cell">
                <span className="p-label">Buyer&apos;s Order No.</span>
                <span>{buyerOrderNo || ''}</span>
              </div>
              <div className="p-meta-cell">
                <span className="p-label">Dated</span>
                <span>{buyerOrderDate || ''}</span>
              </div>
            </div>

            {/* Row 4: Motor Vehicle No. */}
            <div className="p-meta-grid-row full">
              <div className="p-meta-cell">
                <span className="p-label">Motor Vehicle No.</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>{motorVehicleNo || ''}</span>
              </div>
            </div>

            {/* Row 5: Terms of Delivery (Expanded Big Column) */}
            <div className="p-meta-grid-row full" style={{ borderBottom: 'none', flex: 1, minHeight: '52px' }}>
              <div className="p-meta-cell" style={{ flex: 1, padding: '5px 8px' }}>
                <span className="p-label" style={{ fontWeight: 700, fontSize: '8.5px', color: '#222' }}>Terms of Delivery</span>
                <div style={{ whiteSpace: 'pre-line', fontSize: '9px', lineHeight: 1.45, fontWeight: 700, marginTop: '4px', color: '#000000' }}>
                  {termsOfDelivery || 'TRANSPORTATION EXTRA\nAPPLICABLE GST EXTRA'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Items Table */}
        <div className="p-table-container">
          {isRound ? (
            <table className="p-items-table p-round-table">
              <thead>
                <tr>
                  <th style={{ width: '7.0%', textAlign: 'center' }}>Sl<br />No.</th>
                  <th style={{ width: '9.0%', textAlign: 'center' }}>Log<br />No.</th>
                  <th style={{ width: '25.0%', textAlign: 'center' }}>Length</th>
                  <th style={{ width: '27.0%', textAlign: 'center' }}>Girth</th>
                  <th style={{ width: '32.0%', textAlign: 'right', paddingRight: '8px' }}>Volume ({roundLogOutputUnit})</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let globalSlNo = 1;
                  return roundSpeciesData.speciesSections.map((spSec, spIdx) => (
                    <React.Fragment key={`sp-sec-${spIdx}`}>
                      {/* 1. Parent Header: Wood Species */}
                      <tr className="p-item-row" style={{ backgroundColor: '#e2e8f0', borderTop: '1px solid #111', borderBottom: '1px solid #111', fontWeight: 900 }}>
                        <td colSpan={5} style={{ paddingLeft: '8px', fontSize: '9.2px', textTransform: 'uppercase', letterSpacing: '0.02em', color: '#0f172a' }}>
                          {spSec.woodType.toUpperCase()}
                        </td>
                      </tr>

                      {spSec.slabGroups.map((slabGroup, sIdx) => {
                        const slabBannerTitle = slabGroup.slabTitle.endsWith('Logs')
                          ? slabGroup.slabTitle
                          : `${slabGroup.slabTitle} Logs`;

                        return (
                          <React.Fragment key={`sp-slab-${spIdx}-${sIdx}`}>
                            {/* 2. Sub-section Banner: Girth Slab */}
                            <tr className="p-wood-heading-row" style={{ backgroundColor: '#f1f5f9' }}>
                              <td colSpan={5} className="p-wood-heading-desc" style={{ paddingLeft: '16px', fontWeight: 800, fontSize: '8.4px', color: '#334155', textAlign: 'left' }}>
                                {slabBannerTitle}
                              </td>
                            </tr>

                            {/* 3. Individual Log Rows (5 columns: Sl No, Log No, Length, Girth, Volume) */}
                            {slabGroup.items.map((it, itemIdx) => {
                              const slNo = globalSlNo++;
                              const rowCfg = getRoundLogUnitConfig(it.inputUnit || roundLogInputUnit);
                              const lStr = `${it.length} ${rowCfg.lengthUnit}`;
                              const gStr = it.girthFtInStr || (it.girthInches !== undefined ? `${formatValue(it.girthInches, 1)}"` : `${it.girth}`);
                              const activeVol = roundLogOutputUnit === 'CFT' ? (it.cft || it.volume) : (it.cbm || it.volume);

                              return (
                                <tr key={`r-item-${spIdx}-${sIdx}-${itemIdx}`} className={`p-item-row ${slNo % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                                  <td className="text-center font-bold" style={{ color: '#64748b' }}>
                                    {slNo}
                                  </td>
                                  <td className="text-center font-bold" style={{ color: 'var(--primary-700, #4b3621)' }}>
                                    {it.serialNumber || (itemIdx + 1)}
                                  </td>
                                  <td className="text-center font-bold">{lStr}</td>
                                  <td className="text-center font-bold">{gStr}</td>
                                  <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#0f172a' }}>
                                    {renderWithSmallDecimalHtml(formatValue(activeVol, 4))}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}

                      {/* 4. Dedicated Pricing Summary Box for this Wood Species */}
                      {spSec.slabGroups.map((slabGroup, sIdx) => {
                        const slabLabel = (slabGroup.slabId === 'upto_23' || slabGroup.slabTitle.toLowerCase().includes('upto'))
                          ? 'Below 23"'
                          : slabGroup.slabTitle;

                        return (
                          <tr key={`sp-pricing-${spIdx}-${sIdx}`} className="p-item-row p-slab-pricing-row" style={{ backgroundColor: '#f8fafc', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', fontWeight: 800 }}>
                            <td colSpan={4} className="text-left font-bold" style={{ paddingLeft: '16px', fontSize: '8.5px', color: '#1e293b' }}>
                              {slabLabel} &nbsp;:&nbsp; {slabGroup.totalPieces} logs &nbsp;&nbsp; {formatValue(slabGroup.totalVolume, 4)} {roundLogOutputUnit} &nbsp;&nbsp; @ &nbsp;&nbsp; ₹ {formatValue(slabGroup.rate, 2)} &nbsp;=
                            </td>
                            <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#0f172a' }}>
                              {renderWithSmallDecimalHtml(formatIndianCurrency(slabGroup.subtotal), '₹ ')}
                            </td>
                          </tr>
                        );
                      })}

                      {/* 5. Species Total Row: Bold Total [WOOD SPECIES] */}
                      <tr className="p-item-row p-wood-subtotal-row" style={{ backgroundColor: '#eef2f6', borderTop: '1.5px solid #000000', borderBottom: '1.5px solid #000000', fontWeight: 900 }}>
                        <td colSpan={4} className="text-left font-bold" style={{ paddingLeft: '8px', textTransform: 'uppercase', fontSize: '8.8px', color: '#000000' }}>
                          Total {spSec.woodType.toUpperCase()} &nbsp;:&nbsp; {spSec.totalPieces} logs &nbsp;|&nbsp; {formatValue(roundLogOutputUnit === 'CFT' ? spSec.totalCft : spSec.totalCbm, 4)} {roundLogOutputUnit} &nbsp;=
                        </td>
                        <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#000000' }}>
                          {renderWithSmallDecimalHtml(formatIndianCurrency(spSec.totalAmount), '₹ ')}
                        </td>
                      </tr>
                    </React.Fragment>
                  ));
                })()}

                {/* 6. TOTAL MATERIALS row */}
                {totalPieces > 0 && (
                  <tr className="p-total-wood-row" style={{ backgroundColor: '#e2e8f0', borderTop: '1px solid #111', borderBottom: '1px solid #111', fontWeight: 900 }}>
                    <td colSpan={2} className="p-item-desc" style={{ paddingLeft: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      TOTAL MATERIALS
                    </td>
                    <td className="text-center font-bold p-mono">
                      {totalPieces} LOGS CLASSIFIED
                    </td>
                    <td className="text-right p-mono font-bold">
                      {renderWithSmallDecimalHtml(`${formatValue(roundLogOutputUnit === 'CFT' ? totalCft : totalCbm, 4)} ${roundLogOutputUnit}`)}
                    </td>
                    <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                      {renderWithSmallDecimalHtml(formatIndianCurrency(timberTotalAmount), 'Rs. ')}
                    </td>
                  </tr>
                )}

                {/* Additional Charges and Discount rows */}
                {(() => {
                  let chargeIdx = 0;
                  return (
                    <>
                      {totalPlaning > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td></td>
                          <td colSpan={3} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            {planingLabel}
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(totalPlaning))}
                          </td>
                        </tr>
                      )}

                      {totalCarpentryWorks > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td></td>
                          <td colSpan={3} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            CARPENTRY WORKS
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(totalCarpentryWorks))}
                          </td>
                        </tr>
                      )}

                      {totalTransportation > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td></td>
                          <td colSpan={3} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            TRANSPORTATION &amp; DELIVERY CHARGES
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(totalTransportation))}
                          </td>
                        </tr>
                      )}

                      {totalOther > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td></td>
                          <td colSpan={3} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            {(additionalCharges?.otherLabel || 'OTHER CHARGES').toUpperCase()}
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(totalOther))}
                          </td>
                        </tr>
                      )}

                      {gstAmount > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td></td>
                          <td colSpan={3} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            GST
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(gstAmount))}
                          </td>
                        </tr>
                      )}

                      {discountAmount > 0 && (
                        <>
                          <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`} style={{ fontWeight: 800 }}>
                            <td></td>
                            <td colSpan={3} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                              TOTAL PRICE BEFORE DISCOUNT
                            </td>
                            <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                              {renderWithSmallDecimalHtml(formatIndianCurrency(subtotalWithCharges + (gstAmount || 0)))}
                            </td>
                          </tr>
                          <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                            <td></td>
                            <td colSpan={3} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase', color: '#166534' }}>
                              LESS: DISCOUNT {(discountDesc && discountDesc !== 'LESS: DISCOUNT') ? `(${discountDesc})` : ''}
                            </td>
                            <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#166534' }}>
                              - {renderWithSmallDecimalHtml(formatIndianCurrency(discountAmount))}
                            </td>
                          </tr>
                        </>
                      )}
                    </>
                  );
                })()}

                {roundLogItems.length < 6 && (
                  <tr style={{ height: `${Math.max(25, (6 - roundLogItems.length) * 18)}px` }}>
                    <td colSpan={5} style={{ borderBottom: 'none' }}></td>
                  </tr>
                )}
              </tbody>

              {/* Total Row */}
              <tfoot>
                <tr className="p-total-row">
                  <td colSpan={2} style={{ textAlign: 'right', fontWeight: 800, paddingRight: '12px' }}>
                    GRAND TOTAL
                  </td>
                  <td className="text-center p-mono font-bold">
                    {totalPieces} LOGS
                  </td>
                  <td className="text-right p-mono font-bold">
                    {renderWithSmallDecimalHtml(`${formatValue(roundLogOutputUnit === 'CFT' ? totalCft : totalCbm, 4)} ${roundLogOutputUnit}`)}
                  </td>
                  <td className="text-right p-mono font-bold p-final-total-highlight" style={{ paddingRight: '8px' }}>
                    {renderWithSmallDecimalHtml(formatIndianCurrency(effectiveTotal), 'Rs. ')}
                  </td>
                </tr>
                {renderAdvanceFooterRows(advanceAmt, remainingAmt, 4)}
              </tfoot>
            </table>
          ) : (
            <table className="p-items-table">
              <thead>
                <tr>
                  <th style={{ width: '3.5%' }}>Sl<br />No.</th>
                  <th style={{ width: showSqftCol ? '17.5%' : (showRftCol ? '18.5%' : '21%'), textAlign: 'left', paddingLeft: '8px' }}>Description of Goods</th>
                  <th style={{ width: (!showSqftCol && !showRftCol) ? '11.5%' : '10%', textAlign: 'center' }}>Quantity (PCS)</th>
                  <th style={{ width: (showSqftCol && showRftCol) ? '14%' : ((!showSqftCol && !showRftCol) ? '19%' : '16.5%'), textAlign: 'center' }}>Alt. Quantity (CFT)</th>
                  {showSqftCol && <th style={{ width: showRftCol ? '11%' : '15%', textAlign: 'right' }}>SQFT</th>}
                  {showRftCol && <th style={{ width: showSqftCol ? '10%' : '14%', textAlign: 'right' }}>RFT</th>}
                  <th style={{ width: (!showSqftCol && !showRftCol) ? '10%' : '9%', textAlign: 'right' }}>Rate</th>
                  <th style={{ width: '5%', textAlign: 'center', whiteSpace: 'nowrap' }}>per</th>
                  <th style={{ width: (showSqftCol && showRftCol) ? '20%' : ((!showSqftCol && !showRftCol) ? '30%' : '23.5%'), textAlign: 'left', paddingLeft: '8px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {woodGroups.map((group, gIdx) => {
                  const groupPieces = group.items.reduce((acc, it) => acc + (typeof it.pieces === 'number' ? it.pieces : 0), 0);
                  const groupCft = group.items.reduce((acc, it) => {
                    const isSheet = (group.wood.includes('PLYWOOD') || group.wood.includes('READY') || it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready')) && it.itemCategory !== 'timber';
                    const isRft = !isSheet && isTimberRftBilled(it);
                    const isSqftBilled = isSheet ? resolveSheetRateUnit(it.rateUnit, (it as any).per) === 'SQFT' : isTimberSqftBilled(it);
                    if (isSheet || isRft || isSqftBilled) return acc;
                    return acc + (typeof it.cft === 'number' ? it.cft : 0);
                  }, 0);
                  const groupSqftBilled = group.items.reduce((acc, it) => {
                    const isSheet = (group.wood.includes('PLYWOOD') || group.wood.includes('READY') || it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready')) && it.itemCategory !== 'timber';
                    if (isSheet) {
                      if (resolveSheetRateUnit(it.rateUnit, (it as any).per) !== 'SQFT') return acc;
                      const p = typeof it.pieces === 'number' ? it.pieces : (parseFloat(String(it.pieces)) || 0);
                      const isPly = Boolean(it.itemCategory === 'plywood' || (it.woodType && it.woodType.toLowerCase().includes('plywood')));
                      const sqft = calculateSheetSqft(isPly, p, it.widthInches, (it as any).boardSize);
                      return acc + sqft;
                    }
                    if (isTimberRftBilled(it)) return acc;
                    if (isTimberSqftBilled(it)) {
                      return acc + (typeof it.sqft === 'number' ? it.sqft : 0);
                    }
                    return acc;
                  }, 0);
                  const groupRftBilled = group.items.reduce((acc, it) => {
                    const isSheet = (group.wood.includes('PLYWOOD') || group.wood.includes('READY') || it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready')) && it.itemCategory !== 'timber';
                    if (isSheet || !isTimberRftBilled(it)) return acc;
                    const rftVal = typeof it.rft === 'number' && it.rft > 0 ? it.rft : calculateRFT(it.lengthFeet, it.pieces);
                    return acc + rftVal;
                  }, 0);
                  const groupAmount = group.items.reduce((acc, it) => {
                    const isSheet = (group.wood.includes('PLYWOOD') || group.wood.includes('READY') || it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready')) && it.itemCategory !== 'timber';
                    if (isSheet) {
                      const p = typeof it.pieces === 'number' ? it.pieces : 0;
                      const isPly = Boolean(it.itemCategory === 'plywood' || (it.woodType && it.woodType.toLowerCase().includes('plywood')));
                      const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : 0;
                      const sheetCalc = calculateSheetAmount(isPly, p, r, resolveSheetRateUnit(it.rateUnit, (it as any).per), it.widthInches, (it as any).boardSize);
                      return acc + (sheetCalc.amount > 0 ? sheetCalc.amount : (typeof it.amount === 'number' ? it.amount : 0));
                    }
                    if (isTimberRftBilled(it)) {
                      const rftVal = typeof it.rft === 'number' && it.rft > 0 ? it.rft : calculateRFT(it.lengthFeet, it.pieces);
                      const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : 0;
                      const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(rftVal * r * 100) / 100;
                      return acc + amt;
                    }
                    const isSqft = isTimberSqftBilled(it);
                    const defaultRowRate = isSqft ? 120 : ratePerCft;
                    const itemRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
                    const mult = isSqft ? (typeof it.sqft === 'number' ? it.sqft : 0) : it.cft;
                    const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(mult * itemRate * 100) / 100;
                    return acc + amt;
                  }, 0);

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
                        {showSqftCol && <td></td>}
                        {showRftCol && <td></td>}
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>

                      {/* Measurements of that wood (with zebra striping and small decimals) */}
                      {group.items.map((it, itemIdx) => {
                        const currentSl = runningSl++;
                        const isSheet = (group.wood.includes('PLYWOOD') || group.wood.includes('READY') || it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready')) && it.itemCategory !== 'timber';
                        const sheetUnit = isSheet ? resolveSheetRateUnit(it.rateUnit, (it as any).per) : null;
                        const isRftBilled = !isSheet && isTimberRftBilled(it);
                        const rftVal = isRftBilled ? (typeof it.rft === 'number' && it.rft > 0 ? it.rft : calculateRFT(it.lengthFeet, it.pieces)) : 0;
                        const isSqftBilled = isSheet ? sheetUnit === 'SQFT' : isTimberSqftBilled(it);
                        const defaultRowRate = (isSheet || isRftBilled) ? 0 : (isSqftBilled ? 120 : ratePerCft);
                        const itemRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
                        const itPieces = typeof it.pieces === 'number' ? it.pieces : (parseFloat(String(it.pieces)) || 0);
                        const isPly = Boolean(it.itemCategory === 'plywood' || (it.woodType && it.woodType.toLowerCase().includes('plywood')));
                        const sheetCalc = isSheet ? calculateSheetAmount(isPly, itPieces, itemRate, sheetUnit!, it.widthInches, (it as any).boardSize) : null;
                        const sheetSqft = sheetCalc ? sheetCalc.sqft : 0;
                        const mult = isRftBilled ? rftVal : (isSqftBilled ? (isSheet ? sheetSqft : (typeof it.sqft === 'number' ? it.sqft : 0)) : it.cft);
                        const amount = isSheet
                          ? (itemRate > 0 ? sheetCalc!.amount : (typeof it.amount === 'number' ? it.amount : 0))
                          : Math.round(mult * itemRate * 100) / 100;
                        const slStr = String(currentSl);
                        const descStr = isSheet ? getCutLogItemDescription({ ...it, woodType: group.wood || it.woodType }) : `${it.lengthFeet}X${it.widthInches}X${it.thicknessInches}`;
                        const perUnit = isSheet ? sheetUnit! : (isRftBilled ? 'RFT' : (isSqftBilled ? 'SQFT' : 'CFT'));
                        const showWidthSpacer = hasWidthGroupTransition(it, group.items[itemIdx + 1], group.wood);
                        const totalColsCount = 7 + (showSqftCol ? 1 : 0) + (showRftCol ? 1 : 0);

                        return (
                          <React.Fragment key={`item-${currentSl}`}>
                            <tr className={`p-item-row ${itemIdx % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                              <td className="text-center">{slStr}</td>
                              <td className="p-item-desc p-item-desc-indent" style={{ paddingLeft: '14px', fontWeight: 700 }}>
                                {renderDimensionHtml(descStr)}
                              </td>
                              <td className="text-left p-mono p-qty-indent">{itPieces > 0 ? itPieces : ''}</td>
                              <td className="text-left p-mono p-qty-indent">{renderWithSmallDecimalHtml(!isSheet && !isRftBilled && it.cft > 0 ? it.cft.toFixed(4) : '', '', '', getCftIntWidthCh(validItems))}</td>
                              {showSqftCol && (
                                <td className="text-right p-mono">{renderWithSmallDecimalHtml(isSqftBilled && (isSheet ? sheetSqft > 0 : it.sqft > 0) ? `${(isSheet ? sheetSqft : it.sqft).toFixed(2)} SQFT` : '')}</td>
                              )}
                              {showRftCol && (
                                <td className="text-right p-mono">{renderWithSmallDecimalHtml(isRftBilled && rftVal > 0 ? `${rftVal.toFixed(2)} RFT` : '')}</td>
                              )}
                              <td className="text-right p-mono">{renderWithSmallDecimalHtml(itemRate.toFixed(2))}</td>
                              <td className="text-center" style={{ whiteSpace: 'nowrap' }}>{perUnit}</td>
                              <td className="text-left p-mono p-item-amount" style={{ paddingLeft: '8px', fontWeight: 500, color: '#4b5563' }}>
                                {renderWithSmallDecimalHtml(formatIndianCurrency(amount))}
                              </td>
                            </tr>
                            {showWidthSpacer && renderWidthSpacerRow(totalColsCount, `width-sep-${gIdx}-${itemIdx}`)}
                          </React.Fragment>
                        );
                      })}

                      {/* Wood Subtotal Row (Total of each individual wood) - Bold & prominent */}
                      <tr className="p-item-row p-wood-subtotal-row" style={{ backgroundColor: '#f3f4f6', borderTop: '1px solid #222222', borderBottom: '1px solid #222222', fontWeight: 800 }}>
                        <td className="text-center" style={{ color: '#888' }}></td>
                        <td className="p-item-desc" style={{ paddingLeft: '8px', fontWeight: 800, textTransform: 'uppercase', color: '#000000' }}>
                          Total
                        </td>
                        <td className="text-right p-mono" style={{ fontWeight: 800, color: '#000000' }}>
                          {groupPieces} PCS
                        </td>
                        <td className="text-right p-mono" style={{ fontWeight: 800, color: '#000000' }}>
                          {renderWithSmallDecimalHtml(groupCft > 0 ? `${groupCft.toFixed(4)} CFT` : '')}
                        </td>
                        {showSqftCol && (
                          <td className="text-right p-mono" style={{ fontWeight: 800, color: '#000000' }}>
                            {renderWithSmallDecimalHtml(groupSqftBilled > 0 ? `${groupSqftBilled.toFixed(2)} SQFT` : '')}
                          </td>
                        )}
                        {showRftCol && (
                          <td className="text-right p-mono" style={{ fontWeight: 800, color: '#000000' }}>
                            {renderWithSmallDecimalHtml(groupRftBilled > 0 ? `${groupRftBilled.toFixed(2)} RFT` : '')}
                          </td>
                        )}
                        <td className="text-right p-mono"></td>
                        <td className="text-center"></td>
                        <td className="text-right p-mono p-wood-subtotal-price" style={{ fontWeight: 800, paddingRight: '8px', color: '#000000' }}>
                          {renderWithSmallDecimalHtml(formatIndianCurrency(groupAmount), 'Rs. ')}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}

                {/* Total Wood Amount row at the end (with guaranteed line under total wood amount) */}
                {totalPieces > 0 && (
                  <tr className="p-total-wood-row">
                    <td className="text-center" style={{ color: '#444' }}></td>
                    <td className="p-item-desc" style={{ paddingLeft: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      TOTAL MATERIALS
                    </td>
                    <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                      {totalPieces} PCS
                    </td>
                    <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                      {renderWithSmallDecimalHtml(totalCft > 0 ? `${totalCft.toFixed(4)} CFT` : '')}
                    </td>
                    {showSqftCol && (
                      <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                        {renderWithSmallDecimalHtml(totalSqftBilled > 0 ? `${totalSqftBilled.toFixed(2)} SQFT` : '')}
                      </td>
                    )}
                    {showRftCol && (
                      <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                        {renderWithSmallDecimalHtml(totalRftBilled > 0 ? `${totalRftBilled.toFixed(2)} RFT` : '')}
                      </td>
                    )}
                    <td className="text-right p-mono"></td>
                    <td className="text-center"></td>
                    <td className="text-right p-mono" style={{ fontWeight: 800, paddingRight: '8px' }}>
                      {renderWithSmallDecimalHtml(formatIndianCurrency(timberTotalAmount), 'Rs. ')}
                    </td>
                  </tr>
                )}

                {/* Additional Charges and Discount rows with zebra striping */}
                {(() => {
                  let chargeIdx = 0;
                  const chargeSpan = 5 + (showSqftCol ? 1 : 0) + (showRftCol ? 1 : 0);
                  return (
                    <>
                      {/* 1. Next: Planing Charges immediately after wood */}
                      {totalPlaning > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={chargeSpan} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            {planingLabel}
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
                          <td colSpan={chargeSpan} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            CARPENTRY WORKS
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(totalCarpentryWorks))}
                          </td>
                        </tr>
                      )}

                      {/* 3. Next: Transportation Charges */}
                      {totalTransportation > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={chargeSpan} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            TRANSPORTATION &amp; DELIVERY CHARGES
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(totalTransportation))}
                          </td>
                        </tr>
                      )}

                      {/* 4. Next: Other Miscellaneous Charges (if any) */}
                      {totalOther > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={chargeSpan} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            {(additionalCharges?.otherLabel || 'OTHER CHARGES').toUpperCase()}
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(totalOther))}
                          </td>
                        </tr>
                      )}

                      {/* 5. Next: GST Line */}
                      {gstAmount > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={chargeSpan} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            GST
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(gstAmount))}
                          </td>
                        </tr>
                      )}

                      {/* 6. Next: Discount Line */}
                      {discountAmount > 0 && (
                        <>
                          <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`} style={{ fontWeight: 800 }}>
                            <td className="text-center"></td>
                            <td colSpan={chargeSpan} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                              TOTAL PRICE BEFORE DISCOUNT
                            </td>
                            <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                              {renderWithSmallDecimalHtml(formatIndianCurrency(subtotalWithCharges + (gstAmount || 0)))}
                            </td>
                          </tr>
                          <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                            <td className="text-center"></td>
                            <td colSpan={chargeSpan} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase', color: '#166534' }}>
                              LESS: DISCOUNT {(discountDesc && discountDesc !== 'LESS: DISCOUNT') ? `(${discountDesc})` : ''}
                            </td>
                            <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#166534' }}>
                              - {renderWithSmallDecimalHtml(formatIndianCurrency(discountAmount))}
                            </td>
                          </tr>
                        </>
                      )}
                    </>
                  );
                })()}

                {/* Spacing rows if fewer items */}
                {validItems.length < 6 && (
                  <tr style={{ height: `${Math.max(25, (6 - validItems.length) * 18)}px` }}>
                    <td colSpan={7 + (showSqftCol ? 1 : 0) + (showRftCol ? 1 : 0)} style={{ borderBottom: 'none' }}></td>
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
                    {renderWithSmallDecimalHtml(totalCft > 0 ? `${totalCft.toFixed(4)} CFT` : '')}
                  </td>
                  {showSqftCol && (
                    <td className="text-right p-mono font-bold">
                      {renderWithSmallDecimalHtml(totalSqftBilled > 0 ? `${totalSqftBilled.toFixed(2)} SQFT` : '')}
                    </td>
                  )}
                  {showRftCol && (
                    <td className="text-right p-mono font-bold">
                      {renderWithSmallDecimalHtml(totalRftBilled > 0 ? `${totalRftBilled.toFixed(2)} RFT` : '')}
                    </td>
                  )}
                  <td colSpan={3} className="text-right p-mono font-bold p-final-total-highlight">
                    {renderWithSmallDecimalHtml(formatIndianCurrency(effectiveTotal), 'Rs. ')}
                  </td>
                </tr>
                {renderAdvanceFooterRows(advanceAmt, remainingAmt, 3 + (showSqftCol ? 1 : 0) + (showRftCol ? 1 : 0), 3, true)}
              </tfoot>
            </table>
          )}
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
  );
};
