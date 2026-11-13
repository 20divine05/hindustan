import React from 'react';
import type { BusinessSettings, MeasurementItem } from '../types';
import { formatIndianCurrency, numberToIndianCurrencyWords } from '../utils/indianNumberWords';
import { PAYMENT_QR_BASE64 } from '../utils/paymentQrBase64';
import './ProformaInvoice.css';

export const renderDimensionHtml = (dim: string) => {
  if (!dim) return null;
  const parts = dim.trim().split(/([xX×])/);
  if (parts.length <= 1) {
    const formatted = /^\d+$/.test(dim.trim()) ? dim.trim().padStart(2, '0') : dim;
    return <span className="p-dim-num">{formatted}</span>;
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
        const formatted = /^\d+$/.test(p) ? p.padStart(2, '0') : p;
        return (
          <span key={idx} className="p-dim-num">
            {formatted}
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
  if (dotIdx === -1) {
    return <>{prefix}{str}{suffix}</>;
  }
  const before = str.slice(0, dotIdx);
  if (!/\d/.test(before)) {
    return <>{prefix}{str}{suffix}</>;
  }
  const after = str.slice(dotIdx + 1);
  const match = after.match(/^(\d+)(.*)$/);
  if (!match) {
    return <>{prefix}{str}{suffix}</>;
  }
  const intStr = str.slice(0, dotIdx + 1);
  const decStr = match[1];
  const postStr = match[2];

  return (
    <>
      {prefix}
      <span>{intStr}</span>
      <span className="p-dec-small">{decStr}</span>
      {postStr}
      {suffix}
    </>
  );
};

export interface PrintableProformaInvoiceProps {
  businessSettings?: BusinessSettings;
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
  consigneeAddress?: string;
  consigneeGstin?: string;
  consigneeState?: string;
  consigneeStateCode?: string;

  buyerName?: string;
  buyerAddress?: string;
  buyerGstin?: string;
  buyerState?: string;
  buyerStateCode?: string;

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
  invoiceNo = '8',
  eWayBillNo = '',
  invoiceDate = '29-Oct-26',
  paymentTerms = 'IMMEDIATE PAYMENT',
  buyerOrderNo = '',
  buyerOrderDate = '',
  destination = 'BANGALORE',
  motorVehicleNo = '',
  termsOfDelivery = 'TRANSPORTATION EXTRA\nAPPLICABLE GST EXTRA',

  consigneeName = 'New India Saw Mill',
  consigneeAddress = 'Sy.No.10/7 Khata No.27/2/100/10/7, Sir M\nVishveshwaraiah Layout, 3rd Block, Bengaluru, Near\nNammoora Thindi, Bengaluru Urban',
  consigneeGstin = '29CJZPK3158H1ZG',
  consigneeState = 'Karnataka',
  consigneeStateCode = '29',

  buyerName = 'New India Saw Mill',
  buyerAddress = 'Sy.No.10/7 Khata No.27/2/100/10/7, Sir M\nVishveshwaraiah Layout, 3rd Block, Bengaluru, Near\nNammoora Thindi, Bengaluru Urban',
  buyerGstin = '29CJZPK3158H1ZG',
  buyerState = 'Karnataka',
  buyerStateCode = '29',

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

  // Ensure items within each wood species group are sorted strictly by mill specification: Width Asc -> Length Desc -> Thickness Desc
  for (const group of woodGroups) {
    group.items.sort((a, b) => {
      const wA = typeof a.widthInches === 'number' ? a.widthInches : parseFloat(String(a.widthInches)) || 0;
      const wB = typeof b.widthInches === 'number' ? b.widthInches : parseFloat(String(b.widthInches)) || 0;
      if (wA !== wB) return wA - wB;

      const lA = typeof a.lengthFeet === 'number' ? a.lengthFeet : parseFloat(String(a.lengthFeet)) || 0;
      const lB = typeof b.lengthFeet === 'number' ? b.lengthFeet : parseFloat(String(b.lengthFeet)) || 0;
      if (lA !== lB) return lB - lA;

      const tA = typeof a.thicknessInches === 'number' ? a.thicknessInches : parseFloat(String(a.thicknessInches)) || 0;
      const tB = typeof b.thicknessInches === 'number' ? b.thicknessInches : parseFloat(String(b.thicknessInches)) || 0;
      if (tA !== tB) return tB - tA;

      const pA = typeof a.pieces === 'number' ? a.pieces : parseFloat(String(a.pieces)) || 0;
      const pB = typeof b.pieces === 'number' ? b.pieces : parseFloat(String(b.pieces)) || 0;
      return pB - pA;
    });
  }

  const totalCft = validItems.reduce((acc, it) => acc + (typeof it.cft === 'number' ? it.cft : 0), 0);
  const totalPieces = validItems.reduce((acc, it) => acc + (typeof it.pieces === 'number' ? it.pieces : 0), 0);

  const totalSqftBilled = validItems
    .filter((it) => (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit !== 'CFT')
    .reduce((acc, it) => acc + (typeof it.sqft === 'number' ? it.sqft : 0), 0);

  const totalCftBilled = validItems
    .filter((it) => !((typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit !== 'CFT'))
    .reduce((acc, it) => acc + (typeof it.cft === 'number' ? it.cft : 0), 0);

  const timberTotalAmount = validItems.reduce((acc, it) => {
    const isSqft = (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit !== 'CFT';
    const defaultRowRate = isSqft ? 120 : ratePerCft;
    const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
    const mult = isSqft ? (typeof it.sqft === 'number' ? it.sqft : 0) : it.cft;
    const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(mult * r * 100) / 100;
    return acc + amt;
  }, 0);

  const totalCarpentryWorks = (additionalCharges?.carpentry || 0) + (additionalCharges?.sawing || 0);
  const totalTransportation = additionalCharges?.transportation || 0;
  const totalPlaning = additionalCharges?.planing || 0;
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
        <div className="p-header-title">PROFORMA INVOICE</div>

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
                <div className="p-seller-line">VISHVESHWARA NAGAR MYSOREE - 570008</div>
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
              <div className="p-party-meta" style={{ marginTop: '3px' }}>
                <span className="p-party-meta-label">GSTIN/UIN</span>
                <span className="p-party-meta-separator">: </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 800 }}>
                  {consigneeGstin || '29CJZPK3158H1ZG'}
                </span>
              </div>
              <div className="p-party-meta">
                <span className="p-party-meta-label">State Name</span>
                <span className="p-party-meta-separator">: </span>
                <span style={{ flex: 2 }}>{consigneeState || 'Karnataka'}</span>
                <span style={{ margin: '0 4px', fontSize: '8.5px' }}>Code:</span>
                <span style={{ width: '38px', textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>
                  {consigneeStateCode || '29'}
                </span>
              </div>
            </div>

            {/* Buyer (Bill to) */}
            <div className="p-party-box" style={{ borderBottom: 'none' }}>
              <div className="p-party-heading">Buyer (Bill to)</div>
              <div style={{ fontWeight: 800, fontSize: '9.2px', textTransform: 'uppercase', marginBottom: '2px' }}>
                {buyerName || consigneeName || 'New India Saw Mill'}
              </div>
              <div className="p-print-preline" style={{ whiteSpace: 'pre-line', fontSize: '8.2px', lineHeight: 1.35, color: '#1a1a1a' }}>
                {buyerAddress || consigneeAddress || 'Local Mill Pickup'}
              </div>
              <div className="p-party-meta" style={{ marginTop: '3px' }}>
                <span className="p-party-meta-label">GSTIN/UIN</span>
                <span className="p-party-meta-separator">: </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 800 }}>
                  {buyerGstin || consigneeGstin || '29CJZPK3158H1ZG'}
                </span>
              </div>
              <div className="p-party-meta">
                <span className="p-party-meta-label">State Name</span>
                <span className="p-party-meta-separator">: </span>
                <span style={{ flex: 2 }}>{buyerState || consigneeState || 'Karnataka'}</span>
                <span style={{ margin: '0 4px', fontSize: '8.5px' }}>Code:</span>
                <span style={{ width: '38px', textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>
                  {buyerStateCode || consigneeStateCode || '29'}
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
                <span style={{ fontWeight: 700 }}>{destination || 'BANGALORE'}</span>
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
          <table className="p-items-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>Sl<br />No.</th>
                <th style={{ width: '30%', textAlign: 'left', paddingLeft: '8px' }}>Description of Goods</th>
                <th style={{ width: '11%', textAlign: 'right' }}>Quantity</th>
                <th style={{ width: '13%', textAlign: 'right' }}>Alt. Quantity</th>
                <th style={{ width: '13%', textAlign: 'right' }}>SQFT</th>
                <th style={{ width: '11%', textAlign: 'right' }}>Rate</th>
                <th style={{ width: '7%', textAlign: 'center', whiteSpace: 'nowrap' }}>per</th>
                <th style={{ width: '12%', textAlign: 'left', paddingLeft: '8px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {woodGroups.map((group, gIdx) => {
                const groupPieces = group.items.reduce((acc, it) => acc + (typeof it.pieces === 'number' ? it.pieces : 0), 0);
                const groupCft = group.items.reduce((acc, it) => acc + (typeof it.cft === 'number' ? it.cft : 0), 0);
                const groupSqftBilled = group.items
                  .filter((it) => (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit === 'SQFT')
                  .reduce((acc, it) => acc + (typeof it.sqft === 'number' ? it.sqft : 0), 0);
                const groupCftBilled = group.items
                  .filter((it) => !((typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit !== 'CFT'))
                  .reduce((acc, it) => acc + (typeof it.cft === 'number' ? it.cft : 0), 0);
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
                      const slStr = currentSl < 10 ? `0${currentSl}` : currentSl;

                      return (
                        <tr key={`item-${currentSl}`} className={`p-item-row ${itemIdx % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                          <td className="text-center">{slStr}</td>
                          <td className="p-item-desc" style={{ paddingLeft: '8px' }}>
                            {renderDimensionHtml(`${it.lengthFeet}X${it.widthInches}X${it.thicknessInches}`)}
                          </td>
                          <td className="text-right p-mono">{Number(it.pieces) > 0 ? `${it.pieces} PCS` : ''}</td>
                          <td className="text-right p-mono">{renderWithSmallDecimalHtml(isSqftBilled ? '' : (it.cft > 0 ? `${it.cft.toFixed(4)} CFT` : ''))}</td>
                          <td className="text-right p-mono">{renderWithSmallDecimalHtml(isSqftBilled ? (it.sqft > 0 ? `${it.sqft.toFixed(2)} SQFT` : '') : '')}</td>
                          <td className="text-right p-mono">{renderWithSmallDecimalHtml(itemRate.toFixed(2))}</td>
                          <td className="text-center" style={{ whiteSpace: 'nowrap' }}>{isSqftBilled ? 'SQFT' : 'CFT'}</td>
                          <td className="text-left p-mono font-bold" style={{ paddingLeft: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(amount))}
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
                    {renderWithSmallDecimalHtml(totalCftBilled > 0 ? `${totalCftBilled.toFixed(4)} CFT` : `${totalCft.toFixed(4)} CFT`)}
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
                          PLANING CHARGES
                        </td>
                        <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                          {renderWithSmallDecimalHtml(formatIndianCurrency(totalPlaning))}
                        </td>
                      </tr>
                    )}

                    {/* 2. Next: GST Line immediately after Planing Charges */}
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

                    {/* 3. Next: Carpentry Charges after GST */}
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

                    {/* 4. Next: Transport Charges after Carpentry */}
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

                    {/* 5. Next: Other Miscellaneous Charges (if any) */}
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
