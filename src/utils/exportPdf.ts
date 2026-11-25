import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  BusinessSettings,
  MeasurementSheet,
  RoundLogOutputUnit,
  RoundLogInputUnitType,
  RoundLogItem
} from '../types';
import { LOGO_ICON_BASE64 } from './logoBase64';
import { PAYMENT_QR_BASE64 } from './paymentQrBase64';
import { numberToIndianCurrencyWords, formatIndianCurrency } from './indianNumberWords';
import { sortTimberEntries, formatValue, getCutLogItemDescription, getCutLogItemSectionHeading, normalizeTeakGrade } from './calculator';
import {
  groupRoundLogsBySpeciesFirst,
  getRoundLogUnitConfig
} from './roundLogCalculator';

export interface ProformaInvoiceExportData {
  voucherType?: 'sales' | 'purchase';
  customerName?: string;
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

  items?: Array<{
    slNo: number;
    description: string;
    woodType?: string;
    hsn: string;
    cft: number;
    sqft?: number;
    widthInches?: number | '';
    rateUnit?: 'CFT' | 'SQFT' | 'CBM' | 'PCS';
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
  const destination = invoiceData?.destination || sheet.destination || sheet.consigneeDistrict?.toUpperCase() || sheet.consigneeState?.toUpperCase() || sheet.customerState?.toUpperCase() || 'BANGLORE';
  const motorVehicleNo = invoiceData?.motorVehicleNo || '';
  const termsOfDelivery = invoiceData?.termsOfDelivery || 'TRANSPORTATION EXTRA\nAPPLICABLE GST EXTRA';

  const consigneeName = invoiceData?.consigneeName ?? sheet.consigneeName ?? sheet.customerName ?? '';
  const consigneeAddress = invoiceData?.consigneeAddress ?? sheet.consigneeAddress ?? sheet.customerAddress ?? '';
  const consigneeGstin = invoiceData?.consigneeGstin ?? sheet.consigneeGstin ?? '';
  const consigneeState = invoiceData?.consigneeState ?? sheet.consigneeState ?? sheet.destination ?? 'Karnataka';
  const consigneeStateCode = invoiceData?.consigneeStateCode ?? sheet.consigneeStateCode ?? sheet.customerStateCode ?? '29';
  const consigneePhone = invoiceData?.consigneePhone ?? sheet.consigneePhone ?? sheet.customerPhone ?? '';

  const buyerName = invoiceData?.buyerName ?? sheet.customerName ?? consigneeName ?? '';
  const buyerPhone = invoiceData?.buyerPhone ?? sheet.customerPhone ?? consigneePhone ?? '';
  const buyerAddress = invoiceData?.buyerAddress ?? sheet.customerAddress ?? consigneeAddress ?? '';
  const buyerGstin = invoiceData?.buyerGstin ?? sheet.customerGstin ?? '';
  const buyerState = invoiceData?.buyerState ?? sheet.customerState ?? consigneeState ?? 'Karnataka';
  const buyerStateCode = invoiceData?.buyerStateCode ?? sheet.customerStateCode ?? consigneeStateCode ?? '29';

  const defaultRate = settings?.ratePerCft || 1200;
  const isRoundLog = invoiceData?.logType === 'round' || sheet.logType === 'round';
  const roundLogItems = invoiceData?.roundLogItems || sheet.roundLogItems || [];
  const roundLogOutputUnit = invoiceData?.roundLogOutputUnit || sheet.roundLogOutputUnit || 'CFT';
  const roundLogInputUnit = invoiceData?.roundLogInputUnit || sheet.roundLogInputUnit || 'girth_ft_length_ft';
  const roundLogSlabRates = invoiceData?.roundLogSlabRates || sheet.roundLogSlabRates || {};

  const { speciesSections, overallTotals: roundOverallTotals } = groupRoundLogsBySpeciesFirst(
    roundLogItems,
    roundLogOutputUnit,
    roundLogInputUnit,
    roundLogSlabRates
  );

  // Build items list
  let items = invoiceData?.items;
  if (!items || items.length === 0) {
    const rawItems = sheet.items && sheet.items.length > 0 ? sheet.items : [];
    const sourceItems = sortTimberEntries(rawItems);
    items = sourceItems
      .filter((it) => {
        const isSheet = it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready') || it.rateUnit === 'PCS' || it.rateUnit === 'SQFT';
        if (isSheet) {
          return typeof it.pieces === 'number' && it.pieces > 0;
        }
        return typeof it.lengthFeet === 'number' && it.lengthFeet > 0 && typeof it.pieces === 'number' && it.pieces > 0;
      })
      .map((it, idx) => {
        const isSheet = it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready') || it.rateUnit === 'PCS' || it.rateUnit === 'SQFT';
        if (isSheet) {
          const wood = getCutLogItemSectionHeading(it as any);
          const desc = getCutLogItemDescription({ ...it, woodType: wood });
          const pcs = typeof it.pieces === 'number' ? it.pieces : (parseFloat(String(it.pieces)) || 0);
          const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : 0;
          const isPly = it.itemCategory === 'plywood' || wood.includes('PLYWOOD');
          let sheetW = typeof it.widthInches === 'number' && it.widthInches > 0 ? it.widthInches : (isPly ? 4 : 12);
          if (!sheetW && (it as any).boardSize) {
            const match = (it as any).boardSize.match(/8\s*[xX×*]\s*(\d+)/);
            if (match) sheetW = parseInt(match[1], 10);
          }
          const sqft = typeof it.sqft === 'number' && it.sqft > 0 ? it.sqft : (isPly ? (32 * pcs) : ((8 * sheetW * pcs) / 12));
          const amt = Math.round(sqft * r * 100) / 100;
          return {
            slNo: idx + 1,
            description: desc,
            woodType: wood,
            itemCategory: it.itemCategory,
            brand: it.brand,
            hsn: '4412',
            cft: 0,
            sqft,
            widthInches: sheetW,
            rateUnit: 'SQFT' as any,
            pieces: pcs,
            rate: r,
            per: 'SQFT',
            discPercent: '',
            amount: amt
          };
        }
        const l = it.lengthFeet;
        const w = it.widthInches;
        const t = it.thicknessInches;
        const wood = getCutLogItemSectionHeading(it as any);
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
          woodType: wood,
          teakGrade: it.teakGrade ? normalizeTeakGrade(it.teakGrade) : undefined,
          hsn: '4407',
          cft,
          sqft,
          widthInches: w,
          rateUnit: (isSqftBilled ? 'SQFT' : 'CFT') as any,
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
  let totalCbm = 0;

  if (isRoundLog) {
    totalPieces = roundOverallTotals.totalPieces;
    totalCft = roundOverallTotals.totalCft;
    totalCbm = roundOverallTotals.totalCbm;
    totalAmount = roundOverallTotals.totalAmount;
  } else {
    for (const it of items) {
      const itDesc = (it.description || (it as any).remarks || '').toUpperCase();
      const itWood = (it.woodType || '').toUpperCase();
      const isPlywood = (it as any).itemCategory === 'plywood' || itWood.includes('PLYWOOD') || itDesc.includes('PLYWOOD');
      const isReady = (it as any).itemCategory === 'ready_board' || itWood.includes('READY') || itDesc.includes('READY');
      const isSheet = isPlywood || isReady || (it as any).rateUnit === 'PCS' || (it as any).rateUnit === 'SQFT' || it.per === 'PCS' || it.per === 'SQFT';

      if (!isSheet) {
        totalCft += (typeof it.cft === 'number' ? it.cft : 0);
      }
      totalPieces += (typeof it.pieces === 'number' ? it.pieces : 0);
      if (isSheet) {
        const p = typeof it.pieces === 'number' ? it.pieces : (parseFloat(String(it.pieces)) || 0);
        const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : 0;
        const isPly = (it as any).itemCategory === 'plywood' || itWood.includes('PLYWOOD') || itDesc.includes('PLYWOOD');
        let sheetW = typeof it.widthInches === 'number' && it.widthInches > 0 ? it.widthInches : (isPly ? 4 : 12);
        if (!sheetW && (it as any).boardSize) {
          const match = (it as any).boardSize.match(/8\s*[xX×*]\s*(\d+)/);
          if (match) sheetW = parseInt(match[1], 10);
        }
        const sqft = typeof it.sqft === 'number' && it.sqft > 0 ? it.sqft : (isPly ? (32 * p) : ((8 * sheetW * p) / 12));
        const amt = Math.round(sqft * r * 100) / 100;
        totalAmount += amt;
        totalSqftBilled += sqft;
      } else {
        const isSqftBilled = it.rateUnit === 'SQFT' || it.per === 'SQFT';
        const defaultRowRate = isSqftBilled ? 120 : defaultRate;
        const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
        const mult = isSqftBilled ? (typeof it.sqft === 'number' ? it.sqft : (it.cft || 0) * 12) : it.cft;
        const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(mult * r * 100) / 100;
        totalAmount += amt;

        if (isSqftBilled) {
          totalSqftBilled += (typeof it.sqft === 'number' ? it.sqft : (it.cft || 0) * 12);
        } else {
          totalCftBilled += it.cft;
        }
      }
    }
  }

  const additionalChargesSum =
    ((invoiceData?.additionalCharges?.carpentry || 0) + (invoiceData?.additionalCharges?.sawing || 0)) +
    (invoiceData?.additionalCharges?.transportation || 0) +
    (invoiceData?.additionalCharges?.planing || 0) +
    (invoiceData?.additionalCharges?.other || 0);
  const gstAmt = invoiceData?.gstAmount || 0;
  const discAmt = invoiceData?.discountAmount || 0;
  const computedFallback = Math.max(0, totalAmount + additionalChargesSum + gstAmt - discAmt);

  const effectiveTotal = isRoundLog
    ? computedFallback
    : ((invoiceData?.finalGrandTotal !== undefined && invoiceData.finalGrandTotal > 0)
        ? invoiceData.finalGrandTotal
        : (computedFallback > 0 ? computedFallback : totalAmount));
  const amountInWords = numberToIndianCurrencyWords(effectiveTotal);

  // -------------------------------------------------------------
  // DRAW PROFORMA INVOICE PDF (Strictly matching sample photo)
  // -------------------------------------------------------------
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);

  // 1. Top Header Box: "PROFORMA INVOICE"
  const voucherType = invoiceData?.voucherType || sheet.voucherType || 'sales';
  doc.rect(10, 8, 190, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text('PROFORMA INVOICE', 105, 13, { align: 'center' });

  // Top-Right Rectangle Box: "SALES" or "PURCHASE"
  const badgeText = voucherType === 'purchase' ? 'PURCHASE' : 'SALES';
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  const badgeWidth = badgeText === 'PURCHASE' ? 20 : 15;
  const badgeX = 200 - 2.5 - badgeWidth;
  doc.rect(badgeX, 9.3, badgeWidth, 4.4);
  doc.text(badgeText, badgeX + badgeWidth / 2, 12.5, { align: 'center' });

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
  doc.text('Consignee (Ship to)', 11.5, 43.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(0, 0, 0);
  doc.text(consigneeName || 'New India Saw Mill', 11.5, 46.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(40, 40, 40);
  const splitConsigneeAddr = doc.splitTextToSize(consigneeAddress || 'Local Mill Pickup', 90);
  const maxConsigneeAddrLines = consigneePhone ? 1 : 2;
  let cY = 50.2;
  for (let i = 0; i < Math.min(splitConsigneeAddr.length, maxConsigneeAddrLines); i++) {
    doc.text(splitConsigneeAddr[i], 11.5, cY);
    cY += 3.3;
  }

  // Aligned Contact No, GSTIN & State rows
  let cMetaY = consigneePhone ? 54.0 : 57.8;
  if (consigneePhone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(70, 70, 70);
    doc.text('Contact No.', 11.5, cMetaY);
    doc.text(':', 27.5, cMetaY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(consigneePhone, 29.5, cMetaY);
    cMetaY += 3.8;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(70, 70, 70);
  doc.text('GSTIN/UIN', 11.5, cMetaY);
  doc.text(':', 27.5, cMetaY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(consigneeGstin || '', 29.5, cMetaY);
  cMetaY += 3.6;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  doc.text('State Name', 11.5, cMetaY);
  doc.text(':', 27.5, cMetaY);
  doc.setTextColor(0, 0, 0);
  doc.text(`${consigneeState || ''}, Code : ${consigneeStateCode || ''}`, 29.5, cMetaY);

  doc.line(10, 63.5, 105, 63.5); // Divider below consignee

  // C. Buyer (Bill to) (y: 63.5 to 87, height = 23.5mm)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text('Buyer (Bill to)', 11.5, 67.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(0, 0, 0);
  doc.text(buyerName || consigneeName || 'New India Saw Mill', 11.5, 70.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(40, 40, 40);
  const splitBuyerAddr = doc.splitTextToSize(buyerAddress || consigneeAddress || 'Local Mill Pickup', 90);
  const maxBuyerAddrLines = buyerPhone ? 1 : 2;
  let bY = 74.2;
  for (let i = 0; i < Math.min(splitBuyerAddr.length, maxBuyerAddrLines); i++) {
    doc.text(splitBuyerAddr[i], 11.5, bY);
    bY += 3.3;
  }

  // Aligned Contact No, GSTIN & State rows
  let bMetaY = buyerPhone ? 78.0 : 81.8;
  if (buyerPhone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(70, 70, 70);
    doc.text('Contact No.', 11.5, bMetaY);
    doc.text(':', 27.5, bMetaY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(buyerPhone, 29.5, bMetaY);
    bMetaY += 3.8;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(70, 70, 70);
  doc.text('GSTIN/UIN', 11.5, bMetaY);
  doc.text(':', 27.5, bMetaY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(buyerGstin || '', 29.5, bMetaY);
  bMetaY += 3.6;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  doc.text('State Name', 11.5, bMetaY);
  doc.text(':', 27.5, bMetaY);
  doc.setTextColor(0, 0, 0);
  doc.text(`${buyerState || ''}, Code : ${buyerStateCode || ''}`, 29.5, bMetaY);

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
  const tableBody: any[] = [];
  let slCounter = 1;

  if (isRoundLog) {
    let globalSlNo = 1;
    let itemIdx = 0;
    for (const spSec of speciesSections) {
      // 1. Parent Header: Wood Species Banner
      const speciesBorder = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 };
      tableBody.push([
        {
          content: spSec.woodType.toUpperCase(),
          colSpan: 5,
          styles: {
            fontStyle: 'bold',
            textColor: [0, 0, 0],
            fontSize: 8.8,
            cellPadding: { left: 2.2, top: 0.65, bottom: 0.65 },
            halign: 'left',
            fillColor: [226, 232, 240],
            lineWidth: speciesBorder
          }
        }
      ]);

      for (const slabGroup of spSec.slabGroups) {
        // 2. Girth Slab Sub-section Header inside this wood
        const slabBorder = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 };
        const slabBannerTitle = slabGroup.slabTitle.endsWith('Logs')
          ? slabGroup.slabTitle
          : `${slabGroup.slabTitle} Logs`;

        tableBody.push([
          {
            content: slabBannerTitle,
            colSpan: 5,
            styles: {
              fontStyle: 'bold',
              textColor: [30, 41, 59],
              fontSize: 7.8,
              cellPadding: { left: 5.0, top: 0.45, bottom: 0.45 },
              halign: 'left',
              fillColor: [241, 245, 249],
              lineWidth: slabBorder
            }
          }
        ]);

        // 3. Individual Log Rows (5 columns: Sl No, Log No, Length, Girth, Volume)
        const itemBorder = { top: 0, bottom: 0.2, left: 0.2, right: 0.2 };
        for (const it of slabGroup.items) {
          const rowCfg = getRoundLogUnitConfig(it.inputUnit || roundLogInputUnit);
          const lStr = `${it.length} ${rowCfg.lengthUnit}`;
          const gStr = it.girthFtInStr || (it.girthInches !== undefined ? `${formatValue(it.girthInches, 1)}"` : `${it.girth}`);
          const activeVol = roundLogOutputUnit === 'CFT' ? (it.cft || it.volume) : (it.cbm || it.volume);
          const zebraBg = (itemIdx++ % 2 === 0) ? [255, 255, 255] : [248, 249, 250];

          tableBody.push([
            { content: `${globalSlNo++}`, styles: { lineWidth: itemBorder, halign: 'center', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
            { content: `${it.serialNumber || 1}`, styles: { lineWidth: itemBorder, halign: 'center', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
            { content: lStr, styles: { lineWidth: itemBorder, halign: 'center', fontStyle: 'bold', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
            { content: gStr, styles: { lineWidth: itemBorder, halign: 'center', fontStyle: 'bold', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
            { content: formatValue(activeVol, 4), styles: { lineWidth: itemBorder, halign: 'right', fontStyle: 'bold', fillColor: zebraBg, cellPadding: { right: 2.5, top: 0.45, bottom: 0.45 } } }
          ]);
        }
      }

      // 4. Dedicated Pricing Summary Box for this Wood Species
      const pricingBorder = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 };
      const pricingBg: [number, number, number] = [248, 250, 252];

      for (const slabGroup of spSec.slabGroups) {
        const slabLabel = (slabGroup.slabId === 'upto_23' || slabGroup.slabTitle.toLowerCase().includes('upto'))
          ? 'Below 23"'
          : slabGroup.slabTitle;

        tableBody.push([
          {
            content: `${slabLabel}  :  ${slabGroup.totalPieces} logs   ${formatValue(slabGroup.totalVolume, 4)} ${roundLogOutputUnit}  @  Rs. ${formatValue(slabGroup.rate, 2)}  =`,
            colSpan: 4,
            styles: {
              fontStyle: 'bold',
              halign: 'left',
              cellPadding: { left: 5.0, top: 0.5, bottom: 0.5 },
              fillColor: pricingBg,
              lineWidth: pricingBorder
            }
          },
          {
            content: `Rs. ${formatIndianCurrency(slabGroup.subtotal)}`,
            styles: {
              fontStyle: 'bold',
              halign: 'right',
              cellPadding: { right: 2.5, top: 0.5, bottom: 0.5 },
              fillColor: pricingBg,
              lineWidth: pricingBorder
            }
          }
        ]);
      }

      // 5. Species Total Row
      const speciesTotalBorder = { top: 0.3, bottom: 0.3, left: 0.2, right: 0.2 };
      const speciesTotalBg: [number, number, number] = [238, 242, 246];
      tableBody.push([
        {
          content: `Total ${spSec.woodType.toUpperCase()}  :  ${spSec.totalPieces} logs  |  ${formatValue(roundLogOutputUnit === 'CFT' ? spSec.totalCft : spSec.totalCbm, 4)} ${roundLogOutputUnit}  =`,
          colSpan: 4,
          styles: {
            fontStyle: 'bold',
            halign: 'left',
            cellPadding: { left: 3.5, top: 0.6, bottom: 0.6 },
            fillColor: speciesTotalBg,
            lineWidth: speciesTotalBorder
          }
        },
        {
          content: `Rs. ${formatIndianCurrency(spSec.totalAmount)}`,
          styles: {
            fontStyle: 'bold',
            halign: 'right',
            cellPadding: { right: 2.5, top: 0.6, bottom: 0.6 },
            fillColor: speciesTotalBg,
            lineWidth: speciesTotalBorder
          }
        }
      ]);
    }

    // 6. TOTAL WOOD AMOUNT row
    if (totalPieces > 0) {
      const totalWoodBorder = { top: 0.3, bottom: 0.3, left: 0.2, right: 0.2 };
      const woodBg: [number, number, number] = [226, 232, 240];
      tableBody.push([
        {
          content: 'TOTAL WOOD AMOUNT',
          colSpan: 2,
          styles: {
            fontStyle: 'bold',
            halign: 'left',
            cellPadding: { left: 2.2, top: 0.6, bottom: 0.6 },
            fillColor: woodBg,
            lineWidth: totalWoodBorder
          }
        },
        {
          content: `${totalPieces} LOGS CLASSIFIED`,
          styles: {
            fontStyle: 'bold',
            halign: 'center',
            fillColor: woodBg,
            lineWidth: totalWoodBorder,
            cellPadding: { top: 0.6, bottom: 0.6 }
          }
        },
        {
          content: `${formatValue(roundLogOutputUnit === 'CFT' ? totalCft : totalCbm, 4)} ${roundLogOutputUnit}`,
          styles: {
            fontStyle: 'bold',
            halign: 'right',
            fillColor: woodBg,
            lineWidth: totalWoodBorder,
            cellPadding: { right: 2.5, top: 0.6, bottom: 0.6 }
          }
        },
        {
          content: `Rs. ${formatIndianCurrency(totalAmount)}`,
          styles: {
            fontStyle: 'bold',
            halign: 'right',
            fillColor: woodBg,
            lineWidth: totalWoodBorder,
            cellPadding: { right: 2.5, top: 0.6, bottom: 0.6 }
          }
        }
      ]);
    }
  } else {
    // Cut logs items grouped by wood
    const woodGroups: Array<{ wood: string; items: typeof items }> = [];
    const woodMap = new Map<string, typeof items>();

    for (const it of items) {
      const wood = getCutLogItemSectionHeading(it as any);
      if (!woodMap.has(wood)) {
        const arr: typeof items = [];
        woodMap.set(wood, arr);
        woodGroups.push({ wood, items: arr });
      }
      woodMap.get(wood)!.push(it);
    }

    for (const group of woodGroups) {
      group.items.sort((a, b) => {
        const isSheetA = (a as any).itemCategory === 'plywood' || (a as any).itemCategory === 'ready_board' || a.woodType?.toLowerCase().includes('plywood') || a.woodType?.toLowerCase().includes('ready') || (a as any).rateUnit === 'PCS' || a.per === 'PCS';
        const isSheetB = (b as any).itemCategory === 'plywood' || (b as any).itemCategory === 'ready_board' || b.woodType?.toLowerCase().includes('plywood') || b.woodType?.toLowerCase().includes('ready') || (b as any).rateUnit === 'PCS' || b.per === 'PCS';
        if (isSheetA || isSheetB) {
          const wA = typeof a.widthInches === 'number' ? a.widthInches : 0;
          const wB = typeof b.widthInches === 'number' ? b.widthInches : 0;
          if (wA !== wB) return wA - wB;
          const brandA = (a as any).brand || '';
          const brandB = (b as any).brand || '';
          if (brandA !== brandB) return brandA.localeCompare(brandB);
          const rA = typeof a.rate === 'number' ? a.rate : 0;
          const rB = typeof b.rate === 'number' ? b.rate : 0;
          if (rA !== rB) return rA - rB;
          const pA = typeof a.pieces === 'number' ? a.pieces : 0;
          const pB = typeof b.pieces === 'number' ? b.pieces : 0;
          return pB - pA;
        }

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
        if (dA.t !== dB.t) return dB.t - dA.t;
        if (dA.l !== dB.l) return dB.l - dA.l;
        const pA = typeof a.pieces === 'number' ? a.pieces : 0;
        const pB = typeof b.pieces === 'number' ? b.pieces : 0;
        return pB - pA;
      });

      const headingBorder = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 };
      tableBody.push([
        { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } },
        {
          content: group.wood.toUpperCase(),
          styles: { fontStyle: 'bold', textColor: [0, 0, 0], fontSize: 8.5, cellPadding: { left: 2.2, top: 0.5, bottom: 0.5 }, halign: 'left', lineWidth: headingBorder }
        },
        { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } },
        { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } },
        { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } },
        { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } },
        { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } },
        { content: '', styles: { lineWidth: headingBorder, cellPadding: { top: 0.5, bottom: 0.5 } } }
      ]);

      let groupPieces = 0;
      let groupCft = 0;
      let groupSqftBilled = 0;
      let groupAmount = 0;

      const itemBorder = { top: 0, bottom: 0, left: 0.2, right: 0.2 };
      let itemIdx = 0;

      for (const it of group.items) {
        const isSheet = group.wood.includes('PLYWOOD') || group.wood.includes('READY') || (it as any).itemCategory === 'plywood' || (it as any).itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready') || (it as any).rateUnit === 'PCS' || (it as any).rateUnit === 'SQFT' || it.per === 'PCS' || it.per === 'SQFT' || ((it as any).remarks && ((it as any).remarks.toUpperCase().includes('PLYWOOD') || (it as any).remarks.toUpperCase().includes('READY'))) || (it.description && (it.description.toUpperCase().includes('PLYWOOD') || it.description.toUpperCase().includes('READY')));
        let dimOnly = '';
        if (isSheet) {
          dimOnly = getCutLogItemDescription({ ...it, woodType: group.wood || it.woodType } as any);
        } else {
          const rawDim = (it.description || '').split(/\s+/)[0] || it.description;
          dimOnly = rawDim.split(/([xX×])/).map(p => p.trim().replace(/^0+(\d)/, '$1')).join('');
        }
        const isSqftBilled = isSheet || (!isSheet && ((it as any).rateUnit === 'SQFT' || it.per === 'SQFT'));
        const perText = isSheet ? 'SQFT' : (isSqftBilled ? 'SQFT' : 'CFT');
        const zebraBg = (itemIdx++ % 2 === 0) ? [243, 244, 246] : [255, 255, 255];

        const itPieces = typeof it.pieces === 'number' ? it.pieces : (parseFloat(String(it.pieces)) || 0);
        const itRate = typeof it.rate === 'number' ? it.rate : 0;
        const isPly = (it as any).itemCategory === 'plywood' || group.wood.includes('PLYWOOD') || (it.woodType && it.woodType.toUpperCase().includes('PLYWOOD'));
        let sheetW = typeof it.widthInches === 'number' && it.widthInches > 0 ? it.widthInches : (isPly ? 4 : 12);
        if (!sheetW && (it as any).boardSize) {
          const match = (it as any).boardSize.match(/8\s*[xX×*]\s*(\d+)/);
          if (match) sheetW = parseInt(match[1], 10);
        }
        const sheetSqft = typeof it.sqft === 'number' && it.sqft > 0 ? it.sqft : (isPly ? (32 * itPieces) : ((8 * sheetW * itPieces) / 12));
        const rowAmount = isSheet ? Math.round(sheetSqft * itRate * 100) / 100 : (typeof it.amount === 'number' ? it.amount : 0);

        groupPieces += itPieces;
        if (!isSheet) {
          groupCft += (typeof it.cft === 'number' ? it.cft : 0);
        }
        groupAmount += rowAmount;

        if (isSqftBilled) {
          groupSqftBilled += isSheet ? sheetSqft : (typeof it.sqft === 'number' ? it.sqft : (it.cft || 0) * 12);
        }

        const cftText = !isSheet && it.cft > 0 ? `${it.cft.toFixed(4)} CFT` : '';
        const sqftText = isSqftBilled
          ? (isSheet ? `${sheetSqft.toFixed(2)} SQFT` : (it.sqft && it.sqft > 0 ? `${it.sqft.toFixed(2)} SQFT` : `${((it.cft || 0) * 12).toFixed(2)} SQFT`))
          : '';

        const slStr = `${slCounter}`;
        slCounter++;

        tableBody.push([
          { content: slStr, styles: { lineWidth: itemBorder, halign: 'center', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
          { content: `   ${dimOnly}`, styles: { lineWidth: itemBorder, halign: 'left', fontStyle: 'bold', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
          { content: itPieces > 0 ? `${itPieces} PCS` : '', styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
          { content: cftText, styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
          { content: sqftText, styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
          { content: itRate !== 0 ? formatIndianCurrency(itRate) : '', styles: { lineWidth: itemBorder, halign: 'right', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
          { content: perText, styles: { lineWidth: itemBorder, halign: 'center', fillColor: zebraBg, cellPadding: { top: 0.45, bottom: 0.45 } } },
          { content: formatIndianCurrency(rowAmount), styles: { lineWidth: itemBorder, halign: 'left', fontStyle: 'normal', textColor: [75, 85, 99], fillColor: zebraBg, cellPadding: { left: 2.2, top: 0.45, bottom: 0.45 } } }
        ]);
      }

      const subtotalBorder = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 };
      const subtotalTextColor: [number, number, number] = [0, 0, 0];
      const subtotalLineColor: [number, number, number] = [0, 0, 0];
      const subtotalBg: [number, number, number] = [243, 244, 246];

      tableBody.push([
        { content: '', styles: { halign: 'center', fillColor: subtotalBg, lineWidth: subtotalBorder, lineColor: subtotalLineColor, cellPadding: { top: 0.55, bottom: 0.55 } } },
        { content: 'Total', styles: { fontStyle: 'bold', halign: 'left', cellPadding: { left: 2.2, top: 0.55, bottom: 0.55 }, fillColor: subtotalBg, lineWidth: subtotalBorder, lineColor: subtotalLineColor, textColor: subtotalTextColor } },
        { content: `${groupPieces} PCS`, styles: { fontStyle: 'bold', halign: 'right', fillColor: subtotalBg, lineWidth: subtotalBorder, lineColor: subtotalLineColor, cellPadding: { top: 0.55, bottom: 0.55 }, textColor: subtotalTextColor } },
        { content: groupCft > 0 ? `${groupCft.toFixed(4)} CFT` : '', styles: { fontStyle: 'bold', halign: 'right', fillColor: subtotalBg, lineWidth: subtotalBorder, lineColor: subtotalLineColor, cellPadding: { top: 0.55, bottom: 0.55 }, textColor: subtotalTextColor } },
        { content: groupSqftBilled > 0 ? `${groupSqftBilled.toFixed(2)} SQFT` : '', styles: { fontStyle: 'bold', halign: 'right', fillColor: subtotalBg, lineWidth: subtotalBorder, lineColor: subtotalLineColor, cellPadding: { top: 0.55, bottom: 0.55 }, textColor: subtotalTextColor } },
        { content: '', styles: { halign: 'right', fillColor: subtotalBg, lineWidth: subtotalBorder, lineColor: subtotalLineColor, cellPadding: { top: 0.55, bottom: 0.55 } } },
        { content: '', styles: { halign: 'center', fillColor: subtotalBg, lineWidth: subtotalBorder, lineColor: subtotalLineColor, cellPadding: { top: 0.55, bottom: 0.55 } } },
        { content: `Rs. ${formatIndianCurrency(groupAmount)}`, styles: { fontStyle: 'bold', halign: 'right', fillColor: subtotalBg, lineWidth: subtotalBorder, lineColor: subtotalLineColor, cellPadding: { right: 1.8, top: 0.55, bottom: 0.55 }, textColor: subtotalTextColor } }
      ]);
    }

    if (totalPieces > 0) {
      const totalWoodBorder = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 };
      tableBody.push([
        { content: '', styles: { halign: 'center', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } } },
        { content: 'TOTAL WOOD AMOUNT', styles: { fontStyle: 'bold', halign: 'left', cellPadding: { left: 2.2, top: 0.55, bottom: 0.55 }, fillColor: [238, 240, 243], lineWidth: totalWoodBorder } },
        { content: `${totalPieces} PCS`, styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } } },
        { content: totalCft > 0 ? `${totalCft.toFixed(4)} CFT` : '', styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } } },
        { content: totalSqftBilled > 0 ? `${totalSqftBilled.toFixed(2)} SQFT` : '', styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } } },
        { content: '', styles: { halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } } },
        { content: '', styles: { halign: 'center', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { top: 0.55, bottom: 0.55 } } },
        { content: `Rs. ${formatIndianCurrency(totalAmount)}`, styles: { fontStyle: 'bold', halign: 'right', fillColor: [238, 240, 243], lineWidth: totalWoodBorder, cellPadding: { right: 1.8, top: 0.55, bottom: 0.55 } } }
      ]);
    }
  }

  const ac = invoiceData?.additionalCharges;

  let isFirstChargeRow = true;
  let chargeRowIdx = 0;
  const chargeColSpan = isRoundLog ? 3 : 6;
  const chargeRow = (name: string, amountStr: string, isDiscount: boolean = false) => {
    const topWidth = isFirstChargeRow ? 0.2 : 0;
    isFirstChargeRow = false;
    const bg = (chargeRowIdx++ % 2 === 0) ? [243, 244, 246] : [255, 255, 255];
    return [
      { content: '', styles: { lineWidth: { top: topWidth, bottom: 0, left: 0.2, right: 0.2 }, fillColor: bg, cellPadding: { top: 0.55, bottom: 0.55 } } },
      {
        content: name,
        colSpan: chargeColSpan,
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
    const planingRate = (ac?.planingRatePerCft && ac.planingRatePerCft > 0)
      ? ac.planingRatePerCft
      : (totalCft > 0 ? Math.round((ac.planing / totalCft) * 100) / 100 : 0);
    const planingLabel = planingRate > 0 ? `PLANING CHARGES (Rs. ${planingRate}/CFT)` : 'PLANING CHARGES';
    tableBody.push(chargeRow(planingLabel, formatIndianCurrency(ac.planing)));
  }

  // 2. Next: CARPENTRY WORKS (Carpenter Charges)
  const totalCarpentry = (ac?.carpentry || 0) + (ac?.sawing || 0);
  if (totalCarpentry > 0) {
    tableBody.push(chargeRow('CARPENTRY WORKS', formatIndianCurrency(totalCarpentry)));
  }

  // 3. Next: TRANSPORTATION & DELIVERY CHARGES (Transport Charges)
  if (ac?.transportation && ac.transportation > 0) {
    tableBody.push(chargeRow('TRANSPORTATION & DELIVERY CHARGES', formatIndianCurrency(ac.transportation)));
  }

  // 4. Next: OTHER CHARGES (if any)
  if (ac?.other && ac.other > 0) {
    tableBody.push(chargeRow((ac.otherLabel || 'OTHER CHARGES').toUpperCase(), formatIndianCurrency(ac.other)));
  }

  // 5. Next: GST Line
  if (invoiceData?.gstAmount && invoiceData.gstAmount > 0) {
    const gstLabel = invoiceData?.gstPercent ? `GST (${invoiceData.gstPercent}%)` : 'GST';
    tableBody.push(chargeRow(gstLabel, formatIndianCurrency(invoiceData.gstAmount)));
  }

  // 6. Next: DISCOUNT (if any)
  if (invoiceData?.discountAmount && invoiceData.discountAmount > 0) {
    const totalBeforeDisc = totalAmount + additionalChargesSum + (invoiceData?.gstAmount || 0);
    tableBody.push(chargeRow('TOTAL PRICE BEFORE DISCOUNT', formatIndianCurrency(totalBeforeDisc), false));
    const discLabel = invoiceData.discountDesc ? `LESS: DISCOUNT (${invoiceData.discountDesc})` : 'LESS: DISCOUNT';
    tableBody.push(chargeRow(discLabel, `- ${formatIndianCurrency(invoiceData.discountAmount)}`, true));
  }

  // For clean vertical page filling, pad with empty rows if under 12 items
  const emptyRowsNeeded = tableBody.length <= 11 ? Math.max(0, 10 - tableBody.length) : 0;
  for (let i = 0; i < emptyRowsNeeded; i++) {
    const topWidth = isFirstChargeRow ? 0.2 : 0;
    isFirstChargeRow = false;
    const emptyBorder = { top: topWidth, bottom: 0, left: 0.2, right: 0.2 };
    if (isRoundLog) {
      tableBody.push([
        { content: '', styles: { lineWidth: emptyBorder } },
        { content: '', styles: { lineWidth: emptyBorder } },
        { content: '', styles: { lineWidth: emptyBorder } },
        { content: '', styles: { lineWidth: emptyBorder } },
        { content: '', styles: { lineWidth: emptyBorder } }
      ]);
    } else {
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
  }

  function splitDecimalNumber(s: string) {
    if (!s || typeof s !== 'string') return null;
    const trimmed = s.trim();
    // Only numbers like 10.6337, 2,020.01, - 500.00, Rs. 1,234.56, 10.6337 CFT
    const match = trimmed.match(/^((?:Rs\.?\s*|-|\+)?[\d,]+)\.(\d+)(.*)$/);
    if (!match) return null;
    return {
      intStr: match[1] + '.',
      decStr: match[2],
      suffix: match[3]
    };
  }

  function splitDimension(s: string) {
    if (!s || typeof s !== 'string') return null;
    const trimmed = s.trim();
    if (/^\d+(\.\d+)?[xX×]\d+(\.\d+)?[xX×]\d+(\.\d+)?$/.test(trimmed)) {
      const rawParts = trimmed.split(/([xX×])/);
      return rawParts.map(p => {
        if (p.toLowerCase() === 'x' || p === '×') return 'x';
        return p.trim().replace(/^0+(\d)/, '$1');
      });
    }
    return null;
  }

  const roundHead = [[
    { content: 'Sl\nNo.', styles: { halign: 'center', valign: 'middle' } },
    { content: 'Log\nNo.', styles: { halign: 'center', valign: 'middle' } },
    { content: 'Length', styles: { halign: 'center', valign: 'middle' } },
    { content: 'Girth', styles: { halign: 'center', valign: 'middle' } },
    { content: `Volume\n(${roundLogOutputUnit})`, styles: { halign: 'right', valign: 'middle' } }
  ]];

  const cutHead = [[
    'Sl\nNo.',
    'Description of Goods',
    'Quantity',
    'Alt. Quantity',
    'SQFT',
    'Rate',
    'per',
    'Amount'
  ]];

  const roundFoot = [[
    {
      content: 'GRAND TOTAL',
      colSpan: 2,
      styles: { halign: 'right', fontStyle: 'bold', cellPadding: { right: 2.5 } }
    },
    {
      content: `${totalPieces} LOGS`,
      styles: { halign: 'center', fontStyle: 'bold' }
    },
    {
      content: `${formatValue(roundLogOutputUnit === 'CFT' ? totalCft : totalCbm, 4)} ${roundLogOutputUnit}`,
      styles: { halign: 'right', fontStyle: 'bold' }
    },
    {
      content: `Rs. ${formatIndianCurrency(effectiveTotal)}`,
      styles: { halign: 'right', fontStyle: 'bold', cellPadding: { right: 1.8 }, fontSize: 9.0 }
    }
  ]];

  const cutFoot = [[
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
  ]];

  const roundColumnStyles = {
    0: { halign: 'center', cellWidth: 14 },
    1: { halign: 'center', cellWidth: 18 },
    2: { halign: 'center', cellWidth: 46 },
    3: { halign: 'center', cellWidth: 50 },
    4: { halign: 'right', cellWidth: 62, fontStyle: 'bold', cellPadding: { right: 2.5 } }
  };

  const cutColumnStyles = {
    0: { halign: 'center', cellWidth: 7 },
    1: { halign: 'left', cellWidth: 31, fontStyle: 'bold' },
    2: { halign: 'right', cellWidth: 15 },
    3: { halign: 'right', cellWidth: 32 },
    4: { halign: 'right', cellWidth: 32 },
    5: { halign: 'right', cellWidth: 15 },
    6: { halign: 'center', cellWidth: 9, cellPadding: { left: 0.5, right: 0.5 } },
    7: { halign: 'left', cellWidth: 49, fontStyle: 'bold', cellPadding: { left: 2.2 } }
  };

  const lastColIndex = isRoundLog ? 4 : 7;

  autoTable(doc, {
    startY: 87,
    margin: { left: 10, right: 10 },
    head: isRoundLog ? (roundHead as any) : cutHead,
    body: tableBody,
    foot: isRoundLog ? (roundFoot as any) : cutFoot,
    showFoot: 'lastPage',
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: isRoundLog ? 7.2 : 8.0,
      cellPadding: isRoundLog ? { top: 0.45, bottom: 0.45, left: 0.6, right: 0.6 } : { top: 0.5, bottom: 0.5, left: 1.0, right: 1.0 },
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
      fontSize: isRoundLog ? 7.2 : 8.0,
      cellPadding: { top: 0.8, bottom: 0.8, left: 0.6, right: 0.6 },
      lineColor: [0, 0, 0],
      lineWidth: 0.2
    },
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      valign: 'middle',
      fontSize: isRoundLog ? 7.8 : 8.5,
      cellPadding: { top: 0.8, bottom: 0.8, left: 1.0, right: 1.0 },
      lineColor: [0, 0, 0],
      lineWidth: 0.2
    },
    columnStyles: isRoundLog ? (roundColumnStyles as any) : cutColumnStyles,
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
        const rawRow = Array.isArray(data.row.raw) ? data.row.raw : [];
        const isSectionBanner = (rawRow[0] as any)?.colSpan >= (isRoundLog ? 4 : 7) || (rawRow[1] as any)?.colSpan >= (isRoundLog ? 4 : 7);
        if (isSectionBanner) return;
        const raw = (data.cell.text || []).join(' ').trim();
        if (splitDimension(raw) || splitDecimalNumber(raw)) {
          (data.cell as any).customDrawText = raw;
          data.cell.text = [];
        }
      }
    },
    didDrawCell: (data) => {
      // Ensure crisp, solid vertical lines across body and foot rows
      if (data.section === 'body' || data.section === 'foot') {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);

        // Column 0 left outer border (x = 10 mm)
        if (data.column.index === 0) {
          doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height);
        }

        // Draw vertical right divider for every single cell
        doc.line(data.cell.x + data.cell.width, data.cell.y, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }

      // Draw guaranteed horizontal divider lines across entire table width (10 to 200 mm)
      if (data.column.index === 0 && (data.section === 'body' || data.section === 'foot')) {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);

        const rawRow = Array.isArray(data.row.raw) ? data.row.raw : [];
        const c0 = (rawRow[0] as any)?.content ?? (typeof rawRow[0] === 'string' ? rawRow[0] : '');
        const c1 = (rawRow[1] as any)?.content ?? (typeof rawRow[1] === 'string' ? rawRow[1] : '');

        const isSectionBanner = (rawRow[0] as any)?.colSpan >= (isRoundLog ? 5 : 7) || (rawRow[1] as any)?.colSpan >= (isRoundLog ? 5 : 7);
        const isSubtotalRow = (typeof c0 === 'string' && (c0.startsWith('Sub Total') || c0.startsWith('Total ') || c0.startsWith('Total -') || c0 === 'TOTAL WOOD AMOUNT' || (c0.includes('logs') && c0.includes('@')))) || c1 === 'Total' || c1 === 'TOTAL WOOD AMOUNT';
        const isFootRow = data.section === 'foot';
        const isChargeRow = (rawRow[1] as any)?.colSpan === (isRoundLog ? 3 : 6);
        const isEmptyPaddingRow = c0 === '' && c1 === '' && !isSectionBanner && !isSubtotalRow;

        if (isSectionBanner) {
          doc.line(10, data.cell.y, 200, data.cell.y);
          doc.line(10, data.cell.y + data.cell.height, 200, data.cell.y + data.cell.height);
        } else if (isSubtotalRow || isFootRow) {
          doc.line(10, data.cell.y, 200, data.cell.y);
          doc.line(10, data.cell.y + data.cell.height, 200, data.cell.y + data.cell.height);
        } else if (!isChargeRow && !isEmptyPaddingRow) {
          doc.line(10, data.cell.y + data.cell.height, 200, data.cell.y + data.cell.height);
        }
      }

      if ((data.section === 'body' || data.section === 'foot') && (data.cell as any).customDrawText) {
        const raw = (data.cell as any).customDrawText as string;
        const x = data.cell.x;
        const y = data.cell.y;
        const w = data.cell.width;
        const h = data.cell.height;

        const isFootTotal = data.section === 'foot' && data.column.index === (isRoundLog ? 4 : 5);
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
          const isItemAmount = data.section === 'body' && data.column.index === lastColIndex && data.cell.styles.halign === 'left';
          const padRight = 1.8;
          const padLeft = 2.2;
          const isBold = isFootTotal || data.cell.styles.fontStyle === 'bold';
          const baseFontSize = isFootTotal ? 11.5 : 8.0;
          const decFontSize = isFootTotal ? 8.5 : 6.0;

          // Maximum allowed text width strictly inside the column boundary
          const maxAllowedWidth = Math.max(1, w - padRight - padLeft);

          let currentBaseFontSize = baseFontSize;
          let currentDecFontSize = decFontSize;

          doc.setFont('helvetica', isBold ? 'bold' : 'normal');
          doc.setFontSize(currentBaseFontSize);
          let wInt = doc.getTextWidth(decParts.intStr);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(currentDecFontSize);
          let wDec = doc.getTextWidth(decParts.decStr);
          doc.setFont('helvetica', isBold ? 'bold' : 'normal');
          doc.setFontSize(currentBaseFontSize);
          let wSuffix = doc.getTextWidth(decParts.suffix);

          let totalW = wInt + wDec + wSuffix;

          // Auto-adjust font size dynamically when numbers are huge so they strictly fit inside the column
          if (totalW > maxAllowedWidth && totalW > 0) {
            const scale = Math.max(0.38, maxAllowedWidth / totalW);
            currentBaseFontSize = Math.max(3.8, currentBaseFontSize * scale);
            currentDecFontSize = Math.max(3.0, currentDecFontSize * scale);

            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            doc.setFontSize(currentBaseFontSize);
            wInt = doc.getTextWidth(decParts.intStr);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(currentDecFontSize);
            wDec = doc.getTextWidth(decParts.decStr);
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            doc.setFontSize(currentBaseFontSize);
            wSuffix = doc.getTextWidth(decParts.suffix);

            totalW = wInt + wDec + wSuffix;
          }

          // Strict column confinement: curX will never drop below x + padLeft and will never overflow right boundary
          let curX = isItemAmount ? (x + padLeft) : Math.max(x + padLeft, x + w - padRight - totalW);

          doc.setFont('helvetica', isBold ? 'bold' : 'normal');
          doc.setFontSize(currentBaseFontSize);
          doc.text(decParts.intStr, curX, baseline);
          curX += wInt;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(currentDecFontSize);
          doc.text(decParts.decStr, curX, baseline);
          curX += wDec;

          if (decParts.suffix) {
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            doc.setFontSize(currentBaseFontSize);
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

export function getInvoiceFilename(
  sheet: MeasurementSheet,
  invoiceData?: ProformaInvoiceExportData
): string {
  const rawClient = (
    invoiceData?.customerName ||
    invoiceData?.buyerName ||
    invoiceData?.consigneeName ||
    sheet.customerName ||
    ''
  ).trim();

  if (rawClient && !/^valued customer$/i.test(rawClient)) {
    const cleanClient = rawClient
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .trim();
    if (cleanClient) {
      return `${cleanClient}.pdf`;
    }
  }

  const safeFilename = (sheet.sheetName || 'proforma_invoice')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const dateStr = sheet.measurementDate || invoiceData?.invoiceDate || new Date().toISOString().split('T')[0];
  return `${safeFilename}_${dateStr}.pdf`;
}

export function exportSheetToPdf(
  sheet: MeasurementSheet,
  settings?: BusinessSettings,
  invoiceData?: ProformaInvoiceExportData
): void {
  const doc = createProformaInvoiceDoc(sheet, settings, invoiceData);
  const filename = getInvoiceFilename(sheet, invoiceData);
  doc.save(filename);
}

export function printProformaInvoicePdf(
  sheet: MeasurementSheet,
  settings?: BusinessSettings,
  invoiceData?: ProformaInvoiceExportData
): void {
  const doc = createProformaInvoiceDoc(sheet, settings, invoiceData);
  doc.autoPrint();
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  // Open the auto-printing PDF blob in a new window/tab
  // Modern browsers (Chrome, Edge, Firefox, Safari) immediately launch the native print dialog for the exact PDF
  const printWin = window.open(blobUrl, '_blank');
  if (!printWin) {
    // If popup blocker intervened, use invisible iframe as seamless fallback
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.src = blobUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.location.href = blobUrl;
      }
    };
  }
}

export function getProformaInvoicePdfBlob(
  sheet: MeasurementSheet,
  settings?: BusinessSettings,
  invoiceData?: ProformaInvoiceExportData
): { blob: Blob; filename: string } {
  const doc = createProformaInvoiceDoc(sheet, settings, invoiceData);
  const filename = getInvoiceFilename(sheet, invoiceData);
  const blob = doc.output('blob');
  return { blob, filename };
}
