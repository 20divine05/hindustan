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
  // A. Seller Sub-box (y: 15 to 39)
  try {
    doc.addImage(LOGO_ICON_BASE64, 'PNG', 11.5, 16.5, 17, 17);
  } catch (e) {
    console.warn('Could not draw logo on PDF:', e);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('HINDUSTAN SAW MILLS AND WOOD INDUSTRIES', 30.5, 19);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.text('#99/C INDUSTRIAL SUBURB 2ND STAGE', 30.5, 22.4);
  doc.text('VISHVESHWARA NAGAR MYSORE - 570008', 30.5, 25.6);
  doc.text('ACCOUNTS DEPARTMENT - 7996222901', 30.5, 28.8);
  doc.setFont('helvetica', 'bold');
  doc.text('GSTIN/UIN: 29APYPK6256P1ZL', 30.5, 32.0);
  doc.setFont('helvetica', 'normal');
  doc.text('State Name : Karnataka, Code : 29', 30.5, 35.2);
  doc.text('E-Mail : hindustansawmill@gmail.com', 30.5, 38.3);

  doc.line(10, 39.5, 105, 39.5); // Divider below seller

  // B. Consignee (Ship to) (y: 39.5 to 63)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Consignee (Ship to)', 11.5, 43);

  doc.text(consigneeName, 11.5, 46.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const splitConsigneeAddr = doc.splitTextToSize(consigneeAddress, 90);
  let cY = 50.2;
  for (let i = 0; i < Math.min(splitConsigneeAddr.length, 3); i++) {
    doc.text(splitConsigneeAddr[i], 11.5, cY);
    cY += 3.3;
  }

  doc.text(`GSTIN/UIN        : ${consigneeGstin}`, 11.5, 59.5);
  doc.text(`State Name       : ${consigneeState}, Code : ${consigneeStateCode}`, 11.5, 62.5);

  doc.line(10, 63.5, 105, 63.5); // Divider below consignee

  // C. Buyer (Bill to) (y: 63.5 to 87)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Buyer (Bill to)', 11.5, 67);

  doc.text(buyerName, 11.5, 70.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const splitBuyerAddr = doc.splitTextToSize(buyerAddress, 90);
  let bY = 74.2;
  for (let i = 0; i < Math.min(splitBuyerAddr.length, 3); i++) {
    doc.text(splitBuyerAddr[i], 11.5, bY);
    bY += 3.3;
  }

  doc.text(`GSTIN/UIN        : ${buyerGstin}`, 11.5, 83.5);
  doc.text(`State Name       : ${buyerState}, Code : ${buyerStateCode}`, 11.5, 86.5);

  // --- RIGHT COLUMN: Dispatch and Order Metadata Table ---
  const rightDividerX = 152.5;

  // Horizontal row dividers (rows 0, 1, 2, 3, then BIG Terms of Delivery row)
  doc.line(105, 24, 200, 24);
  doc.line(105, 33, 200, 33);
  doc.line(105, 42, 200, 42);
  doc.line(105, 51, 200, 51);

  // Vertical divider between left/right metadata cells (rows 0 to 2)
  doc.line(rightDividerX, 15, rightDividerX, 42);

  // Row 0 (15 to 24): Invoice No / e-Way Bill No | Dated
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text('Invoice No.', 106.5, 18);
  doc.text('e-Way Bill No.', 130, 18);
  doc.text('Dated', 154, 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(invoiceNo, 106.5, 22.5);
  doc.setFont('helvetica', 'normal');
  doc.text(eWayBillNo, 130, 22.5);
  doc.setFont('helvetica', 'bold');
  doc.text(formattedDate, 154, 22.5);

  // Row 1 (24 to 33): Mode/Terms of Payment | Destination
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text('Mode/Terms of Payment', 106.5, 27);
  doc.text('Destination', 154, 27);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text(paymentTerms, 106.5, 31.5);
  doc.text(destination, 154, 31.5);

  // Row 2 (33 to 42): Buyer's Order No. | Dated
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text("Buyer's Order No.", 106.5, 36);
  doc.text('Dated', 154, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.text(buyerOrderNo || '-', 106.5, 40.5);
  doc.text(buyerOrderDate || '-', 154, 40.5);

  // Row 3 (42 to 51): Motor Vehicle No.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text('Motor Vehicle No.', 106.5, 45.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text(motorVehicleNo || '-', 106.5, 49.5);

  // Row 4 (51 to 87): Terms of Delivery (BIG SPACIOUS BOX)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text('Terms of Delivery', 106.5, 55.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
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
        styles: { lineWidth: headingBorder, cellPadding: 1.2 }
      },
      {
        content: group.wood.toUpperCase(),
        styles: {
          fontStyle: 'bold',
          textColor: [0, 0, 0],
          fontSize: 8.8,
          cellPadding: { left: 2.2, top: 1.2, bottom: 1.2 },
          halign: 'left',
          lineWidth: headingBorder
        }
      },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: 1.2 } },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: 1.2 } },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: 1.2 } },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: 1.2 } },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: 1.2 } },
      { content: '', styles: { lineWidth: headingBorder, cellPadding: 1.2 } }
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

      const cftText = isSqftBilled ? '-' : (it.cft > 0 ? `${it.cft.toFixed(4)} CFT` : '-');
      const sqftText = isSqftBilled
        ? (it.sqft && it.sqft > 0 ? `${it.sqft.toFixed(2)} SQFT` : `${(it.cft * 12).toFixed(2)} SQFT`)
        : '-';

      const slStr = slCounter < 10 ? `0${slCounter}` : `${slCounter}`;
      slCounter++;

      tableBody.push([
        { content: slStr, styles: { lineWidth: itemBorder, halign: 'center', fillColor: zebraBg } },
        { content: `   ${dimOnly}`, styles: { lineWidth: itemBorder, halign: 'left', fontStyle: 'bold', fillColor: zebraBg } },
        { content: it.pieces > 0 ? `${it.pieces} PCS` : '-', styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg } },
        { content: cftText, styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg } },
        { content: sqftText, styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg } },
        { content: it.rate !== 0 ? formatIndianCurrency(it.rate) : '-', styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg } },
        { content: isSqftBilled ? 'SQFT' : 'CFT', styles: { lineWidth: itemBorder, halign: 'center', fillColor: zebraBg } },
        { content: formatIndianCurrency(it.amount), styles: { lineWidth: itemBorder, halign: 'right', fontStyle: 'bold', fillColor: zebraBg } }
      ]);
    }

    // 3. Wood Subtotal Row (Total with top and bottom divider lines, and vertical lines)
    const subtotalBorder = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 };
    tableBody.push([
      {
        content: '-',
        styles: { halign: 'center', fillColor: [243, 244, 246], lineWidth: subtotalBorder }
      },
      {
        content: 'Total',
        styles: { fontStyle: 'bold', halign: 'left', cellPadding: { left: 2.2 }, fillColor: [243, 244, 246], lineWidth: subtotalBorder }
      },
      {
        content: `${groupPieces} PCS`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 244, 246], lineWidth: subtotalBorder }
      },
      {
        content: groupCftBilled > 0 ? `${groupCftBilled.toFixed(4)} CFT` : (groupCft > 0 ? `${groupCft.toFixed(4)} CFT` : '-'),
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 244, 246], lineWidth: subtotalBorder }
      },
      {
        content: groupSqftBilled > 0 ? `${groupSqftBilled.toFixed(2)} SQFT` : '-',
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 244, 246], lineWidth: subtotalBorder }
      },
      {
        content: '-',
        styles: { halign: 'right', fillColor: [243, 244, 246], lineWidth: subtotalBorder }
      },
      {
        content: '-',
        styles: { halign: 'center', fillColor: [243, 244, 246], lineWidth: subtotalBorder }
      },
      {
        content: `Rs. ${formatIndianCurrency(groupAmount)}`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 244, 246], lineWidth: subtotalBorder }
      }
    ]);
  }

  // Combined Total Wood Amount row at the end
  if (totalPieces > 0) {
    const totalWoodBorder = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 };
    tableBody.push([
      {
        content: '-',
        styles: { halign: 'center', fillColor: [238, 240, 243], lineWidth: totalWoodBorder }
      },
      {
        content: 'TOTAL WOOD AMOUNT',
        styles: { fontStyle: 'bold', halign: 'left', cellPadding: { left: 2.2 }, fillColor: [238, 240, 243], lineWidth: totalWoodBorder }
      },
      {
        content: `${totalPieces} PCS`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder }
      },
      {
        content: totalCftBilled > 0 ? `${totalCftBilled.toFixed(4)} CFT` : `${totalCft.toFixed(4)} CFT`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder }
      },
      {
        content: totalSqftBilled > 0 ? `${totalSqftBilled.toFixed(2)} SQFT` : '-',
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder }
      },
      {
        content: '-',
        styles: { halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder }
      },
      {
        content: '-',
        styles: { halign: 'center', fillColor: [238, 240, 243], lineWidth: totalWoodBorder }
      },
      {
        content: `Rs. ${formatIndianCurrency(totalAmount)}`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder }
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
      { content: '', styles: { lineWidth: { top: topWidth, bottom: 0, left: 0.2, right: 0.2 }, fillColor: bg } },
      {
        content: name,
        colSpan: 6,
        styles: {
          fontStyle: 'bold',
          halign: 'right',
          textColor: isDiscount ? [22, 101, 52] : [0, 0, 0],
          lineWidth: { top: topWidth, bottom: 0, left: 0.2, right: 0.2 },
          cellPadding: { right: 2.5, top: 1.5, bottom: 1.5 },
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
          cellPadding: { right: 1.5, top: 1.5, bottom: 1.5 },
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
      totalSqftBilled > 0 ? `${totalSqftBilled.toFixed(2)} SQFT` : '-',
      '',
      '',
      `Rs. ${formatIndianCurrency(effectiveTotal)}`
    ]],
    showFoot: 'lastPage',
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.0,
      cellPadding: 1.5,
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
      lineColor: [0, 0, 0],
      lineWidth: 0.2
    },
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      valign: 'middle',
      fontSize: 8.5,
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
      7: { halign: 'right', cellWidth: 29, fontStyle: 'bold' }
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

        const isFootTotal = data.section === 'foot' && data.column.index === 7;
        const baseline = isFootTotal ? (y + h / 2 + 1.5) : (y + h / 2 + 1.2);

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
          const padRight = 1.8;
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
          let curX = x + w - padRight - totalW;

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
  if (bottomY > 224) {
    doc.addPage();
    bottomY = 15;
  }

  // A. Amount Chargeable in Words Box (height: 8mm)
  doc.rect(10, bottomY, 190, 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Amount Chargeable (in words)', 11.5, bottomY + 3.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('E. & O.E', 198.5, bottomY + 3.2, { align: 'right' });

  doc.setFontSize(8.8);
  doc.text(amountInWords, 11.5, bottomY + 6.8);

  const blockY = bottomY + 8;
  const blockHeight = 48;

  // Outer container for Terms + Tax (Left), Payment Scanner (Middle), and Big Seals (Right)
  doc.rect(10, blockY, 190, blockHeight);
  doc.line(92, blockY, 92, blockY + blockHeight); // Divider between Left & Middle
  doc.line(134, blockY, 134, blockY + blockHeight); // Divider between Middle & Right

  // --- 1. LEFT SIDE: Company's Bank Details (x: 10 to 92) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("Company's Bank Details", 12.5, blockY + 5.5);

  doc.setDrawColor(220, 220, 220);
  doc.line(12.5, blockY + 7.5, 90, blockY + 7.5);
  doc.setDrawColor(0, 0, 0);

  // Row 1: A/c Holder's Name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(50, 50, 50);
  doc.text("A/c Holder's Name :", 12.5, blockY + 13.0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(0, 0, 0);
  doc.text("HINDUSTAN SAW MILLS AND", 12.5, blockY + 17.5);
  doc.text("WOOD INDUSTRIES 2024-25", 12.5, blockY + 21.5);

  // Row 2: Bank Name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(50, 50, 50);
  doc.text("Bank Name", 12.5, blockY + 27.5);
  doc.text(":", 40, blockY + 27.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(0, 0, 0);
  doc.text("ICICI BANK", 43, blockY + 27.5);

  // Row 3: A/c No.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(50, 50, 50);
  doc.text("A/c No.", 12.5, blockY + 33.5);
  doc.text(":", 40, blockY + 33.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(0, 0, 0);
  doc.text("464205000153", 43, blockY + 33.5);

  // Row 4: Branch & IFS Code
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(50, 50, 50);
  doc.text("Branch & IFS Code", 12.5, blockY + 39.5);
  doc.text(":", 40, blockY + 39.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(0, 0, 0);
  doc.text("JP NAGAR & ICIC0004642", 43, blockY + 39.5);

  // --- 2. MIDDLE: Payment Scanner (UPI QR Code) (x: 92 to 134) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(0, 0, 0);
  doc.text('Scan & Pay via UPI', 113, blockY + 4.5, { align: 'center' });

  try {
    doc.addImage(PAYMENT_QR_BASE64, 'PNG', 101, blockY + 6.5, 24, 24);
  } catch (err) {
    console.warn('Could not draw QR code on PDF:', err);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(80, 80, 80);
  doc.text('GPay  •  PhonePe  •  Paytm  •  BHIM', 113, blockY + 33.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(0, 0, 0);
  doc.text('UPI ID: hindustansawmill@icici', 113, blockY + 37.5, { align: 'center' });

  // Small note below QR
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(100, 100, 100);
  doc.text('Instant Bank-to-Bank Transfer', 113, blockY + 41.5, { align: 'center' });

  // --- 3. RIGHT SIDE: Big Customer Seal & Big Company Authorised Signatory (x: 134 to 200) ---
  // Sub-divider between Customer Seal (134 to 167) and Authorised Signatory (167 to 200)
  doc.line(167, blockY, 167, blockY + blockHeight);

  // Big Customer's Seal and Signature Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text("Customer's Seal and", 136, blockY + 5);
  doc.text('Signature', 136, blockY + 8.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(130, 130, 130);
  doc.text('[ Affix Seal & Sign Here ]', 150.5, blockY + 44, { align: 'center' });

  // Big Authorised Signatory Box (Full Height)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(0, 0, 0);
  doc.text('for HINDUSTAN SAW MILLS AND', 169, blockY + 5);
  doc.text('WOOD INDUSTRIES', 169, blockY + 8.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(130, 130, 130);
  doc.text('[ Authorised Stamp & Sign ]', 183.5, blockY + 39, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  doc.setTextColor(0, 0, 0);
  doc.text('Authorised Signatory', 198.5, blockY + 45.5, { align: 'right' });

  // -------------------------------------------------------------
  // 5. Bottom Computer Generated Note
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(50, 50, 50);
  doc.text('This is a Computer Generated Invoice', 105, blockY + blockHeight + 4.5, { align: 'center' });

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
