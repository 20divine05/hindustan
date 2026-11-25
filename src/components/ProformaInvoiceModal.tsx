import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, RotateCcw, Copy, Sparkles, FileText, Check, FileDown, Save } from 'lucide-react';
import type { MeasurementSheet, BusinessSettings } from '../types';
import { numberToIndianCurrencyWords, formatIndianCurrency } from '../utils/indianNumberWords';
import { PAYMENT_QR_BASE64 } from '../utils/paymentQrBase64';
import { exportSheetToPdf, printProformaInvoicePdf } from '../utils/exportPdf';
import { renderDimensionHtml, renderWithSmallDecimalHtml } from './PrintableProformaInvoice';
import { groupRoundLogsBySpeciesFirst, getRoundLogUnitConfig } from '../utils/roundLogCalculator';
import { formatValue, getCutLogItemDescription } from '../utils/calculator';
import './ProformaInvoice.css';

export interface ProformaInvoiceProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: MeasurementSheet | null;
  businessSettings?: BusinessSettings;
  onUpdateSheet?: (updated: Partial<MeasurementSheet>) => void;
}

export interface InvoiceItemRow {
  id?: string;
  sourceIndex?: number;
  slNo: number;
  description: string;
  woodType?: string;
  itemCategory?: string;
  brand?: string;
  hsn: string;
  cft: number;
  sqft?: number;
  widthInches?: number;
  rateUnit?: 'CBM' | 'CFT' | 'SQFT' | 'PCS';
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
  businessSettings,
  onUpdateSheet
}) => {
  const [useSampleData, setUseSampleData] = useState(false);
  const [copiedShipTo, setCopiedShipTo] = useState(false);
  const [isSavedNotice, setIsSavedNotice] = useState(false);

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
  const initialShipState = sheet?.consigneeState?.trim() || sheet?.destination?.trim() || sheet?.customerState?.trim() || 'Karnataka';
  const initialBuyerState = sheet?.customerState?.trim() || sheet?.destination?.trim() || sheet?.consigneeState?.trim() || 'Karnataka';
  const initialShipDistrict = sheet?.consigneeDistrict?.trim() || '';
  const initialDest = (initialShipDistrict || sheet?.destination || initialShipState).toUpperCase();

  const [destination, setDestination] = useState(initialDest);
  const [billOfLadingNo, setBillOfLadingNo] = useState('');
  const [motorVehicleNo, setMotorVehicleNo] = useState('');
  const [termsOfDelivery, setTermsOfDelivery] = useState(savedDraft.termsOfDelivery || '');

  // Consignee (Ship to)
  const [consigneeName, setConsigneeName] = useState(sheet?.consigneeName || sheet?.customerName || '');
  const [consigneePhone, setConsigneePhone] = useState(sheet?.consigneePhone || sheet?.customerPhone || '');
  const [consigneeAddress, setConsigneeAddress] = useState(sheet?.consigneeAddress || sheet?.customerAddress || '');
  const [consigneeGstin, setConsigneeGstin] = useState(sheet?.consigneeGstin || '');
  const [consigneeState, setConsigneeState] = useState(initialShipState);
  const [consigneeStateCode, setConsigneeStateCode] = useState(sheet?.consigneeStateCode || sheet?.customerStateCode || '29');

  // Buyer (Bill to)
  const [buyerName, setBuyerName] = useState(sheet?.customerName || sheet?.consigneeName || '');
  const [buyerPhone, setBuyerPhone] = useState(sheet?.customerPhone || sheet?.consigneePhone || '');
  const [buyerAddress, setBuyerAddress] = useState(sheet?.customerAddress || sheet?.consigneeAddress || '');
  const [buyerGstin, setBuyerGstin] = useState(sheet?.customerGstin || '');
  const [buyerState, setBuyerState] = useState(initialBuyerState);
  const [buyerStateCode, setBuyerStateCode] = useState(sheet?.customerStateCode || '29');

  // Default global rate per CFT
  const [globalRate, setGlobalRate] = useState<number>(businessSettings?.ratePerCft || 1200);

  // Custom per-item rates map: index/id -> rate
  const [customRates, setCustomRates] = useState<Record<string | number, number>>({});
  // Custom per-item HSN map: index/id -> HSN
  const [customHsn, setCustomHsn] = useState<Record<string | number, string>>({});
  // Custom per-item discount map: index/id -> discount
  const [customDisc, setCustomDisc] = useState<Record<string | number, string>>({});

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
    setConsigneePhone('9876543210');
    setConsigneeAddress(sampleAddr);
    setConsigneeGstin('29CJZPK3158H1ZG');
    setConsigneeState('Karnataka');
    setConsigneeStateCode('29');

    setBuyerName('New India Saw Mill');
    setBuyerPhone('9876543210');
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
    const validItems: InvoiceItemRow[] = [];
    let displaySl = 1;

    sourceItems.forEach((it, sourceIdx) => {
      const itDesc = (it.remarks || '').toUpperCase();
      const itWood = (it.woodType || '').toUpperCase();
      const isPlywood = it.itemCategory === 'plywood' || itWood.includes('PLYWOOD') || itDesc.includes('PLYWOOD');
      const isReady = it.itemCategory === 'ready_board' || itWood.includes('READY') || itDesc.includes('READY');
      const isSheet = isPlywood || isReady || it.rateUnit === 'PCS';

      if (isSheet) {
        const p = typeof it.pieces === 'number' ? it.pieces : (parseFloat(String(it.pieces)) || 0);
        if (p > 0) {
          const itemRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : 0;
          const rate = (it.id && customRates[it.id] !== undefined)
            ? customRates[it.id]
            : (customRates[sourceIdx] !== undefined ? customRates[sourceIdx] : itemRate);
          const hsn = (it.id && customHsn[it.id] !== undefined) ? customHsn[it.id] : (customHsn[sourceIdx] ?? '4412');
          const disc = (it.id && customDisc[it.id] !== undefined) ? customDisc[it.id] : (customDisc[sourceIdx] ?? '');
          const wood = isPlywood ? 'PLYWOOD' : 'READY BOARD';
          const brand = it.brand || (isPlywood ? 'Red Tag' : 'Mine Gold');
          const desc = getCutLogItemDescription({ ...it, brand, itemCategory: isPlywood ? 'plywood' : 'ready_board', woodType: wood });
          const amount = Math.round(p * rate * 100) / 100;

          validItems.push({
            id: it.id,
            sourceIndex: sourceIdx,
            slNo: displaySl++,
            description: desc,
            woodType: wood,
            itemCategory: isPlywood ? 'plywood' : 'ready_board',
            brand,
            hsn,
            cft: 0,
            sqft: 0,
            widthInches: typeof it.widthInches === 'number' ? it.widthInches : (isPlywood ? 4 : 12),
            rateUnit: 'PCS',
            pieces: p,
            rate,
            per: 'PCS',
            discPercent: disc,
            amount
          });
        }
        return;
      }

      if (typeof it.lengthFeet === 'number' && it.lengthFeet > 0 && typeof it.pieces === 'number' && it.pieces > 0) {
        const l = it.lengthFeet;
        const w = typeof it.widthInches === 'number' ? it.widthInches : 0;
        const t = it.thicknessInches;
        const isSqftBilled = (typeof w === 'number' ? w : 0) >= 7 && it.rateUnit !== 'CFT';
        const defaultItemRate = isSqftBilled ? 120 : globalRate;
        const itemRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultItemRate;
        const rate = (it.id && customRates[it.id] !== undefined)
          ? customRates[it.id]
          : (customRates[sourceIdx] !== undefined ? customRates[sourceIdx] : itemRate);
        const hsn = (it.id && customHsn[it.id] !== undefined) ? customHsn[it.id] : (customHsn[sourceIdx] ?? '4407');
        const disc = (it.id && customDisc[it.id] !== undefined) ? customDisc[it.id] : (customDisc[sourceIdx] ?? '');
        const wood = (it.woodType || 'TIMBER').toUpperCase();
        const desc = `${l}X${w}X${t} ${wood}`;
        const cft = it.cft;
        const sqft = it.sqft || (it.cft * 12);
        const pcs = typeof it.pieces === 'number' ? it.pieces : 0;
        const multiplier = isSqftBilled ? sqft : cft;
        const amount = Math.round(multiplier * rate * 100) / 100;

        validItems.push({
          id: it.id,
          sourceIndex: sourceIdx,
          slNo: displaySl++,
          description: desc,
          woodType: wood,
          hsn,
          cft,
          sqft,
          widthInches: w,
          rateUnit: it.rateUnit === 'SQFT' ? 'SQFT' : 'CFT',
          pieces: pcs,
          rate,
          per: isSqftBilled ? 'SQFT' : 'CFT',
          discPercent: disc,
          amount
        });
      }
    });

    return validItems;
  }, [sheet, useSampleData, customRates, customHsn, customDisc, globalRate]);

  // Aggregate Totals
  const { totalCft, totalSqft, totalPieces, totalAmount, totalSqftBilled } = useMemo(() => {
    let cftSum = 0;
    let sqftSum = 0;
    let pcsSum = 0;
    let amtSum = 0;
    let sqftBilled = 0;

    for (const it of invoiceItems) {
      const isSheet = it.rateUnit === 'PCS' || it.per === 'PCS';
      if (!isSheet) {
        cftSum += it.cft;
        sqftSum += (it.sqft || (it.cft * 12));
      }
      pcsSum += it.pieces;
      amtSum += it.amount;
      if (!isSheet && it.rateUnit !== 'CFT' && (it.widthInches || 0) >= 7) {
        sqftBilled += (it.sqft || (it.cft * 12));
      }
    }

    return {
      totalCft: cftSum,
      totalSqft: sqftSum,
      totalPieces: pcsSum,
      totalAmount: amtSum,
      totalSqftBilled: sqftBilled
    };
  }, [invoiceItems]);

  const isRoundLog = sheet?.logType === 'round';
  const roundLogItems = sheet?.roundLogItems || [];
  const roundLogOutputUnit = sheet?.roundLogOutputUnit || 'CFT';
  const roundLogInputUnit = sheet?.roundLogInputUnit || 'girth_ft_length_ft';
  const roundLogSlabRates = sheet?.roundLogSlabRates || {};

  const roundSpeciesData = useMemo(() => {
    return groupRoundLogsBySpeciesFirst(
      roundLogItems,
      roundLogOutputUnit,
      roundLogInputUnit,
      roundLogSlabRates
    );
  }, [roundLogItems, roundLogOutputUnit, roundLogInputUnit, roundLogSlabRates]);

  const effectiveTotalPieces = isRoundLog ? roundSpeciesData.overallTotals.totalPieces : totalPieces;
  const effectiveTotalCft = isRoundLog ? roundSpeciesData.overallTotals.totalCft : totalCft;
  const effectiveTotalCbm = isRoundLog ? roundSpeciesData.overallTotals.totalCbm : 0;
  const effectiveWoodTotalAmount = isRoundLog ? roundSpeciesData.overallTotals.totalAmount : totalAmount;

  const ac = sheet?.additionalCharges;
  const totalCarpentryWorks = (ac?.carpentry || 0) + (ac?.sawing || 0);
  const totalTransportation = ac?.transportation || 0;
  const totalPlaning = ac?.planing || 0;
  const billingBaseVol = isRoundLog ? (roundLogOutputUnit === 'CBM' ? effectiveTotalCbm : effectiveTotalCft) : totalCft;
  const planingRate = (ac?.planingRatePerCft && ac.planingRatePerCft > 0)
    ? ac.planingRatePerCft
    : (totalPlaning > 0 && billingBaseVol > 0 ? Math.round((totalPlaning / billingBaseVol) * 100) / 100 : 0);
  const planingUnitLabel = isRoundLog ? roundLogOutputUnit : 'CFT';
  const planingLabel = planingRate > 0 ? `PLANING CHARGES (Rs. ${planingRate}/${planingUnitLabel})` : 'PLANING CHARGES';
  const totalOther = ac?.other || 0;
  const additionalChargesSum = totalCarpentryWorks + totalTransportation + totalPlaning + totalOther;
  const discAmount = sheet?.discount?.amount || 0;
  const subtotalWithCharges = effectiveWoodTotalAmount + additionalChargesSum;
  const gstTaxableBase = (sheet?.customGstTaxableAmount && sheet.customGstTaxableAmount > 0)
    ? sheet.customGstTaxableAmount
    : subtotalWithCharges;
  const gstAmount = sheet?.gstPercent ? Math.round((gstTaxableBase * (sheet.gstPercent / 100)) * 100) / 100 : 0;
  const hasCustomEdits = Object.keys(customRates).length > 0;
  const computedFallback = Math.max(0, subtotalWithCharges + gstAmount - discAmount);
  const effectiveTotal = (hasCustomEdits || !sheet?.finalGrandTotal)
    ? computedFallback
    : sheet.finalGrandTotal;

  const amountInWords = useMemo(() => {
    return numberToIndianCurrencyWords(effectiveTotal);
  }, [effectiveTotal]);

  // Construct payload of current modal state for saving & syncing
  const getLatestPayload = (): Partial<MeasurementSheet> => {
    const sourceItems = sheet?.items && sheet.items.length > 0 ? sheet.items : [];
    const updatedItems = sourceItems.map((it, idx) => {
      const rateVal = (it.id && customRates[it.id] !== undefined)
        ? customRates[it.id]
        : (customRates[idx] !== undefined ? customRates[idx] : it.rate);
      if (rateVal !== undefined) {
        const isSqftBilled = (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit !== 'CFT';
        const mult = isSqftBilled ? (it.sqft || (it.cft * 12)) : it.cft;
        const amount = Math.round(mult * (Number(rateVal) || 0) * 100) / 100;
        return {
          ...it,
          rate: rateVal,
          amount
        };
      }
      return it;
    });

    return {
      consigneeName,
      consigneePhone,
      consigneeAddress,
      consigneeGstin,
      consigneeState,
      consigneeStateCode,
      consigneeDistrict: destination,
      customerName: buyerName,
      customerPhone: buyerPhone,
      customerAddress: buyerAddress,
      customerGstin: buyerGstin,
      customerState: buyerState,
      customerStateCode: buyerStateCode,
      destination,
      motorVehicleNo,
      termsOfDelivery,
      paymentTerms,
      buyerOrderNo,
      buyerOrderDate,
      items: updatedItems,
      finalGrandTotal: effectiveTotal
    };
  };

  // Manual save handler for toolbar button
  const handleManualSave = () => {
    if (onUpdateSheet) {
      onUpdateSheet(getLatestPayload());
    }
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2500);
  };

  // Real-time debounced auto-sync when user edits any field or rate inside modal
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!onUpdateSheet) return;

    const timer = setTimeout(() => {
      onUpdateSheet(getLatestPayload());
    }, 350);

    return () => clearTimeout(timer);
  }, [
    consigneeName,
    consigneePhone,
    consigneeAddress,
    consigneeGstin,
    consigneeState,
    consigneeStateCode,
    buyerName,
    buyerPhone,
    buyerAddress,
    buyerGstin,
    buyerState,
    buyerStateCode,
    destination,
    motorVehicleNo,
    termsOfDelivery,
    paymentTerms,
    buyerOrderNo,
    buyerOrderDate,
    customRates,
    customHsn,
    customDisc
  ]);

  // Group invoice items by wood type while preserving sequential order
  const woodGroups = useMemo(() => {
    const groups: Array<{ wood: string; items: InvoiceItemRow[] }> = [];
    const map = new Map<string, InvoiceItemRow[]>();

    for (const it of invoiceItems) {
      const itDesc = (it.description || '').toUpperCase();
      const itWood = (it.woodType || '').toUpperCase();
      const isPlywood = it.itemCategory === 'plywood' || itWood.includes('PLYWOOD') || itDesc.includes('PLYWOOD');
      const isReady = it.itemCategory === 'ready_board' || itWood.includes('READY') || itDesc.includes('READY');
      let wood = 'MAHAGONY';
      if (isPlywood) {
        wood = 'PLYWOOD';
      } else if (isReady) {
        wood = 'READY BOARD';
      } else if (it.woodType) {
        wood = it.woodType.trim().toUpperCase();
      } else {
        const parts = it.description.trim().split(/\s+/);
        if (parts.length > 1) {
          wood = parts.slice(1).join(' ').toUpperCase();
        }
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
        const isSheetA = a.rateUnit === 'PCS' || a.per === 'PCS' || a.itemCategory === 'plywood' || a.itemCategory === 'ready_board';
        const isSheetB = b.rateUnit === 'PCS' || b.per === 'PCS' || b.itemCategory === 'plywood' || b.itemCategory === 'ready_board';
        if (isSheetA || isSheetB) {
          const wA = typeof a.widthInches === 'number' ? a.widthInches : 0;
          const wB = typeof b.widthInches === 'number' ? b.widthInches : 0;
          if (wA !== wB) return wA - wB;
          const brandA = a.brand || '';
          const brandB = b.brand || '';
          if (brandA !== brandB) return brandA.localeCompare(brandB);
          const rA = typeof a.rate === 'number' ? a.rate : 0;
          const rB = typeof b.rate === 'number' ? b.rate : 0;
          if (rA !== rB) return rA - rB;
          return (b.pieces || 0) - (a.pieces || 0);
        }

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
    if (onUpdateSheet) {
      onUpdateSheet(getLatestPayload());
    }
    exportSheetToPdf(sheet, businessSettings, {
      logType: sheet.logType,
      roundLogOutputUnit: sheet.roundLogOutputUnit,
      roundLogInputUnit: sheet.roundLogInputUnit,
      roundLogItems: sheet.roundLogItems,
      roundLogSlabRates: sheet.roundLogSlabRates,
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
      consigneePhone,
      consigneeAddress,
      consigneeGstin,
      consigneeState,
      consigneeStateCode,
      buyerName,
      buyerPhone,
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
    if (onUpdateSheet) {
      onUpdateSheet(getLatestPayload());
    }
    printProformaInvoicePdf(sheet, businessSettings, {
      logType: sheet.logType,
      roundLogOutputUnit: sheet.roundLogOutputUnit,
      roundLogInputUnit: sheet.roundLogInputUnit,
      roundLogItems: sheet.roundLogItems,
      roundLogSlabRates: sheet.roundLogSlabRates,
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
      consigneePhone,
      consigneeAddress,
      consigneeGstin,
      consigneeState,
      consigneeStateCode,
      buyerName,
      buyerPhone,
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
            className="btn btn-sm"
            onClick={handleManualSave}
            title="Save changes to sheet and database"
            style={{
              backgroundColor: isSavedNotice ? '#15803d' : '#16a34a',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.82rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.28rem 0.65rem',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
            }}
          >
            {isSavedNotice ? <Check size={14} /> : <Save size={14} />}
            <span>{isSavedNotice ? 'Saved!' : 'Save'}</span>
          </button>

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
            <span>PROFORMA INVOICE</span>
            <div className="p-header-voucher-badge">
              {sheet?.voucherType === 'purchase' ? 'PURCHASE' : 'SALES'}
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
                  <span className="p-party-meta-label">Contact No.</span>
                  <span className="p-party-meta-separator">: </span>
                  <input
                    type="text"
                    className="p-input p-party-meta-input no-print"
                    placeholder="Contact / Phone"
                    value={consigneePhone}
                    onChange={(e) => setConsigneePhone(e.target.value)}
                  />
                  <span className="print-only" style={{ fontWeight: 700 }}>{consigneePhone}</span>
                </div>
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
                  <span className="p-party-meta-label">Contact No.</span>
                  <span className="p-party-meta-separator">: </span>
                  <input
                    type="text"
                    className="p-input p-party-meta-input no-print"
                    placeholder="Contact / Phone"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                  />
                  <span className="print-only" style={{ fontWeight: 700 }}>{buyerPhone}</span>
                </div>
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
            {isRoundLog ? (
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

                  {/* 6. TOTAL WOOD AMOUNT row */}
                  {effectiveTotalPieces > 0 && (
                    <tr className="p-total-wood-row" style={{ backgroundColor: '#e2e8f0', borderTop: '1px solid #111', borderBottom: '1px solid #111', fontWeight: 900 }}>
                      <td colSpan={2} className="p-item-desc" style={{ paddingLeft: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        TOTAL WOOD AMOUNT
                      </td>
                      <td className="text-center font-bold p-mono">
                        {effectiveTotalPieces} LOGS CLASSIFIED
                      </td>
                      <td className="text-right p-mono font-bold">
                        {renderWithSmallDecimalHtml(`${formatValue(roundLogOutputUnit === 'CFT' ? effectiveTotalCft : effectiveTotalCbm, 4)} ${roundLogOutputUnit}`)}
                      </td>
                      <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                        {renderWithSmallDecimalHtml(formatIndianCurrency(effectiveWoodTotalAmount), 'Rs. ')}
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
                              {(ac?.otherLabel || 'OTHER CHARGES').toUpperCase()}
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
                              GST {sheet?.gstPercent ? `(${sheet.gstPercent}%)` : ''}
                            </td>
                            <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                              {renderWithSmallDecimalHtml(formatIndianCurrency(gstAmount))}
                            </td>
                          </tr>
                        )}

                        {discAmount > 0 && (
                          <>
                            <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`} style={{ fontWeight: 800 }}>
                              <td></td>
                              <td colSpan={3} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                                TOTAL PRICE BEFORE DISCOUNT
                              </td>
                              <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                                {renderWithSmallDecimalHtml(formatIndianCurrency(subtotalWithCharges + gstAmount))}
                              </td>
                            </tr>
                            <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                              <td></td>
                              <td colSpan={3} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase', color: '#166534' }}>
                                LESS: DISCOUNT {sheet?.discount?.type === 'percentage' && sheet.discount.value ? `(${sheet.discount.value}%)` : (sheet?.discount?.type === 'rupees' && sheet.discount.value ? `(SPECIAL DISCOUNT)` : '')}
                              </td>
                              <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#166534' }}>
                                - {renderWithSmallDecimalHtml(formatIndianCurrency(discAmount))}
                              </td>
                            </tr>
                          </>
                        )}
                      </>
                    );
                  })()}

                  {roundLogItems.length < 8 && (
                    <tr style={{ height: `${Math.max(20, (8 - roundLogItems.length) * 20)}px` }}>
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
                      {effectiveTotalPieces} LOGS
                    </td>
                    <td className="text-right p-mono font-bold">
                      {renderWithSmallDecimalHtml(`${formatValue(roundLogOutputUnit === 'CFT' ? effectiveTotalCft : effectiveTotalCbm, 4)} ${roundLogOutputUnit}`)}
                    </td>
                    <td className="text-right p-mono font-bold p-final-total-highlight" style={{ paddingRight: '8px' }}>
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
                  const groupCft = group.items.reduce((acc, it) => {
                    const isSheet = it.rateUnit === 'PCS' || it.per === 'PCS' || it.itemCategory === 'plywood' || it.itemCategory === 'ready_board';
                    return isSheet ? acc : acc + (typeof it.cft === 'number' ? it.cft : 0);
                  }, 0);
                  const groupAmount = group.items.reduce((acc, it) => acc + (typeof it.amount === 'number' ? it.amount : 0), 0);
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
                        const isSheet = group.wood.includes('PLYWOOD') || group.wood.includes('READY') || item.rateUnit === 'PCS' || item.per === 'PCS' || item.itemCategory === 'plywood' || item.itemCategory === 'ready_board' || (item.woodType && (item.woodType.toUpperCase() === 'PLYWOOD' || item.woodType.toUpperCase() === 'READY BOARD'));
                        const dimOnly = isSheet ? getCutLogItemDescription({ ...item, woodType: group.wood || item.woodType } as any) : (item.description.split(/\s+/)[0] || item.description);
                        const isSqftBilled = !isSheet && item.rateUnit !== 'CFT' && (item.widthInches || 0) >= 7;
                        const slStr = String(item.slNo);
                        const perUnit = isSheet ? 'PCS' : item.per;
                        return (
                          <tr key={item.slNo} className={`p-item-row ${itemIdx % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                            <td className="text-center">{slStr}</td>
                            <td className="p-item-desc" style={{ paddingLeft: '8px', fontWeight: 700 }}>
                              {renderDimensionHtml(dimOnly)}
                            </td>
                            <td className="text-right p-mono">{item.pieces} PCS</td>
                            <td className="text-right p-mono">{renderWithSmallDecimalHtml(!isSheet && item.cft > 0 ? `${item.cft.toFixed(4)} CFT` : '')}</td>
                            <td className="text-right p-mono">{renderWithSmallDecimalHtml(!isSheet && isSqftBilled ? `${(item.sqft || item.cft * 12).toFixed(2)} SQFT` : '')}</td>
                            <td className="text-right p-mono">
                              <input
                                type="number"
                                className="p-input text-right p-mono"
                                value={item.rate}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  const origIdx = item.sourceIndex !== undefined ? item.sourceIndex : (item.slNo - 1);
                                  setCustomRates((prev) => {
                                    const next = { ...prev };
                                    if (item.id) next[item.id] = val;
                                    if (item.sourceIndex !== undefined) next[item.sourceIndex] = val;
                                    next[origIdx] = val;
                                    return next;
                                  });
                                }}
                              />
                            </td>
                            <td className="text-center" style={{ whiteSpace: 'nowrap' }}>{perUnit}</td>
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
                          {renderWithSmallDecimalHtml(groupCft > 0 ? `${groupCft.toFixed(4)} CFT` : '')}
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
                      {renderWithSmallDecimalHtml(totalCft > 0 ? `${totalCft.toFixed(4)} CFT` : '')}
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
                            GST {sheet?.gstPercent ? `(${sheet.gstPercent}%)` : ''}
                          </td>
                          <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                            {renderWithSmallDecimalHtml(formatIndianCurrency(gstAmount))}
                          </td>
                        </tr>
                      )}

                      {/* 6. Next: Discount */}
                      {discAmount > 0 && (
                        <>
                          <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`} style={{ fontWeight: 800 }}>
                            <td className="text-center"></td>
                            <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase' }}>
                              TOTAL PRICE BEFORE DISCOUNT
                            </td>
                            <td className="text-right p-mono font-bold" style={{ paddingRight: '8px' }}>
                              {renderWithSmallDecimalHtml(formatIndianCurrency(subtotalWithCharges + gstAmount))}
                            </td>
                          </tr>
                          <tr className={`p-item-row ${chargeIdx++ % 2 === 0 ? 'zebra-even' : 'zebra-odd'}`}>
                            <td className="text-center"></td>
                            <td colSpan={6} className="text-right font-bold" style={{ paddingRight: '8px', textTransform: 'uppercase', color: '#166534' }}>
                              LESS: DISCOUNT {sheet?.discount?.type === 'percentage' && sheet.discount.value ? `(${sheet.discount.value}%)` : (sheet?.discount?.type === 'rupees' && sheet.discount.value ? `(SPECIAL DISCOUNT)` : '')}
                            </td>
                            <td className="text-right p-mono font-bold" style={{ paddingRight: '8px', color: '#166534' }}>
                              - {renderWithSmallDecimalHtml(formatIndianCurrency(discAmount))}
                            </td>
                          </tr>
                        </>
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
    </div>,
    document.body
  );
};
