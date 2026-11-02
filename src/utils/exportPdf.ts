import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BusinessSettings, MeasurementSheet } from '../types';
import { LOGO_ICON_BASE64 } from './logoBase64';
import { PAYMENT_QR_BASE64 } from './paymentQrBase64';
import { numberToIndianCurrencyWords, formatIndianCurrency } from './indianNumberWords';

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
    const sourceItems = sheet.items && sheet.items.length > 0 ? sheet.items : [];
    items = sourceItems
      .filter((it) => typeof it.lengthFeet === 'number' && it.lengthFeet > 0 && typeof it.pieces === 'number' && it.pieces > 0)
      .map((it, idx) => {
        const l = it.lengthFeet;
        const w = it.widthInches;
        const t = it.thicknessInches;
        const wood = (it.woodType || 'MAHAGONY').toUpperCase();
        const desc = `${l}X${w}X${t} ${wood}`;
        const cft = it.cft;
        const pcs = typeof it.pieces === 'number' ? it.pieces : 0;
        const amt = Math.round(cft * defaultRate * 100) / 100;
        return {
          slNo: idx + 1,
          description: desc,
          hsn: '4407',
          cft,
          pieces: pcs,
          rate: defaultRate,
          per: 'CFT',
          discPercent: '',
          amount: amt
        };
      });
  }

  // Calculate totals
  let totalCft = 0;
  let totalPieces = 0;
  let totalAmount = 0;
  for (const it of items) {
    totalCft += it.cft;
    totalPieces += it.pieces;
    totalAmount += it.amount;
  }

  const effectiveTotal = invoiceData?.finalGrandTotal !== undefined ? invoiceData.finalGrandTotal : totalAmount;
  const amountInWords = numberToIndianCurrencyWords(effectiveTotal);

  // -------------------------------------------------------------
  // DRAW PROFORMA INVOICE PDF (Strictly matching sample photo)
  // -------------------------------------------------------------
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);

  // 1. Top Header Box: "PROFORMA INVOICE"
  doc.rect(10, 8, 190, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
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
  doc.setFontSize(8);
  doc.text('HINDUSTAN SAW MILLS AND WOOD INDUSTRIES', 30.5, 19);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('#99/C INDUSTRIAL SUBURB 2ND STAGE', 30.5, 22.3);
  doc.text('VISHVESHWARA NAGAR MYSORE - 570008', 30.5, 25.5);
  doc.text('ACCOUNTS DEPARTMENT - 7996222901', 30.5, 28.7);
  doc.setFont('helvetica', 'bold');
  doc.text('GSTIN/UIN: 29APYPK6256P1ZL', 30.5, 31.9);
  doc.setFont('helvetica', 'normal');
  doc.text('State Name : Karnataka, Code : 29', 30.5, 35.1);
  doc.text('E-Mail : hindustansawmill@gmail.com', 30.5, 38.2);

  doc.line(10, 39.5, 105, 39.5); // Divider below seller

  // B. Consignee (Ship to) (y: 39.5 to 63)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.text('Consignee (Ship to)', 11.5, 43);

  doc.text(consigneeName, 11.5, 46.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  const splitConsigneeAddr = doc.splitTextToSize(consigneeAddress, 90);
  let cY = 49.8;
  for (let i = 0; i < Math.min(splitConsigneeAddr.length, 3); i++) {
    doc.text(splitConsigneeAddr[i], 11.5, cY);
    cY += 3.2;
  }

  doc.text(`GSTIN/UIN        : ${consigneeGstin}`, 11.5, 59.5);
  doc.text(`State Name       : ${consigneeState}, Code : ${consigneeStateCode}`, 11.5, 62.5);

  doc.line(10, 63.5, 105, 63.5); // Divider below consignee

  // C. Buyer (Bill to) (y: 63.5 to 87)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.text('Buyer (Bill to)', 11.5, 67);

  doc.text(buyerName, 11.5, 70.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  const splitBuyerAddr = doc.splitTextToSize(buyerAddress, 90);
  let bY = 73.8;
  for (let i = 0; i < Math.min(splitBuyerAddr.length, 3); i++) {
    doc.text(splitBuyerAddr[i], 11.5, bY);
    bY += 3.2;
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
  doc.setFontSize(6.2);
  doc.text('Invoice No.', 106.5, 18);
  doc.text('e-Way Bill No.', 130, 18);
  doc.text('Dated', 154, 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(invoiceNo, 106.5, 22.5);
  doc.setFont('helvetica', 'normal');
  doc.text(eWayBillNo, 130, 22.5);
  doc.setFont('helvetica', 'bold');
  doc.text(formattedDate, 154, 22.5);

  // Row 1 (24 to 33): Mode/Terms of Payment | Destination
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.text('Mode/Terms of Payment', 106.5, 27);
  doc.text('Destination', 154, 27);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(paymentTerms, 106.5, 31.5);
  doc.text(destination, 154, 31.5);

  // Row 2 (33 to 42): Buyer's Order No. | Dated
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.text("Buyer's Order No.", 106.5, 36);
  doc.text('Dated', 154, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(buyerOrderNo || '-', 106.5, 40.5);
  doc.text(buyerOrderDate || '-', 154, 40.5);

  // Row 3 (42 to 51): Motor Vehicle No.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.text('Motor Vehicle No.', 106.5, 45.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(motorVehicleNo || '-', 106.5, 49.5);

  // Row 4 (51 to 87): Terms of Delivery (BIG SPACIOUS BOX)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Terms of Delivery', 106.5, 55.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
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
    // 1. Small Wood Heading Row (e.g. "MAHAGONY")
    tableBody.push([
      {
        content: `•  ${group.wood}`,
        colSpan: 7,
        styles: {
          fontStyle: 'bold',
          fillColor: [248, 248, 248],
          textColor: [0, 0, 0],
          fontSize: 7.2,
          cellPadding: 1.5,
          halign: 'left'
        }
      }
    ]);

    // 2. Measurements of that wood (only dimension, without wood name repeated)
    let groupPieces = 0;
    let groupCft = 0;
    let groupAmount = 0;

    for (const it of group.items) {
      const dimOnly = (it.description || '').split(/\s+/)[0] || it.description;
      groupPieces += (typeof it.pieces === 'number' ? it.pieces : 0);
      groupCft += (typeof it.cft === 'number' ? it.cft : 0);
      groupAmount += (typeof it.amount === 'number' ? it.amount : 0);

      tableBody.push([
        (slCounter++).toString(),
        `   ${dimOnly}`,
        it.pieces > 0 ? `${it.pieces} PCS` : '-',
        it.cft > 0 ? `${it.cft.toFixed(4)} CFT` : '-',
        it.rate !== 0 ? formatIndianCurrency(it.rate) : '-',
        it.per || 'CFT',
        formatIndianCurrency(it.amount)
      ]);
    }

    // 3. Wood Subtotal Row
    tableBody.push([
      {
        content: '-',
        styles: { halign: 'center', fillColor: [243, 244, 246] }
      },
      {
        content: `Total ${group.wood}`,
        styles: { fontStyle: 'bold', halign: 'left', fillColor: [243, 244, 246] }
      },
      {
        content: `${groupPieces} PCS`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 244, 246] }
      },
      {
        content: `${groupCft.toFixed(4)} CFT`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 244, 246] }
      },
      {
        content: '-',
        styles: { halign: 'right', fillColor: [243, 244, 246] }
      },
      {
        content: '-',
        styles: { halign: 'center', fillColor: [243, 244, 246] }
      },
      {
        content: `Rs. ${formatIndianCurrency(groupAmount)}`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 244, 246] }
      }
    ]);
  }

  // 4. Additional Services & Charges
  if (invoiceData?.additionalCharges) {
    const ac = invoiceData.additionalCharges;
    const totalCarpentry = (ac.carpentry || 0) + (ac.sawing || 0);
    if (totalCarpentry > 0) {
      tableBody.push([
        (slCounter++).toString(),
        'CARPENTRY WORKS',
        '1 PCS',
        '-',
        formatIndianCurrency(totalCarpentry),
        'JOB',
        formatIndianCurrency(totalCarpentry)
      ]);
    }
    if (ac.transportation && ac.transportation > 0) {
      tableBody.push([
        (slCounter++).toString(),
        'TRANSPORTATION & DELIVERY CHARGES',
        '1 PCS',
        '-',
        formatIndianCurrency(ac.transportation),
        'TRIP',
        formatIndianCurrency(ac.transportation)
      ]);
    }
    if (ac.planing && ac.planing > 0) {
      tableBody.push([
        (slCounter++).toString(),
        'PLANING CHARGES',
        '1 PCS',
        '-',
        formatIndianCurrency(ac.planing),
        'JOB',
        formatIndianCurrency(ac.planing)
      ]);
    }
    if (ac.other && ac.other > 0) {
      tableBody.push([
        (slCounter++).toString(),
        (ac.otherLabel || 'OTHER CHARGES').toUpperCase(),
        '1 PCS',
        '-',
        formatIndianCurrency(ac.other),
        'JOB',
        formatIndianCurrency(ac.other)
      ]);
    }
  }

  // 4. GST Line (don't mention tax percentage)
  if (invoiceData?.gstAmount && invoiceData.gstAmount > 0) {
    tableBody.push([
      (slCounter++).toString(),
      'GST',
      '-',
      '-',
      '-',
      '-',
      formatIndianCurrency(invoiceData.gstAmount)
    ]);
  }

  // 5. Finally Discount Line
  if (invoiceData?.discountAmount && invoiceData.discountAmount > 0) {
    tableBody.push([
      (slCounter++).toString(),
      invoiceData.discountDesc ? `LESS: DISCOUNT (${invoiceData.discountDesc})` : 'LESS: DISCOUNT',
      '-',
      '-',
      '-',
      'DISC',
      `- ${formatIndianCurrency(invoiceData.discountAmount)}`
    ]);
  }

  // For clean vertical page filling, pad with empty rows if under 12 items
  const emptyRowsNeeded = tableBody.length <= 11 ? Math.max(0, 10 - tableBody.length) : 0;
  for (let i = 0; i < emptyRowsNeeded; i++) {
    tableBody.push(['', '', '', '', '', '', '']);
  }

  autoTable(doc, {
    startY: 87,
    margin: { left: 10, right: 10 },
    head: [[
      'Sl\nNo.',
      'Description of Goods',
      'Quantity',
      'Alt. Quantity',
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
      '',
      '',
      `Rs. ${formatIndianCurrency(effectiveTotal)}`
    ]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.8,
      cellPadding: 1.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 6.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.2
    },
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'left', cellWidth: 72, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 20 },
      5: { halign: 'center', cellWidth: 10 },
      6: { halign: 'right', cellWidth: 33, fontStyle: 'bold' }
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
  doc.setFontSize(6.2);
  doc.text('Amount Chargeable (in words)', 11.5, bottomY + 3.2);
  doc.setFont('helvetica', 'bold');
  doc.text('E. & O.E', 198.5, bottomY + 3.2, { align: 'right' });

  doc.setFontSize(7.4);
  doc.text(amountInWords, 11.5, bottomY + 6.8);

  const blockY = bottomY + 8;
  const blockHeight = 48;

  // Outer container for Terms + Tax (Left), Payment Scanner (Middle), and Big Seals (Right)
  doc.rect(10, blockY, 190, blockHeight);
  doc.line(92, blockY, 92, blockY + blockHeight); // Divider between Left & Middle
  doc.line(134, blockY, 134, blockY + blockHeight); // Divider between Middle & Right

  // --- 1. LEFT SIDE: Company's Bank Details (x: 10 to 92) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(0, 0, 0);
  doc.text("Company's Bank Details", 12.5, blockY + 5.5);

  doc.setDrawColor(220, 220, 220);
  doc.line(12.5, blockY + 7.5, 90, blockY + 7.5);
  doc.setDrawColor(0, 0, 0);

  // Row 1: A/c Holder's Name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(50, 50, 50);
  doc.text("A/c Holder's Name :", 12.5, blockY + 13.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text("HINDUSTAN SAW MILLS AND", 12.5, blockY + 18);
  doc.text("WOOD INDUSTRIES 2024-25", 12.5, blockY + 22);

  // Row 2: Bank Name
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.text("Bank Name", 12.5, blockY + 28);
  doc.text(":", 40, blockY + 28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text("ICICI BANK", 43, blockY + 28);

  // Row 3: A/c No.
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.text("A/c No.", 12.5, blockY + 34);
  doc.text(":", 40, blockY + 34);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text("464205000153", 43, blockY + 34);

  // Row 4: Branch & IFS Code
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.text("Branch & IFS Code", 12.5, blockY + 40);
  doc.text(":", 40, blockY + 40);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text("JP NAGAR & ICIC0004642", 43, blockY + 40);

  // --- 2. MIDDLE: Payment Scanner (UPI QR Code) (x: 92 to 134) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text('Scan & Pay via UPI', 113, blockY + 4.5, { align: 'center' });

  try {
    doc.addImage(PAYMENT_QR_BASE64, 'PNG', 101, blockY + 6.5, 24, 24);
  } catch (err) {
    console.warn('Could not draw QR code on PDF:', err);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(80, 80, 80);
  doc.text('GPay  •  PhonePe  •  Paytm  •  BHIM', 113, blockY + 33.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(0, 0, 0);
  doc.text('UPI ID: hindustansawmill@icici', 113, blockY + 37.5, { align: 'center' });

  // Small note below QR
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.8);
  doc.setTextColor(100, 100, 100);
  doc.text('Instant Bank-to-Bank Transfer', 113, blockY + 41.5, { align: 'center' });

  // --- 3. RIGHT SIDE: Big Customer Seal & Big Company Authorised Signatory (x: 134 to 200) ---
  // Sub-divider between Customer Seal (134 to 167) and Authorised Signatory (167 to 200)
  doc.line(167, blockY, 167, blockY + blockHeight);

  // Big Customer's Seal and Signature Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(0, 0, 0);
  doc.text("Customer's Seal and", 136, blockY + 5);
  doc.text('Signature', 136, blockY + 8.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(130, 130, 130);
  doc.text('[ Affix Seal & Sign Here ]', 150.5, blockY + 44, { align: 'center' });

  // Big Authorised Signatory Box (Full Height)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(0, 0, 0);
  doc.text('for HINDUSTAN SAW MILLS AND', 169, blockY + 5);
  doc.text('WOOD INDUSTRIES', 169, blockY + 8.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(130, 130, 130);
  doc.text('[ Authorised Stamp & Sign ]', 183.5, blockY + 39, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(0, 0, 0);
  doc.text('Authorised Signatory', 198.5, blockY + 45.5, { align: 'right' });

  // -------------------------------------------------------------
  // 5. Bottom Computer Generated Note
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
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
