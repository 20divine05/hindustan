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
import { groupRoundLogsBySpeciesAndSlab, getRoundLogUnitConfig } from '../utils/roundLogCalculator';
import { formatValue } from '../utils/calculator';
import './ProformaInvoice.css';

export const renderDimensionHtml = (dim: string) => {
  if (!dim) return null;
  const parts = dim.trim().split(/([xX×])/);
  if (parts.length <= 1) {
    const clean = dim.trim().replace(/^0+(\d)/, '$1');
    return <span className="p-dim-num">{clean}</span>;
  }
  return (
    <span>
      {parts.map((p, idx) => {
        if (p.toLowerCase() === 'x' || p === '×') {
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
    </span>
  );
};

export const renderWithSmallDecimalHtml = (val: string | number | undefined | null, prefix: string = '', suffix: string = '') => {
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
      <span>{intStr}</span>
      <span className="p-dec-small">{decStr}</span>
      {postStr}
      {suffix}
    </span>
  );
};

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
  finalGrandTotal
}) => {
  const isRound = logType === 'round';
  const roundUnitConfig = getRoundLogUnitConfig(roundLogInputUnit);
  const roundSpeciesData = groupRoundLogsBySpeciesAndSlab(
    roundLogItems,
    roundLogOutputUnit,
    roundLogInputUnit,
    roundLogSlabRates
  );

  const validItems = items.filter(
    (it) => typeof it.lengthFeet === 'number' && it.lengthFeet > 0 && typeof it.pieces === 'number' && it.pieces > 0
  );

  // Group valid timber items by wood type while preserving sequential order
  const woodGroups: Array<{ wood: string; items: typeof validItems }> = [];
  const woodMap = new Map<string, typeof validItems>();

  for (const it of validItems) {
    const wood = (it.woodType || 'MAHAGONY').trim().toUpperCase();
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
      const wA = typeof a.widthInches === 'number' ? a.widthInches : parseFloat(String(a.widthInches)) || 0;
      const wB = typeof b.widthInches === 'number' ? b.widthInches : parseFloat(String(b.widthInches)) || 0;
      if (wA !== wB) return wA - wB;

      const tA = typeof a.thicknessInches === 'number' ? a.thicknessInches : parseFloat(String(a.thicknessInches)) || 0;
      const tB = typeof b.thicknessInches === 'number' ? b.thicknessInches : parseFloat(String(b.thicknessInches)) || 0;
      if (tA !== tB) return tB - tA;

      const lA = typeof a.lengthFeet === 'number' ? a.lengthFeet : parseFloat(String(a.lengthFeet)) || 0;
      const lB = typeof b.lengthFeet === 'number' ? b.lengthFeet : parseFloat(String(b.lengthFeet)) || 0;
      if (lA !== lB) return lB - lA;

      const pA = typeof a.pieces === 'number' ? a.pieces : parseFloat(String(a.pieces)) || 0;
      const pB = typeof b.pieces === 'number' ? b.pieces : parseFloat(String(b.pieces)) || 0;
      return pB - pA;
    });
  }

  let totalCft = 0;
  let totalCbm = 0;
  let totalPieces = 0;
  let totalSqftBilled = 0;
  let timberTotalAmount = 0;

  if (isRound) {
    totalPieces = roundSpeciesData.overallTotals.totalPieces;
    totalCft = roundSpeciesData.overallTotals.totalCft;
    totalCbm = roundSpeciesData.overallTotals.totalCbm;
    timberTotalAmount = roundSpeciesData.overallTotals.totalAmount;
  } else {
    totalCft = validItems.reduce((acc, it) => acc + (typeof it.cft === 'number' ? it.cft : 0), 0);
    totalPieces = validItems.reduce((acc, it) => acc + (typeof it.pieces === 'number' ? it.pieces : 0), 0);

    totalSqftBilled = validItems
      .filter((it) => (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit !== 'CFT')
      .reduce((acc, it) => acc + (typeof it.sqft === 'number' ? it.sqft : 0), 0);

    timberTotalAmount = validItems.reduce((acc, it) => {
      const isSqft = (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit !== 'CFT';
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
  const planingLabel = planingRate > 0 ? `PLANING CHARGES (Rs. ${planingRate}/${planingUnitLabel})` : 'PLANING CHARGES';
  const totalOther = additionalCharges?.other || 0;
  const additionalChargesSum = totalCarpentryWorks + totalTransportation + totalPlaning + totalOther;

  const subtotalWithCharges = timberTotalAmount + additionalChargesSum;
  const computedFallback = Math.max(0, subtotalWithCharges - (discountAmount || 0) + (gstAmount || 0));
  const effectiveTotal = (finalGrandTotal !== undefined && finalGrandTotal > 0)
    ? finalGrandTotal
    : (computedFallback > 0 ? computedFallback : timberTotalAmount);
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
                  <th rowSpan={2} style={{ width: '3.5%' }}>Log<br />No.</th>
                  <th rowSpan={2} style={{ width: '6.5%' }}>Length<br />({roundUnitConfig.lengthUnit})</th>
                  <th colSpan={2} style={{ width: '9%' }}>Girth in feet</th>
                  <th rowSpan={2} style={{ width: '6.0%' }}>Girth<br />(inch)</th>
                  <th rowSpan={2} style={{ width: '8.0%', textAlign: 'right' }}>Cubic feet</th>
                  <th rowSpan={2} style={{ width: '8.0%', textAlign: 'right' }}>Cubic meter</th>
                  <th rowSpan={2} style={{ width: '6.5%', textAlign: 'right' }}>Upto 23&quot;</th>
                  <th rowSpan={2} style={{ width: '6.5%', textAlign: 'right' }}>Above 24&quot;</th>
                  <th rowSpan={2} style={{ width: '6.5%', textAlign: 'right' }}>Above 36&quot;</th>
                  <th rowSpan={2} style={{ width: '6.5%', textAlign: 'right' }}>Above 48&quot;</th>
                  <th rowSpan={2} style={{ width: '6.5%', textAlign: 'right' }}>Above 60&quot;</th>
                  <th rowSpan={2} style={{ width: '7.5%', textAlign: 'right' }}>Rate</th>
                  <th rowSpan={2} style={{ width: '4.5%', textAlign: 'center' }}>per</th>
                  <th rowSpan={2} style={{ width: '14.5%', textAlign: 'right', paddingRight: '8px' }}>Amount</th>
                </tr>
                <tr>
                  <th style={{ width: '4.5%', textAlign: 'center', borderRight: '1px dashed #666' }}>ft</th>
                  <th style={{ width: '4.5%', textAlign: 'center' }}>in</th>
                </tr>
              </thead>
              <tbody>
                {roundSpeciesData.speciesGroups.map((group, gIdx) => (
                  <React.Fragment key={`round-sp-${gIdx}`}>
                    {/* Wood Species Heading Row */}
                    <tr className="p-wood-heading-row">
                      <td></td>
                      <td colSpan={14} className="p-wood-heading-desc">
                        {group.woodType.toUpperCase()}
                      </td>
                    </tr>

                    {/* Individual Log Rows */}
                    {group.items.map((it, itemIdx) => {
                      const currentSl = runningSl++;
                      const l = typeof it.length === 'number' ? it.length : 0;
                      const gInches = typeof it.girthInches === 'number' ? it.girthInches : (typeof it.girth === 'number' ? it.girth : 0);
                      const gFt = typeof it.girthFt === 'number' ? it.girthFt : Math.floor(gInches / 12);
                      const gIn = typeof it.girthInPart === 'number' ? it.girthInPart : Math.round((gInches % 12) * 10) / 10;
                      const cftVal = typeof it.cft === 'number' && it.cft > 0 ? it.cft : (roundLogOutputUnit === 'CFT' ? it.volume : it.volume * 35.3147);
                      const cbmVal = typeof it.cbm === 'number' && it.cbm > 0 ? it.cbm : (roundLogOutputUnit === 'CBM' ? it.volume : it.volume / 35.3147);
                      const activeVol = roundLogOutputUnit === 'CFT' ? cftVal : cbmVal;
                      const itRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : 0;
                      const itAmount = typeof it.amount === 'number' && it.amount > 0 ? it.amount : (itRate > 0 ? Math.round(activeVol * itRate * 100) / 100 : 0);

                      return (
                        <tr key={`r-item-${currentSl}`} className={`p-item-row ${itemIdx % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center">{it.serialNumber || currentSl}</td>
                          <td className="text-center font-bold">{l}</td>
                          <td className="text-center font-bold p-dashed-divider">{gFt}</td>
                          <td className="text-center font-bold">{gIn}</td>
                          <td className="text-center">{formatValue(gInches, 1)}&quot;</td>
                          <td className="text-right p-mono">{renderWithSmallDecimalHtml(formatValue(cftVal, 4))}</td>
                          <td className="text-right p-mono">{renderWithSmallDecimalHtml(formatValue(cbmVal, 4))}</td>
                          <td className="text-right p-mono" style={it.slabId === 'upto_23' ? { backgroundColor: '#fef3c7', fontWeight: 700 } : undefined}>
                            {it.slabId === 'upto_23' ? renderWithSmallDecimalHtml(formatValue(activeVol, 4)) : '-'}
                          </td>
                          <td className="text-right p-mono" style={it.slabId === 'above_24' ? { backgroundColor: '#fef3c7', fontWeight: 700 } : undefined}>
                            {it.slabId === 'above_24' ? renderWithSmallDecimalHtml(formatValue(activeVol, 4)) : '-'}
                          </td>
                          <td className="text-right p-mono" style={it.slabId === 'above_36' ? { backgroundColor: '#fef3c7', fontWeight: 700 } : undefined}>
                            {it.slabId === 'above_36' ? renderWithSmallDecimalHtml(formatValue(activeVol, 4)) : '-'}
                          </td>
                          <td className="text-right p-mono" style={it.slabId === 'above_48' ? { backgroundColor: '#fef3c7', fontWeight: 700 } : undefined}>
                            {it.slabId === 'above_48' ? renderWithSmallDecimalHtml(formatValue(activeVol, 4)) : '-'}
                          </td>
                          <td className="text-right p-mono" style={it.slabId === 'above_60' ? { backgroundColor: '#fef3c7', fontWeight: 700 } : undefined}>
                            {it.slabId === 'above_60' ? renderWithSmallDecimalHtml(formatValue(activeVol, 4)) : '-'}
                          </td>
                          <td className="text-right p-mono">{itRate > 0 ? renderWithSmallDecimalHtml(formatValue(itRate, 2)) : ''}</td>
                          <td className="text-center">{roundLogOutputUnit}</td>
                          <td className="text-right p-mono p-item-amount" style={{ paddingRight: '8px', fontWeight: 600, color: '#111827' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(itAmount))}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Species Subtotal Row */}
                    <tr className="p-item-row p-wood-subtotal-row" style={{ backgroundColor: '#f3f4f6', borderTop: '1px solid #222222', borderBottom: '1px solid #222222', fontWeight: 800 }}>
                      <td></td>
                      <td className="text-left font-bold" style={{ paddingLeft: '8px' }}>Total</td>
                      <td className="text-center font-bold p-dashed-divider">{group.totalPieces}</td>
                      <td className="text-center font-bold">LOGS</td>
                      <td></td>
                      <td className="text-right p-mono font-bold">{renderWithSmallDecimalHtml(formatValue(group.totalCft, 4))}</td>
                      <td className="text-right p-mono font-bold">{renderWithSmallDecimalHtml(formatValue(group.totalCbm, 4))}</td>
                      <td className="text-right p-mono font-bold">{group.slabs.upto_23.volume > 0 ? renderWithSmallDecimalHtml(formatValue(group.slabs.upto_23.volume, 4)) : '-'}</td>
                      <td className="text-right p-mono font-bold">{group.slabs.above_24.volume > 0 ? renderWithSmallDecimalHtml(formatValue(group.slabs.above_24.volume, 4)) : '-'}</td>
                      <td className="text-right p-mono font-bold">{group.slabs.above_36.volume > 0 ? renderWithSmallDecimalHtml(formatValue(group.slabs.above_36.volume, 4)) : '-'}</td>
                      <td className="text-right p-mono font-bold">{group.slabs.above_48.volume > 0 ? renderWithSmallDecimalHtml(formatValue(group.slabs.above_48.volume, 4)) : '-'}</td>
                      <td className="text-right p-mono font-bold">{group.slabs.above_60.volume > 0 ? renderWithSmallDecimalHtml(formatValue(group.slabs.above_60.volume, 4)) : '-'}</td>
                      <td></td>
                      <td></td>
                      <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#000000' }}>
                        {renderWithSmallDecimalHtml(formatIndianCurrency(group.totalAmount), 'Rs. ')}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}

                {/* Girth-Slab Summary row right above TOTAL WOOD AMOUNT */}
                {totalPieces > 0 && (
                  <tr className="p-item-row" style={{ backgroundColor: '#fef3c7', borderTop: '1px solid #222', borderBottom: '1px solid #222', fontWeight: 800 }}>
                    <td></td>
                    <td colSpan={4} className="text-left font-bold" style={{ paddingLeft: '8px' }}>
                      GIRTH-SLAB SUMMARY ({roundLogOutputUnit}):
                    </td>
                    <td className="text-right p-mono font-bold">{renderWithSmallDecimalHtml(formatValue(totalCft, 4))}</td>
                    <td className="text-right p-mono font-bold">{renderWithSmallDecimalHtml(formatValue(totalCbm, 4))}</td>
                    <td className="text-right p-mono font-bold">{roundSpeciesData.overallTotals.slabs.upto_23.volume > 0 ? renderWithSmallDecimalHtml(formatValue(roundSpeciesData.overallTotals.slabs.upto_23.volume, 4)) : '-'}</td>
                    <td className="text-right p-mono font-bold">{roundSpeciesData.overallTotals.slabs.above_24.volume > 0 ? renderWithSmallDecimalHtml(formatValue(roundSpeciesData.overallTotals.slabs.above_24.volume, 4)) : '-'}</td>
                    <td className="text-right p-mono font-bold">{roundSpeciesData.overallTotals.slabs.above_36.volume > 0 ? renderWithSmallDecimalHtml(formatValue(roundSpeciesData.overallTotals.slabs.above_36.volume, 4)) : '-'}</td>
                    <td className="text-right p-mono font-bold">{roundSpeciesData.overallTotals.slabs.above_48.volume > 0 ? renderWithSmallDecimalHtml(formatValue(roundSpeciesData.overallTotals.slabs.above_48.volume, 4)) : '-'}</td>
                    <td className="text-right p-mono font-bold">{roundSpeciesData.overallTotals.slabs.above_60.volume > 0 ? renderWithSmallDecimalHtml(formatValue(roundSpeciesData.overallTotals.slabs.above_60.volume, 4)) : '-'}</td>
                    <td></td>
                    <td></td>
                    <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                      {totalPieces} LOGS
                    </td>
                  </tr>
                )}

                {/* TOTAL WOOD AMOUNT row */}
                {totalPieces > 0 && (
                  <tr className="p-total-wood-row">
                    <td></td>
                    <td colSpan={4} className="p-item-desc" style={{ paddingLeft: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      TOTAL WOOD AMOUNT
                    </td>
                    <td className="text-right p-mono font-bold">{renderWithSmallDecimalHtml(`${formatValue(totalCft, 4)} CFT`)}</td>
                    <td className="text-right p-mono font-bold">{renderWithSmallDecimalHtml(`${formatValue(totalCbm, 4)} CBM`)}</td>
                    <td colSpan={5} className="text-center font-bold p-mono" style={{ letterSpacing: '0.02em' }}>
                      {totalPieces} LOGS CLASSIFIED
                    </td>
                    <td></td>
                    <td></td>
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
                          <td colSpan={13} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
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
                          <td colSpan={13} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
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
                          <td colSpan={13} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
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
                          <td colSpan={13} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
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
                          <td colSpan={13} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            GST
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(gstAmount))}
                          </td>
                        </tr>
                      )}

                      {discountAmount > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td></td>
                          <td colSpan={13} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase', color: '#166534' }}>
                            LESS: DISCOUNT {discountDesc ? `(${discountDesc})` : ''}
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#166534' }}>
                            - {renderWithSmallDecimalHtml(formatIndianCurrency(discountAmount))}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })()}

                {roundLogItems.length < 6 && (
                  <tr style={{ height: `${Math.max(25, (6 - roundLogItems.length) * 18)}px` }}>
                    <td colSpan={15} style={{ borderBottom: 'none' }}></td>
                  </tr>
                )}
              </tbody>

              {/* Total Row */}
              <tfoot>
                <tr className="p-total-row">
                  <td colSpan={2} style={{ textAlign: 'right', fontWeight: 800, paddingRight: '12px' }}>
                    Total
                  </td>
                  <td colSpan={2} className="text-center p-mono font-bold p-dashed-divider">
                    {totalPieces} LOGS
                  </td>
                  <td></td>
                  <td className="text-right p-mono font-bold">
                    {renderWithSmallDecimalHtml(`${formatValue(totalCft, 4)} CFT`)}
                  </td>
                  <td className="text-right p-mono font-bold">
                    {renderWithSmallDecimalHtml(`${formatValue(totalCbm, 4)} CBM`)}
                  </td>
                  <td colSpan={5} className="text-center p-mono font-bold" style={{ fontSize: '9px', color: '#4b5563' }}>
                    5 GIRTH SLABS BILLED
                  </td>
                  <td colSpan={3} className="text-right p-mono font-bold p-final-total-highlight">
                    {renderWithSmallDecimalHtml(formatIndianCurrency(effectiveTotal), 'Rs. ')}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="p-items-table">
              <thead>
                <tr>
                  <th style={{ width: '3.5%' }}>Sl<br />No.</th>
                  <th style={{ width: '17.5%', textAlign: 'left', paddingLeft: '8px' }}>Description of Goods</th>
                  <th style={{ width: '8.5%', textAlign: 'right' }}>Quantity</th>
                  <th style={{ width: '16.5%', textAlign: 'right' }}>Alt. Quantity</th>
                  <th style={{ width: '16.5%', textAlign: 'right' }}>SQFT</th>
                  <th style={{ width: '9%', textAlign: 'right' }}>Rate</th>
                  <th style={{ width: '5%', textAlign: 'center', whiteSpace: 'nowrap' }}>per</th>
                  <th style={{ width: '23.5%', textAlign: 'left', paddingLeft: '8px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {woodGroups.map((group, gIdx) => {
                  const groupPieces = group.items.reduce((acc, it) => acc + (typeof it.pieces === 'number' ? it.pieces : 0), 0);
                  const groupCft = group.items.reduce((acc, it) => acc + (typeof it.cft === 'number' ? it.cft : 0), 0);
                  const groupSqftBilled = group.items
                    .filter((it) => (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit === 'SQFT')
                    .reduce((acc, it) => acc + (typeof it.sqft === 'number' ? it.sqft : 0), 0);
                  const groupAmount = group.items.reduce((acc, it) => {
                    const isSqft = (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit !== 'CFT';
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
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>

                      {/* Measurements of that wood (with zebra striping and small decimals) */}
                      {group.items.map((it, itemIdx) => {
                        const currentSl = runningSl++;
                        const w = typeof it.widthInches === 'number' ? it.widthInches : 0;
                        const isSqftBilled = w >= 7 && it.rateUnit !== 'CFT';
                        const defaultRowRate = isSqftBilled ? 120 : ratePerCft;
                        const itemRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
                        const mult = isSqftBilled ? (typeof it.sqft === 'number' ? it.sqft : 0) : it.cft;
                        const amount = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(mult * itemRate * 100) / 100;
                        const slStr = String(currentSl);

                        return (
                          <tr key={`item-${currentSl}`} className={`p-item-row ${itemIdx % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                            <td className="text-center">{slStr}</td>
                            <td className="p-item-desc" style={{ paddingLeft: '8px' }}>
                              {renderDimensionHtml(`${it.lengthFeet}X${it.widthInches}X${it.thicknessInches}`)}
                            </td>
                            <td className="text-right p-mono">{Number(it.pieces) > 0 ? `${it.pieces} PCS` : ''}</td>
                            <td className="text-right p-mono">{renderWithSmallDecimalHtml(it.cft > 0 ? `${it.cft.toFixed(4)} CFT` : '')}</td>
                            <td className="text-right p-mono">{renderWithSmallDecimalHtml(isSqftBilled ? (it.sqft > 0 ? `${it.sqft.toFixed(2)} SQFT` : '') : '')}</td>
                            <td className="text-right p-mono">{renderWithSmallDecimalHtml(itemRate.toFixed(2))}</td>
                            <td className="text-center" style={{ whiteSpace: 'nowrap' }}>{isSqftBilled ? 'SQFT' : 'CFT'}</td>
                            <td className="text-left p-mono p-item-amount" style={{ paddingLeft: '8px', fontWeight: 500, color: '#4b5563' }}>
                              {renderWithSmallDecimalHtml(formatIndianCurrency(amount))}
                            </td>
                          </tr>
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
                        <td className="text-right p-mono" style={{ fontWeight: 800, color: '#000000' }}>
                          {renderWithSmallDecimalHtml(groupSqftBilled > 0 ? `${groupSqftBilled.toFixed(2)} SQFT` : '')}
                        </td>
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
                      TOTAL WOOD AMOUNT
                    </td>
                    <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                      {totalPieces} PCS
                    </td>
                    <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                      {renderWithSmallDecimalHtml(totalCft > 0 ? `${totalCft.toFixed(4)} CFT` : '')}
                    </td>
                    <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                      {renderWithSmallDecimalHtml(totalSqftBilled > 0 ? `${totalSqftBilled.toFixed(2)} SQFT` : '')}
                    </td>
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
                  return (
                    <>
                      {/* 1. Next: Planing Charges immediately after wood */}
                      {totalPlaning > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
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
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
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
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
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
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
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
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                            GST
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(gstAmount))}
                          </td>
                        </tr>
                      )}

                      {/* 6. Next: Discount Line */}
                      {discountAmount > 0 && (
                        <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center"></td>
                          <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase', color: '#166534' }}>
                            LESS: DISCOUNT {discountDesc ? `(${discountDesc})` : ''}
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#166534' }}>
                            - {renderWithSmallDecimalHtml(formatIndianCurrency(discountAmount))}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })()}

                {/* Spacing rows if fewer items */}
                {validItems.length < 6 && (
                  <tr style={{ height: `${Math.max(25, (6 - validItems.length) * 18)}px` }}>
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
                    {renderWithSmallDecimalHtml(totalSqftBilled > 0 ? `${totalSqftBilled.toFixed(2)} SQFT` : '')}
                  </td>
                  <td colSpan={3} className="text-right p-mono font-bold p-final-total-highlight">
                    {renderWithSmallDecimalHtml(formatIndianCurrency(effectiveTotal), 'Rs. ')}
                  </td>
                </tr>
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
