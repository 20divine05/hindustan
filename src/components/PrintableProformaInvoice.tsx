import React from 'react';
import type { BusinessSettings, MeasurementItem } from '../types';
import { formatIndianCurrency, numberToIndianCurrencyWords } from '../utils/indianNumberWords';
import { PAYMENT_QR_BASE64 } from '../utils/paymentQrBase64';
import './ProformaInvoice.css';

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

  const totalCft = validItems.reduce((acc, it) => acc + it.cft, 0);
  const totalPieces = validItems.reduce((acc, it) => acc + (typeof it.pieces === 'number' ? it.pieces : 0), 0);
  const timberTotalAmount = validItems.reduce((acc, it) => {
    const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : ratePerCft;
    const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(it.cft * r * 100) / 100;
    return acc + amt;
  }, 0);

  // Append Additional Charges as official line items
  const additionalChargeItems: Array<{
    slNo: number;
    description: string;
    hsn: string;
    cft: number;
    pieces: number;
    rate: number;
    per: string;
    discPercent: string;
    amount: number;
  }> = [];

  let nextChargeIndex = validItems.length + 1;

  const totalCarpentryWorks = (additionalCharges?.carpentry || 0) + (additionalCharges?.sawing || 0);
  if (totalCarpentryWorks > 0) {
    additionalChargeItems.push({
      slNo: nextChargeIndex++,
      description: 'CARPENTRY WORKS',
      hsn: '9988',
      cft: 0,
      pieces: 1,
      rate: totalCarpentryWorks,
      per: 'JOB',
      discPercent: '-',
      amount: totalCarpentryWorks
    });
  }
  if (additionalCharges?.transportation && additionalCharges.transportation > 0) {
    additionalChargeItems.push({
      slNo: nextChargeIndex++,
      description: 'TRANSPORTATION & DELIVERY CHARGES',
      hsn: '9965',
      cft: 0,
      pieces: 1,
      rate: additionalCharges.transportation,
      per: 'TRIP',
      discPercent: '-',
      amount: additionalCharges.transportation
    });
  }
  if (additionalCharges?.planing && additionalCharges.planing > 0) {
    additionalChargeItems.push({
      slNo: nextChargeIndex++,
      description: 'PLANING CHARGES',
      hsn: '9988',
      cft: 0,
      pieces: 1,
      rate: additionalCharges.planing,
      per: 'JOB',
      discPercent: '-',
      amount: additionalCharges.planing
    });
  }
  if (additionalCharges?.other && additionalCharges.other > 0) {
    additionalChargeItems.push({
      slNo: nextChargeIndex++,
      description: (additionalCharges.otherLabel || 'OTHER CHARGES').toUpperCase(),
      hsn: '9988',
      cft: 0,
      pieces: 1,
      rate: additionalCharges.other,
      per: 'JOB',
      discPercent: '-',
      amount: additionalCharges.other
    });
  }

  const additionalChargesSum = additionalChargeItems.reduce((acc, it) => acc + it.amount, 0);
  const subtotalWithCharges = timberTotalAmount + additionalChargesSum;
  const effectiveTotal = finalGrandTotal !== undefined 
    ? finalGrandTotal 
    : Math.max(0, subtotalWithCharges - (discountAmount || 0) + (gstAmount || 0));
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
                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{eWayBillNo || '-'}</span>
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
                <span>{buyerOrderNo || '-'}</span>
              </div>
              <div className="p-meta-cell">
                <span className="p-label">Dated</span>
                <span>{buyerOrderDate || '-'}</span>
              </div>
            </div>

            {/* Row 4: Motor Vehicle No. */}
            <div className="p-meta-grid-row full">
              <div className="p-meta-cell">
                <span className="p-label">Motor Vehicle No.</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>{motorVehicleNo || '-'}</span>
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
                <th style={{ width: '38%', textAlign: 'left', paddingLeft: '8px' }}>Description of Goods</th>
                <th style={{ width: '12%', textAlign: 'right' }}>Quantity</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Alt. Quantity</th>
                <th style={{ width: '12%', textAlign: 'right' }}>Rate</th>
                <th style={{ width: '6%' }}>per</th>
                <th style={{ width: '13%', textAlign: 'right', paddingRight: '8px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {woodGroups.map((group, gIdx) => {
                const groupPieces = group.items.reduce((acc, it) => acc + (typeof it.pieces === 'number' ? it.pieces : 0), 0);
                const groupCft = group.items.reduce((acc, it) => acc + (typeof it.cft === 'number' ? it.cft : 0), 0);
                const groupAmount = group.items.reduce((acc, it) => {
                  const itemRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : ratePerCft;
                  const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(it.cft * itemRate * 100) / 100;
                  return acc + amt;
                }, 0);

                return (
                  <React.Fragment key={`wood-grp-${gIdx}`}>
                    {/* Small Wood Heading */}
                    <tr className="p-item-row" style={{ backgroundColor: '#fbfbfb', borderBottom: '1px solid #ddd' }}>
                      <td className="text-center" style={{ color: '#888', fontSize: '8px', padding: '2px 0' }}>•</td>
                      <td
                        colSpan={6}
                        className="p-item-desc"
                        style={{
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: '#000000',
                          fontSize: '8.5px',
                          padding: '2.5px 8px',
                          textAlign: 'left'
                        }}
                      >
                        {group.wood}
                      </td>
                    </tr>

                    {/* Measurements of that wood */}
                    {group.items.map((it) => {
                      const currentSl = runningSl++;
                      const itemRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : ratePerCft;
                      const amount = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(it.cft * itemRate * 100) / 100;
                      return (
                        <tr key={`item-${currentSl}`} className="p-item-row">
                          <td className="text-center">{currentSl}</td>
                          <td className="p-item-desc" style={{ paddingLeft: '14px', fontWeight: 700 }}>
                            {it.lengthFeet}X{it.widthInches}X{it.thicknessInches}
                          </td>
                          <td className="text-right p-mono">{Number(it.pieces) > 0 ? `${it.pieces} PCS` : '-'}</td>
                          <td className="text-right p-mono">{it.cft > 0 ? `${it.cft.toFixed(4)} CFT` : '-'}</td>
                          <td className="text-right p-mono">{itemRate.toFixed(2)}</td>
                          <td className="text-center">CFT</td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {formatIndianCurrency(amount)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Wood Subtotal Row */}
                    <tr className="p-item-row" style={{ backgroundColor: '#f3f4f6', borderTop: '1px solid #bbb', borderBottom: '1px solid #bbb', fontWeight: 700 }}>
                      <td className="text-center" style={{ color: '#888' }}>-</td>
                      <td className="p-item-desc" style={{ paddingLeft: '8px', fontWeight: 800, textTransform: 'uppercase' }}>
                        Total {group.wood}
                      </td>
                      <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                        {groupPieces} PCS
                      </td>
                      <td className="text-right p-mono" style={{ fontWeight: 800 }}>
                        {groupCft.toFixed(4)} CFT
                      </td>
                      <td className="text-right p-mono">-</td>
                      <td className="text-center">-</td>
                      <td className="text-right p-mono" style={{ fontWeight: 800, paddingRight: '8px' }}>
                        {formatIndianCurrency(groupAmount)}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {/* Additional Services & Charges */}
              {additionalChargeItems.map((charge) => (
                <tr key={`charge-${charge.slNo}`} className="p-item-row">
                  <td className="text-center">{charge.slNo}</td>
                  <td className="p-item-desc font-bold">{charge.description}</td>
                  <td className="text-right p-mono">{charge.pieces} {charge.per}</td>
                  <td className="text-right p-mono">-</td>
                  <td className="text-right p-mono">{charge.rate.toFixed(2)}</td>
                  <td className="text-center">{charge.per}</td>
                  <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                    {formatIndianCurrency(charge.amount)}
                  </td>
                </tr>
              ))}

              {/* GST Line (without percentage mentioned) */}
              {gstAmount > 0 && (
                <tr className="p-item-row" style={{ backgroundColor: '#fafafa' }}>
                  <td className="text-center">{runningSl++}</td>
                  <td className="p-item-desc" style={{ fontWeight: 800 }}>
                    GST
                  </td>
                  <td className="text-right p-mono">-</td>
                  <td className="text-right p-mono">-</td>
                  <td className="text-right p-mono">-</td>
                  <td className="text-center">-</td>
                  <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                    {formatIndianCurrency(gstAmount)}
                  </td>
                </tr>
              )}

              {/* Finally Discount Line */}
              {discountAmount > 0 && (
                <tr className="p-item-row" style={{ backgroundColor: '#fcfcfc' }}>
                  <td className="text-center">{runningSl++}</td>
                  <td className="p-item-desc" style={{ fontStyle: 'italic', color: '#166534', fontWeight: 700 }}>
                    LESS: DISCOUNT {discountDesc ? `(${discountDesc})` : ''}
                  </td>
                  <td className="text-right p-mono">-</td>
                  <td className="text-right p-mono">-</td>
                  <td className="text-right p-mono">-</td>
                  <td className="text-center">DISC</td>
                  <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#166534' }}>
                    - {formatIndianCurrency(discountAmount)}
                  </td>
                </tr>
              )}

              {/* Spacing rows if fewer items */}
              {validItems.length + additionalChargeItems.length < 6 && (
                <tr style={{ height: `${Math.max(30, (6 - (validItems.length + additionalChargeItems.length)) * 20)}px` }}>
                  <td colSpan={7} style={{ borderBottom: 'none' }}></td>
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
                  {totalCft.toFixed(4)} CFT
                </td>
                <td></td>
                <td></td>
                <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                  ₹ {formatIndianCurrency(effectiveTotal)}
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
