import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BusinessSettings, MeasurementSheet } from '../types';
import { LOGO_ICON_BASE64 } from './logoBase64';
import { PAYMENT_QR_BASE64 } from './paymentQrBase64';
import { numberToIndianCurrencyWords, formatIndianCurrency } from './indianNumberWords';
import { sortTimberEntries } from './calculator';

export interface ProformaInvoiceExportData {
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

  items?: Array<{
    slNo: number;
    description: string;
    hsn: string;
    cft: number;
    sqft?: number;
    widthInches?: number | '';
    rateUnit?: 'CFT' | 'SQFT';
    pieces: number;
    rate: number;
    per: string;
    discPercent: string;
    amount: number;
  }>;

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

  bankHolder?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
}

function formatDateToInvoice(dateStr?: string): string {
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

export function createProformaInvoiceDoc(
  sheet: MeasurementSheet,
  settings?: BusinessSettings,
  invoiceData?: ProformaInvoiceExportData
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const formattedDate = invoiceData?.invoiceDate || formatDateToInvoice(sheet.measurementDate);
  const invoiceNo = invoiceData?.invoiceNo || (sheet.referenceNumber ? sheet.referenceNumber.replace('REF-', '') : '8');
  const eWayBillNo = invoiceData?.eWayBillNo || '';
  const paymentTerms = invoiceData?.paymentTerms || 'IMMEDIATE PAYMENT';
  const buyerOrderNo = invoiceData?.buyerOrderNo || '';
  const buyerOrderDate = invoiceData?.buyerOrderDate || '';
  const destination = invoiceData?.destination || 'BANGLORE';
  const motorVehicleNo = invoiceData?.motorVehicleNo || '';
  const termsOfDelivery = invoiceData?.termsOfDelivery || 'TRANSPORTATION EXTRA\nAPPLICABLE GST EXTRA';

  const defaultSampleAddr = 'Sy.No.10/7 Khata No.27/2/100/10/7, Sir M\nVishveshwaraih Layout, 3rd Block, Bengaluru, Near\nNammoora Thindi, Bengaluru Urban';
  const consigneeName = invoiceData?.consigneeName || sheet.customerName || 'New India Saw Mill';
  const consigneeAddress = invoiceData?.consigneeAddress || sheet.customerAddress || defaultSampleAddr;
  const consigneeGstin = invoiceData?.consigneeGstin || '29CJZPK3158H1ZG';
  const consigneeState = invoiceData?.consigneeState || 'Karnataka';
  const consigneeStateCode = invoiceData?.consigneeStateCode || '29';

  const buyerName = invoiceData?.buyerName || consigneeName;
  const buyerAddress = invoiceData?.buyerAddress || consigneeAddress;
  const buyerGstin = invoiceData?.buyerGstin || consigneeGstin;
  const buyerState = invoiceData?.buyerState || consigneeState;
  const buyerStateCode = invoiceData?.buyerStateCode || consigneeStateCode;

  const defaultRate = settings?.ratePerCft || 1200;

  // Build items list
  let items = invoiceData?.items;
  if (!items || items.length === 0) {
    const rawItems = sheet.items && sheet.items.length > 0 ? sheet.items : [];
    const sourceItems = sortTimberEntries(rawItems);
    items = sourceItems
      .filter((it) => typeof it.lengthFeet === 'number' && it.lengthFeet > 0 && typeof it.pieces === 'number' && it.pieces > 0)
      .map((it, idx) => {
        const l = it.lengthFeet;
        const w = it.widthInches;
        const t = it.thicknessInches;
        const wood = (it.woodType || 'MAHAGONY').toUpperCase();
        const desc = `${l}X${w}X${t} ${wood}`;
        const cft = it.cft;
        const sqft = it.sqft;
        const pcs = typeof it.pieces === 'number' ? it.pieces : 0;
        const isSqftBilled = (typeof w === 'number' ? w : 0) >= 7 && it.rateUnit !== 'CFT';
        const defaultRowRate = isSqftBilled ? 120 : defaultRate;
        const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
        const mult = isSqftBilled ? (typeof sqft === 'number' ? sqft : 0) : cft;
        const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(mult * r * 100) / 100;
        return {
          slNo: idx + 1,
          description: desc,
          hsn: '4407',
          cft,
          sqft,
          widthInches: w,
          rateUnit: isSqftBilled ? 'SQFT' : 'CFT',
          pieces: pcs,
          rate: r,
          per: isSqftBilled ? 'SQFT' : 'CFT',
          discPercent: '',
          amount: amt
        };
      });
  }

  // Calculate totals
  let totalCft = 0;
  let totalPieces = 0;
  let totalAmount = 0;
  let totalSqftBilled = 0;
  let totalCftBilled = 0;

  for (const it of items) {
    totalCft += (typeof it.cft === 'number' ? it.cft : 0);
    totalPieces += (typeof it.pieces === 'number' ? it.pieces : 0);
    const isSqftBilled = it.rateUnit === 'SQFT' || it.per === 'SQFT';
    const defaultRowRate = isSqftBilled ? 120 : defaultRate;
    const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
    const mult = isSqftBilled ? (typeof it.sqft === 'number' ? it.sqft : it.cft * 12) : it.cft;
    const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(mult * r * 100) / 100;
    totalAmount += amt;

    if (isSqftBilled) {
      totalSqftBilled += (typeof it.sqft === 'number' ? it.sqft : it.cft * 12);
    } else {
      totalCftBilled += it.cft;
    }
  }

  const additionalChargesSum =
    ((invoiceData?.additionalCharges?.carpentry || 0) + (invoiceData?.additionalCharges?.sawing || 0)) +
    (invoiceData?.additionalCharges?.transportation || 0) +
    (invoiceData?.additionalCharges?.planing || 0) +
    (invoiceData?.additionalCharges?.other || 0);
  const gstAmt = invoiceData?.gstAmount || 0;
  const discAmt = invoiceData?.discountAmount || 0;
  const computedFallback = Math.max(0, totalAmount + additionalChargesSum - discAmt + gstAmt);

  const effectiveTotal = (invoiceData?.finalGrandTotal !== undefined && invoiceData.finalGrandTotal > 0)
    ? invoiceData.finalGrandTotal
    : (computedFallback > 0 ? computedFallback : totalAmount);
  const amountInWords = numberToIndianCurrencyWords(effectiveTotal);

  // -------------------------------------------------------------
  // DRAW PROFORMA INVOICE PDF (Strictly matching sample photo)
  // -------------------------------------------------------------
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);

  // 1. Top Header Box: "PROFORMA INVOICE"
  doc.rect(10, 8, 190, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text('PROFORMA INVOICE', 105, 13, { align: 'center' });

  // 2. Main Top Information Box (y: 15 to 87, height = 72)
  doc.rect(10, 15, 190, 72);
  doc.line(105, 15, 105, 87); // Center vertical divider

  // --- LEFT COLUMN: Seller, Consignee, Buyer ---
  // A. Seller Sub-box (y: 15 to 39.5, height = 24.5mm)
  try {
    doc.addImage(LOGO_ICON_BASE64, 'PNG', 11.5, 17.5, 17, 11);
  } catch (e) {
    console.warn('Could not draw logo on PDF:', e);
  }

  // Company Name on 2 lines so it never overflows past the center line at x=105
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(0, 0, 0);
  doc.text('HINDUSTAN SAW MILLS AND', 31.0, 18.8);
  doc.text('WOOD INDUSTRIES', 31.0, 22.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(40, 40, 40);
  doc.text('#99/C INDUSTRIAL SUBURB 2ND STAGE', 31.0, 25.5);
  doc.text('VISHVESHWARA NAGAR, MYSORE - 570008', 31.0, 28.5);
  doc.text('ACCOUNTS: 7996222901  |  hindustansawmill@gmail.com', 31.0, 31.5);
  doc.setFont('helvetica', 'bold');
  doc.text('GSTIN: 29APYPK6256P1ZL', 31.0, 34.8);
  doc.setFont('helvetica', 'normal');
  doc.text('State: Karnataka, Code : 29', 31.0, 37.8);

  doc.line(10, 39.5, 105, 39.5); // Divider below seller

  // B. Consignee (Ship to) (y: 39.5 to 63.5, height = 24mm)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text('Consignee (Ship to)', 11.5, 43.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(0, 0, 0);
  doc.text(consigneeName || 'New India Saw Mill', 11.5, 47.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(40, 40, 40);
  const splitConsigneeAddr = doc.splitTextToSize(consigneeAddress || 'Local Mill Pickup', 90);
  let cY = 50.8;
  for (let i = 0; i < Math.min(splitConsigneeAddr.length, 2); i++) {
    doc.text(splitConsigneeAddr[i], 11.5, cY);
    cY += 3.3;
  }

  // Aligned GSTIN & State rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(70, 70, 70);
  doc.text('GSTIN/UIN', 11.5, 58.2);
  doc.text(':', 27.5, 58.2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(consigneeGstin || '', 29.5, 58.2);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  doc.text('State Name', 11.5, 61.8);
  doc.text(':', 27.5, 61.8);
  doc.setTextColor(0, 0, 0);
  doc.text(`${consigneeState || ''}, Code : ${consigneeStateCode || ''}`, 29.5, 61.8);

  doc.line(10, 63.5, 105, 63.5); // Divider below consignee

  // C. Buyer (Bill to) (y: 63.5 to 87, height = 23.5mm)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text('Buyer (Bill to)', 11.5, 67.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(0, 0, 0);
  doc.text(buyerName || consigneeName || 'New India Saw Mill', 11.5, 71.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(40, 40, 40);
  const splitBuyerAddr = doc.splitTextToSize(buyerAddress || consigneeAddress || 'Local Mill Pickup', 90);
  let bY = 74.8;
  for (let i = 0; i < Math.min(splitBuyerAddr.length, 2); i++) {
    doc.text(splitBuyerAddr[i], 11.5, bY);
    bY += 3.3;
  }

  // Aligned GSTIN & State rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(70, 70, 70);
  doc.text('GSTIN/UIN', 11.5, 82.2);
  doc.text(':', 27.5, 82.2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(buyerGstin || '', 29.5, 82.2);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  doc.text('State Name', 11.5, 85.8);
  doc.text(':', 27.5, 85.8);
  doc.setTextColor(0, 0, 0);
  doc.text(`${buyerState || ''}, Code : ${buyerStateCode || ''}`, 29.5, 85.8);

  // --- RIGHT COLUMN: Dispatch and Order Metadata Table ---
  const rightDividerX = 152.5;

  // Horizontal row dividers (rows 0, 1, 2, 3, then BIG Terms of Delivery row)
  doc.line(105, 24, 200, 24);
  doc.line(105, 33, 200, 33);
  doc.line(105, 42, 200, 42);
  doc.line(105, 51, 200, 51);

  // Vertical dividers
  doc.line(129, 15, 129, 24); // Separator between Invoice No and e-Way Bill No in row 0
  doc.line(rightDividerX, 15, rightDividerX, 42); // Vertical divider between left/right metadata cells (rows 0 to 2)

  // Row 0 (15 to 24): Invoice No | e-Way Bill No | Dated
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(80, 80, 80);
  doc.text('Invoice No.', 106.5, 18.2);
  doc.text('e-Way Bill No.', 130.5, 18.2);
  doc.text('Dated', 154.0, 18.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text(invoiceNo, 106.5, 22.2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(eWayBillNo || '', 130.5, 22.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text(formattedDate, 154.0, 22.2);

  // Row 1 (24 to 33): Mode/Terms of Payment | Destination
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(80, 80, 80);
  doc.text('Mode/Terms of Payment', 106.5, 27.2);
  doc.text('Destination', 154.0, 27.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  doc.setTextColor(0, 0, 0);
  doc.text(paymentTerms, 106.5, 31.2);
  doc.text(destination, 154.0, 31.2);

  // Row 2 (33 to 42): Buyer's Order No. | Dated
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(80, 80, 80);
  doc.text("Buyer's Order No.", 106.5, 36.2);
  doc.text('Dated', 154.0, 36.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(0, 0, 0);
  doc.text(buyerOrderNo || '', 106.5, 40.2);
  doc.text(buyerOrderDate || '', 154.0, 40.2);

  // Row 3 (42 to 51): Motor Vehicle No.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(80, 80, 80);
  doc.text('Motor Vehicle No.', 106.5, 45.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  doc.setTextColor(0, 0, 0);
  doc.text(motorVehicleNo || '', 106.5, 49.2);

  // Row 4 (51 to 87): Terms of Delivery (BIG SPACIOUS BOX)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(80, 80, 80);
  doc.text('Terms of Delivery', 106.5, 55.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  doc.setTextColor(0, 0, 0);
  const termsLines = termsOfDelivery.split('\n');
  let tY = 60.5;
  for (const line of termsLines) {
    doc.text(line, 106.5, tY);
    tY += 4.5;
  }

  // -------------------------------------------------------------
  // 3. Products Table (AutoTable)
  // -------------------------------------------------------------
  // Group timber items by wood type while preserving order
  const woodGroups: Array<{ wood: string; items: typeof items }> = [];
  const woodMap = new Map<string, typeof items>();

  for (const it of items) {
    let wood = 'MAHAGONY';
    const parts = (it.description || '').trim().split(/\s+/);
    if (parts.length > 1) {
      wood = parts.slice(1).join(' ').toUpperCase();
    }
    if (!woodMap.has(wood)) {
      const arr: typeof items = [];
      woodMap.set(wood, arr);
      woodGroups.push({ wood, items: arr });
    }
    woodMap.get(wood)!.push(it);
  }

  const tableBody: any[] = [];
  let slCounter = 1;

  for (const group of woodGroups) {
    // Sort items within this wood group strictly by sawmill specification: Width Asc -> Length Desc -> Thickness Desc
    group.items.sort((a, b) => {
      const parseDims = (item: any) => {
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
      if (dA.l !== dB.l) return dB.l - dA.l;
      if (dA.t !== dB.t) return dB.t - dA.t;
      const pA = typeof a.pieces === 'number' ? a.pieces : 0;
      const pB = typeof b.pieces === 'number' ? b.pieces : 0;
      return pB - pA;
    });

    // 1. Wood Species Heading Row (Line above wood name, no line below, continuous vertical lines across all columns, left-aligned)
    const headingBorder = { top: 0.2, bottom: 0, left: 0.2, right: 0.2 };
    tableBody.push([
      {
        content: '',
        styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } }
      },
      {
        content: group.wood.toUpperCase(),
        styles: {
          fontStyle: 'bold',
          textColor: [0, 0, 0],
          fontSize: 8.5,
          cellPadding: { left: 2.2, top: 0.5, bottom: 0.5 },
          halign: 'left',
          lineWidth: headingBorder
        }
      },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } }
    ]);

    // 2. Measurements of that wood (with vertical lines, zebra striping, without horizontal lines between items 1, 2, 3)
    let groupPieces = 0;
    let groupCft = 0;
    let groupSqftBilled = 0;
    let groupCftBilled = 0;
    let groupAmount = 0;

    const itemBorder = { top: 0, bottom: 0, left: 0.2, right: 0.2 };
    let itemIdx = 0;

    for (const it of group.items) {
      const dimOnly = (it.description || '').split(/\s+/)[0] || it.description;
      const isSqftBilled = it.rateUnit === 'SQFT' || it.per === 'SQFT';
      const zebraBg = (itemIdx++ % 2 === 0) ? [243, 244, 246] : [255, 255, 255];

      groupPieces += (typeof it.pieces === 'number' ? it.pieces : 0);
      groupCft += (typeof it.cft === 'number' ? it.cft : 0);
      groupAmount += (typeof it.amount === 'number' ? it.amount : 0);

      if (isSqftBilled) {
        groupSqftBilled += (typeof it.sqft === 'number' ? it.sqft : it.cft * 12);
      } else {
        groupCftBilled += (typeof it.cft === 'number' ? it.cft : 0);
      }

      const cftText = isSqftBilled ? '' : (it.cft > 0 ? `${it.cft.toFixed(4)} CFT` : '');
      const sqftText = isSqftBilled
        ? (it.sqft && it.sqft > 0 ? `${it.sqft.toFixed(2)} SQFT` : `${(it.cft * 12).toFixed(2)} SQFT`)
        : '';

      const slStr = slCounter < 10 ? `0${slCounter}` : `${slCounter}`;
      slCounter++;

      tableBody.push([
        { content: slStr, styles: { lineWidth: itemBorder, halign: 'center', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
        { content: `   ${dimOnly}`, styles: { lineWidth: itemBorder, halign: 'left', fontStyle: 'bold', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
        { content: it.pieces > 0 ? `${it.pieces} PCS` : '', styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
        { content: cftText, styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
        { content: sqftText, styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
        { content: it.rate !== 0 ? formatIndianCurrency(it.rate) : '', styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
        { content: isSqftBilled ? 'SQFT' : 'CFT', styles: { lineWidth: itemBorder, halign: 'center', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
        { content: formatIndianCurrency(it.amount), styles: { lineWidth: itemBorder, halign: 'left', fontStyle: 'bold', fillColor: zebraBg, cellPadding: { left: 2.2, top: 0.45, bottom: 0.45 } } }
      ]);
    }

    // 3. Wood Subtotal Row (Total with top and bottom divider lines, and vertical lines)
    const subtotalBorder = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 };
    tableBody.push([
      {
        content: '',
        styles: { halign: 'center', fillColor: [243, 244, 246], lineWidth: subtotalBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: 'Total',
        styles: { fontStyle: 'bold', halign: 'left', cellPadding: { left: 2.2, top: 0.55, bottom: 0.55 }, fillColor: [243, 244, 246], lineWidth: subtotalBorder }
      },
      {
        content: `${groupPieces} PCS`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 244, 246], lineWidth: subtotalBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: groupCftBilled > 0 ? `${groupCftBilled.toFixed(4)} CFT` : (groupCft > 0 ? `${groupCft.toFixed(4)} CFT` : ''),
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 244, 246], lineWidth: subtotalBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: groupSqftBilled > 0 ? `${groupSqftBilled.toFixed(2)} SQFT` : '',
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 244, 246], lineWidth: subtotalBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: '',
        styles: { halign: 'right', fillColor: [243, 244, 246], lineWidth: subtotalBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: '',
        styles: { halign: 'center', fillColor: [243, 244, 246], lineWidth: subtotalBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: `Rs. ${formatIndianCurrency(groupAmount)}`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 244, 246], lineWidth: subtotalBorder, cellPadding: { right: 1.8, top: 0.55, bottom: 0.55 } }
      }
    ]);
  }

  // Combined Total Wood Amount row at the end
  if (totalPieces > 0) {
    const totalWoodBorder = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 };
    tableBody.push([
      {
        content: '',
        styles: { halign: 'center', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: 'TOTAL WOOD AMOUNT',
        styles: { fontStyle: 'bold', halign: 'left', cellPadding: { left: 2.2, top: 0.55, bottom: 0.55 }, fillColor: [238, 240, 243], lineWidth: totalWoodBorder }
      },
      {
        content: `${totalPieces} PCS`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: totalCftBilled > 0 ? `${totalCftBilled.toFixed(4)} CFT` : `${totalCft.toFixed(4)} CFT`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: totalSqftBilled > 0 ? `${totalSqftBilled.toFixed(2)} SQFT` : '',
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: '',
        styles: { halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: '',
        styles: { halign: 'center', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } }
      },
      {
        content: `Rs. ${formatIndianCurrency(totalAmount)}`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { right: 1.8, top: 0.55, bottom: 0.55 } }
      }
    ]);
  }

  const ac = invoiceData?.additionalCharges;

  let isFirstChargeRow = true;
  let chargeRowIdx = 0;
  const chargeRow = (name: string, amountStr: string, isDiscount: boolean = false) => {
    const topWidth = isFirstChargeRow ? 0.2 : 0;
    isFirstChargeRow = false;
    const bg = (chargeRowIdx++ % 2 === 0) ? [243, 244, 246] : [255, 255, 255];
    return [
      { content: '', styles: { lineWidth: { top: topWidth, bottom: 0, left: 0.2, right: 0.2 }, fillColor: bg, cellPadding: { top: 0.55, bottom: 0.55 } } },
      {
        content: name,
        colSpan: 6,
        styles: {
          fontStyle: 'bold',
          halign: 'right',
          textColor: isDiscount ? [22, 101, 52] : [0, 0, 0],
          lineWidth: { top: topWidth, bottom: 0, left: 0.2, right: 0.2 },
          cellPadding: { right: 2.5, top: 0.55, bottom: 0.55 },
          fillColor: bg
        }
      },
      {
        content: amountStr,
        styles: {
          fontStyle: 'bold',
          halign: 'right',
          textColor: isDiscount ? [22, 101, 52] : [0, 0, 0],
          lineWidth: { top: topWidth, bottom: 0, left: 0.2, right: 0.2 },
          cellPadding: { right: 1.8, top: 0.55, bottom: 0.55 },
          fillColor: bg
        }
      }
    ];
  };

  // 1. Next: PLANING CHARGES immediately after wood
  if (ac?.planing && ac.planing > 0) {
    tableBody.push(chargeRow('PLANING CHARGES', formatIndianCurrency(ac.planing)));
  }

  // 2. Next: GST Line immediately after Planing Charges
  if (invoiceData?.gstAmount && invoiceData.gstAmount > 0) {
    tableBody.push(chargeRow('GST', formatIndianCurrency(invoiceData.gstAmount)));
  }

  // 3. Next: CARPENTRY WORKS (Carpenter Charges) after GST
  const totalCarpentry = (ac?.carpentry || 0) + (ac?.sawing || 0);
  if (totalCarpentry > 0) {
    tableBody.push(chargeRow('CARPENTRY WORKS', formatIndianCurrency(totalCarpentry)));
  }

  // 4. Next: TRANSPORTATION & DELIVERY CHARGES (Transport Charges) after Carpentry
  if (ac?.transportation && ac.transportation > 0) {
    tableBody.push(chargeRow('TRANSPORTATION & DELIVERY CHARGES', formatIndianCurrency(ac.transportation)));
  }

  // 5. Next: OTHER CHARGES (if any)
  if (ac?.other && ac.other > 0) {
    tableBody.push(chargeRow((ac.otherLabel || 'OTHER CHARGES').toUpperCase(), formatIndianCurrency(ac.other)));
  }

  // 6. Next: DISCOUNT (if any)
  if (invoiceData?.discountAmount && invoiceData.discountAmount > 0) {
    const discLabel = invoiceData.discountDesc ? `LESS: DISCOUNT (${invoiceData.discountDesc})` : 'LESS: DISCOUNT';
    tableBody.push(chargeRow(discLabel, `- ${formatIndianCurrency(invoiceData.discountAmount)}`, true));
  }

  // For clean vertical page filling, pad with empty rows if under 12 items
  const emptyRowsNeeded = tableBody.length <= 11 ? Math.max(0, 10 - tableBody.length) : 0;
  for (let i = 0; i < emptyRowsNeeded; i++) {
    const topWidth = isFirstChargeRow ? 0.2 : 0;
    isFirstChargeRow = false;
    const emptyBorder = { top: topWidth, bottom: 0, left: 0.2, right: 0.2 };
    tableBody.push([
      { content: '', styles: { lineWidth: emptyBorder } },
      { content: '', styles: { lineWidth: emptyBorder } },
      { content: '', styles: { lineWidth: emptyBorder } },
      { content: '', styles: { lineWidth: emptyBorder } },
      { content: '', styles: { lineWidth: emptyBorder } },
      { content: '', styles: { lineWidth: emptyBorder } },
      { content: '', styles: { lineWidth: emptyBorder } },
      { content: '', styles: { lineWidth: emptyBorder } }
    ]);
  }

  function splitDecimalNumber(s: string) {
    if (!s || typeof s !== 'string') return null;
    const dotIdx = s.lastIndexOf('.');
    if (dotIdx === -1) return null;
    const before = s.slice(0, dotIdx);
    if (!/\d/.test(before)) return null;
    const after = s.slice(dotIdx + 1);
    const match = after.match(/^(\d+)(.*)$/);
    if (!match) return null;
    return {
      intStr: s.slice(0, dotIdx + 1),
      decStr: match[1],
      suffix: match[2]
    };
  }

  function splitDimension(s: string) {
    if (!s || typeof s !== 'string') return null;
    const trimmed = s.trim();
    if (/^\d+(\.\d+)?[xX×]\d+(\.\d+)?[xX×]\d+(\.\d+)?$/.test(trimmed)) {
      const rawParts = trimmed.split(/([xX×])/);
      return rawParts.map(p => {
        if (p.toLowerCase() === 'x' || p === '×') return 'x';
        if (/^\d+$/.test(p)) return p.padStart(2, '0');
        return p;
      });
    }
    return null;
  }

  autoTable(doc, {
    startY: 87,
    margin: { left: 10, right: 10 },
    head: [[
      'Sl\nNo.',
      'Description of Goods',
      'Quantity',
      'Alt. Quantity',
      'SQFT',
      'Rate',
      'per',
      'Amount'
    ]],
    body: tableBody,
    foot: [[
      '',
      'Total',
      `${totalPieces} PCS`,
      `${totalCft.toFixed(4)} CFT`,
      totalSqftBilled > 0 ? `${totalSqftBilled.toFixed(2)} SQFT` : '',
      {
        content: `Rs. ${formatIndianCurrency(effectiveTotal)}`,
        colSpan: 3,
        styles: { halign: 'right', cellPadding: { right: 1.8 } }
      }
    ]],
    showFoot: 'lastPage',
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.0,
      cellPadding: { top: 0.5, bottom: 0.5, left: 1.0, right: 1.0 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: 'middle'
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      fontSize: 8.0,
      cellPadding: { top: 0.8, bottom: 0.8, left: 1.0, right: 1.0 },
      lineColor: [0, 0, 0],
      lineWidth: 0.2
    },
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      valign: 'middle',
      fontSize: 8.5,
      cellPadding: { top: 0.8, bottom: 0.8, left: 1.0, right: 1.0 },
      lineColor: [0, 0, 0],
      lineWidth: 0.2
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'left', cellWidth: 57, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 18 },
      3: { halign: 'right', cellWidth: 24 },
      4: { halign: 'right', cellWidth: 23 },
      5: { halign: 'right', cellWidth: 18 },
      6: { halign: 'center', cellWidth: 13, cellPadding: { left: 0.5, right: 0.5 } },
      7: { halign: 'left', cellWidth: 29, fontStyle: 'bold', cellPadding: { left: 2.2 } }
    },
    didDrawPage: (data) => {
      // Draw closing bottom line on table on every page (especially when table breaks to next page)
      if (data.cursor && typeof data.cursor.y === 'number') {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        doc.line(10, data.cursor.y, 200, data.cursor.y);
      }
    },
    willDrawCell: (data) => {
      if (data.section === 'body' || data.section === 'foot') {
        const raw = (data.cell.text || []).join(' ').trim();
        if (splitDimension(raw) || splitDecimalNumber(raw)) {
          (data.cell as any).customDrawText = raw;
          data.cell.text = [];
        }
      }
    },
    didDrawCell: (data) => {
      // Ensure crisp, solid vertical lines across body rows (especially column 0 separator and outer borders)
      if (data.section === 'body') {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        // Column 0 separator line (x = 18 mm)
        if (data.column.index === 0) {
          doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height);
          doc.line(data.cell.x + data.cell.width, data.cell.y, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
        if (data.column.index === 1) {
          doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height);
        }
        if (data.column.index === 7) {
          doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height);
          doc.line(data.cell.x + data.cell.width, data.cell.y, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      }

      // Draw guaranteed horizontal line under TOTAL WOOD AMOUNT row
      if (data.section === 'body' && data.row.raw && Array.isArray(data.row.raw)) {
        const c1 = (data.row.raw[1] as any)?.content;
        if (c1 === 'TOTAL WOOD AMOUNT' && data.column.index === 7) {
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.2);
          doc.line(10, data.cell.y + data.cell.height, 200, data.cell.y + data.cell.height);
        }
      }

      if ((data.section === 'body' || data.section === 'foot') && (data.cell as any).customDrawText) {
        const raw = (data.cell as any).customDrawText as string;
        const x = data.cell.x;
        const y = data.cell.y;
        const w = data.cell.width;
        const h = data.cell.height;

        const isFootTotal = data.section === 'foot' && data.column.index >= 5;
        const baseline = isFootTotal ? (y + h / 2 + 1.3) : (y + h / 2 + 1.0);

        const dimParts = splitDimension(raw);
        const decParts = splitDecimalNumber(raw);

        const textColor = data.cell.styles.textColor || [0, 0, 0];
        if (Array.isArray(textColor)) {
          doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        }

        if (dimParts) {
          // Align exactly under wood species name (x + 2.2) and bigger numbers (9.6pt)
          let curX = x + 2.2;
          for (const p of dimParts) {
            if (p.toLowerCase() === 'x' || p === '×') {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(6.8);
              doc.text('x', curX, baseline - 0.2);
              curX += doc.getTextWidth('x') + 0.8;
            } else {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(9.6);
              doc.text(p, curX, baseline);
              curX += doc.getTextWidth(p) + 0.8;
            }
          }
        } else if (decParts) {
          const isItemAmount = data.section === 'body' && data.column.index === 7 && data.cell.styles.halign === 'left';
          const padRight = 1.8;
          const padLeft = 2.2;
          const isBold = isFootTotal || data.cell.styles.fontStyle === 'bold';
          const baseFontSize = isFootTotal ? 11.5 : 8.0;
          const decFontSize = isFootTotal ? 8.5 : 6.0;

          doc.setFont('helvetica', isBold ? 'bold' : 'normal');
          doc.setFontSize(baseFontSize);
          const wInt = doc.getTextWidth(decParts.intStr);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(decFontSize);
          const wDec = doc.getTextWidth(decParts.decStr);
          doc.setFont('helvetica', isBold ? 'bold' : 'normal');
          doc.setFontSize(baseFontSize);
          const wSuffix = doc.getTextWidth(decParts.suffix);

          const totalW = wInt + wDec + wSuffix;
          let curX = isItemAmount ? (x + padLeft) : (x + w - padRight - totalW);

          doc.setFont('helvetica', isBold ? 'bold' : 'normal');
          doc.setFontSize(baseFontSize);
          doc.text(decParts.intStr, curX, baseline);
          curX += wInt;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(decFontSize);
          doc.text(decParts.decStr, curX, baseline);
          curX += wDec;

          if (decParts.suffix) {
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            doc.setFontSize(baseFontSize);
            doc.text(decParts.suffix, curX, baseline);
          }
        }
        doc.setTextColor(0, 0, 0);
      }
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY;

  // -------------------------------------------------------------
  // 4. Bottom Summary, Terms, Tax & Bank Details
  // -------------------------------------------------------------
  let bottomY = finalY;
  // If not enough room on current page, add new page
  if (bottomY > 238) {
    doc.addPage();
    bottomY = 15;
  }

  // A. Amount Chargeable in Words Box (height: 7.5mm)
  doc.rect(10, bottomY, 190, 7.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text('Amount Chargeable (in words)', 11.5, bottomY + 3.0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  doc.text('E. & O.E', 198.5, bottomY + 3.0, { align: 'right' });

  doc.setFontSize(8.2);
  doc.text(amountInWords, 11.5, bottomY + 6.3);

  const blockY = bottomY + 7.5;
  const blockHeight = 31;

  // Outer container for Bank Details (Left), UPI Scanner (Middle), and Seals (Right)
  doc.rect(10, blockY, 190, blockHeight);
  doc.line(76, blockY, 76, blockY + blockHeight); // Divider between Bank Details & UPI Scanner
  doc.line(114, blockY, 114, blockY + blockHeight); // Divider between UPI Scanner & Seals

  // --- 1. LEFT SIDE: Company's Bank Details (x: 10 to 76, width: 66mm) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(0, 0, 0);
  doc.text("Company's Bank Details", 12.0, blockY + 4.0);

  doc.setDrawColor(220, 220, 220);
  doc.line(12.0, blockY + 5.2, 74.0, blockY + 5.2);
  doc.setDrawColor(0, 0, 0);

  // Row 1: A/c Holder's Name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text("A/c Holder's Name :", 12.0, blockY + 8.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(0, 0, 0);
  doc.text("HINDUSTAN SAW MILLS AND", 12.0, blockY + 12.2);
  doc.text("WOOD INDUSTRIES 2024-25", 12.0, blockY + 15.6);

  // Row 2: Bank Name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text("Bank Name", 12.0, blockY + 20.2);
  doc.text(":", 34, blockY + 20.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(0, 0, 0);
  doc.text("ICICI BANK", 36.5, blockY + 20.2);

  // Row 3: A/c No.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text("A/c No.", 12.0, blockY + 24.2);
  doc.text(":", 34, blockY + 24.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(0, 0, 0);
  doc.text("464205000153", 36.5, blockY + 24.2);

  // Row 4: Branch & IFS Code
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text("Branch & IFS Code", 12.0, blockY + 28.2);
  doc.text(":", 34, blockY + 28.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(0, 0, 0);
  doc.text("JP NAGAR & ICIC0004642", 36.5, blockY + 28.2);

  // --- 2. MIDDLE: Payment Scanner (UPI QR Code) (x: 76 to 114, width: 38mm) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(22, 101, 52);
  doc.text('Scan & Pay via UPI', 95, blockY + 3.8, { align: 'center' });

  try {
    doc.addImage(PAYMENT_QR_BASE64, 'PNG', 86.5, blockY + 5.2, 17, 17);
  } catch (err) {
    console.warn('Could not draw QR code on PDF:', err);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(80, 80, 80);
  doc.text('GPay • PhonePe • Paytm • BHIM', 95, blockY + 24.0, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(0, 0, 0);
  doc.text('UPI: hindustansawmill@icici', 95, blockY + 27.2, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(100, 100, 100);
  doc.text('Instant Bank-to-Bank Transfer', 95, blockY + 29.8, { align: 'center' });

  // --- 3. RIGHT SIDE: Customer Seal (114 to 148, w: 34mm) & Authorised Signatory (148 to 200, w: 52mm) ---
  doc.line(148, blockY, 148, blockY + blockHeight);

  // Customer's Seal and Signature Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.setTextColor(0, 0, 0);
  doc.text("Customer's Seal and", 116, blockY + 4.2);
  doc.text('Signature', 116, blockY + 7.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(130, 130, 130);
  doc.text('[ Affix Seal & Sign Here ]', 131, blockY + 28.5, { align: 'center' });

  // Authorised Signatory Box (x: 148 to 200, w: 52 mm)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(0, 0, 0);
  doc.text('for HINDUSTAN SAW MILLS AND', 150.5, blockY + 4.2);
  doc.text('WOOD INDUSTRIES', 150.5, blockY + 7.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(130, 130, 130);
  doc.text('[ Authorised Stamp & Sign ]', 174, blockY + 23.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(0, 0, 0);
  doc.text('Authorised Signatory', 198.0, blockY + 28.5, { align: 'right' });

  // -------------------------------------------------------------
  // 5. Bottom Computer Generated Note
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(60, 60, 60);
  doc.text('This is a Computer Generated Invoice', 105, blockY + blockHeight + 3.8, { align: 'center' });

  return doc;
}

export function exportSheetToPdf(
  sheet: MeasurementSheet,
  settings?: BusinessSettings,
  invoiceData?: ProformaInvoiceExportData
): void {
  const doc = createProformaInvoiceDoc(sheet, settings, invoiceData);
  const safeFilename = (sheet.sheetName || 'proforma_invoice')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const dateStr = sheet.measurementDate || new Date().toISOString().split('T')[0];

  doc.save(`${safeFilename}_${dateStr}.pdf`);
}

export function getProformaInvoicePdfBlob(
  sheet: MeasurementSheet,
  settings?: BusinessSettings,
  invoiceData?: ProformaInvoiceExportData
): { blob: Blob; filename: string } {
  const doc = createProformaInvoiceDoc(sheet, settings, invoiceData);
  const safeFilename = (sheet.sheetName || 'proforma_invoice')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const dateStr = sheet.measurementDate || new Date().toISOString().split('T')[0];
  const filename = `${safeFilename}_${dateStr}.pdf`;
  const blob = doc.output('blob');
  return { blob, filename };
}
