import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Save,
  FileDown,
  Printer,
  Trash2,
  FilePlus,
  CheckCircle,
  Clock,
  Building,
  User,
  Calendar,
  Hash,
  Share2,
  FileText,
  Phone,
  MapPin,
  ArrowLeft,
  SlidersHorizontal,
  X,
  Edit3,
  Search,
  MessageCircle,
  Truck,
  Scissors,
  Layers,
  Tag,
  Percent,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import type { MeasurementItem, MeasurementSheet, BusinessSettings } from '../types';
import { MeasurementTable } from '../components/MeasurementTable';
import { ConfirmModal } from '../components/ConfirmModal';
import { ProformaInvoiceModal } from '../components/ProformaInvoiceModal';
import { PrintableProformaInvoice } from '../components/PrintableProformaInvoice';
import { calculateTotals, formatValue, sortTimberEntries, groupTimberByWidth } from '../utils/calculator';
import { formatIndianCurrency, numberToIndianCurrencyWords } from '../utils/indianNumberWords';
import { exportSheetToCsv } from '../utils/exportCsv';
import { exportSheetToPdf, getProformaInvoicePdfBlob, type ProformaInvoiceExportData } from '../utils/exportPdf';
import { dbService, generateId, sanitizeAndComputeSheet } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { fetchGstinDetails } from '../services/gstinService';

interface CalculatorPageProps {
  sheetToEdit?: MeasurementSheet | null;
  onSaved?: (sheet: MeasurementSheet) => void;
  businessSettings?: BusinessSettings;
}

export interface SavedCustomer {
  name: string;
  phone?: string;
  address?: string;
  gstin?: string;
  state?: string;
  stateCode?: string;
  projectName?: string;
}

const CUSTOMERS_STORAGE_KEY = 'timberpro_saved_customers';

const INDIAN_GST_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh'
};

function getStoredCustomers(): SavedCustomer[] {
  try {
    const raw = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomerToDirectory(cust: SavedCustomer): void {
  if (!cust.name || cust.name.trim().length < 1) return;
  try {
    const list = getStoredCustomers();
    const cleanName = cust.name.trim();
    const existingIndex = list.findIndex(c => c.name.toLowerCase() === cleanName.toLowerCase());
    const newEntry: SavedCustomer = {
      name: cleanName,
      phone: cust.phone?.trim() || '',
      address: cust.address?.trim() || '',
      gstin: cust.gstin?.trim() || '',
      state: cust.state?.trim() || 'Karnataka',
      stateCode: cust.stateCode?.trim() || '29',
      projectName: cust.projectName?.trim() || ''
    };
    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...newEntry };
    } else {
      list.unshift(newEntry);
    }
    localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save customer to directory', e);
  }
}

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

export const CalculatorPage: React.FC<CalculatorPageProps> = ({
  sheetToEdit,
  onSaved,
  businessSettings
}) => {
  const { user } = useAuth();

  // 6-Step Wizard State (1: Customer Details, 2: Calculator, 3: Additional Charges, 4: GST & Discounts, 5: Timber Order / Sorting, 6: Final Review & Sharing)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // Sheet Metadata State
  const [sheetId, setSheetId] = useState<string>(sheetToEdit?.id || generateId());
  const [sheetName, setSheetName] = useState<string>(sheetToEdit?.sheetName || 'Daily Timber Tally Sheet');

  // Step 1: Customer Details
  const [customerType, setCustomerType] = useState<'b2b' | 'b2c'>(sheetToEdit?.customerType || 'b2c');
  const [customerName, setCustomerName] = useState<string>(sheetToEdit?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState<string>(sheetToEdit?.customerPhone || '');
  const [customerAddress, setCustomerAddress] = useState<string>(sheetToEdit?.customerAddress || '');
  const [customerGstin, setCustomerGstin] = useState<string>(sheetToEdit?.customerGstin || '');
  const [customerState, setCustomerState] = useState<string>(sheetToEdit?.customerState || 'Karnataka');
  const [customerStateCode, setCustomerStateCode] = useState<string>(sheetToEdit?.customerStateCode || '29');
  const [projectName, setProjectName] = useState<string>(sheetToEdit?.projectName || '');
  const [referenceNumber, setReferenceNumber] = useState<string>(
    sheetToEdit?.referenceNumber || `REF-${Math.floor(100000 + Math.random() * 900000)}`
  );
  const [measurementDate, setMeasurementDate] = useState<string>(
    sheetToEdit?.measurementDate || new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState<string>(sheetToEdit?.notes || '');
  const [isGstSearching, setIsGstSearching] = useState(false);
  const [gstSearchNotice, setGstSearchNotice] = useState<string | null>(null);

  // Step 2: Timber Items & Rate
  const [items, setItems] = useState<MeasurementItem[]>(
    sheetToEdit?.items && sheetToEdit.items.length > 0 ? sheetToEdit.items : []
  );
  const [ratePerCft] = useState<number>(businessSettings?.ratePerCft || 1200);

  // Step 3: Additional Charges State
  const [carpentryCharges, setCarpentryCharges] = useState<number>(
    (sheetToEdit?.additionalCharges?.carpentry || 0) + (sheetToEdit?.additionalCharges?.sawing || 0)
  );
  const [transportationCharges, setTransportationCharges] = useState<number>(sheetToEdit?.additionalCharges?.transportation || 0);
  const [planingCharges, setPlaningCharges] = useState<number>(sheetToEdit?.additionalCharges?.planing || 0);
  const [planingRatePerCft, setPlaningRatePerCft] = useState<number>(sheetToEdit?.additionalCharges?.planingRatePerCft || 0);
  const [sawingCharges, setSawingCharges] = useState<number>(0);
  const [otherCharges, setOtherCharges] = useState<number>(sheetToEdit?.additionalCharges?.other || 0);
  const [otherChargesLabel, setOtherChargesLabel] = useState<string>(sheetToEdit?.additionalCharges?.otherLabel || 'Other Charges');

  // Step 4: Discount & GST State (with Custom Taxable Base & Custom GST Rate)
  const [discountType, setDiscountType] = useState<'rupees' | 'percentage'>(sheetToEdit?.discount?.type || 'rupees');
  const [discountValue, setDiscountValue] = useState<number>(sheetToEdit?.discount?.value || 0);

  const [customGstTaxableAmount, setCustomGstTaxableAmount] = useState<number>(
    sheetToEdit?.customGstTaxableAmount || 0
  );

  const [gstPercent, setGstPercent] = useState<number>(sheetToEdit?.gstPercent !== undefined ? sheetToEdit.gstPercent : 18);
  const [isCustomGstRate, setIsCustomGstRate] = useState<boolean>(
    sheetToEdit?.gstPercent !== undefined && ![0, 5, 12, 18, 28].includes(sheetToEdit.gstPercent)
  );

  // Invoice & Dispatch editable fields for Final Invoice
  const [invoiceNo, setInvoiceNo] = useState<string>(
    sheetToEdit?.referenceNumber ? sheetToEdit.referenceNumber.replace('REF-', '') : `${Math.floor(100000 + Math.random() * 900000)}`
  );
  const [eWayBillNo, setEWayBillNo] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(
    formatToInvoiceDate(sheetToEdit?.measurementDate || new Date().toISOString().split('T')[0])
  );
  const [paymentTerms, setPaymentTerms] = useState<string>('IMMEDIATE PAYMENT');
  const [buyerOrderNo, setBuyerOrderNo] = useState<string>('');
  const [buyerOrderDate, setBuyerOrderDate] = useState<string>('');
  const [destination, setDestination] = useState<string>('BANGLORE');
  const [motorVehicleNo, setMotorVehicleNo] = useState<string>('');
  const [termsOfDelivery, setTermsOfDelivery] = useState<string>('TRANSPORTATION EXTRA\nAPPLICABLE GST EXTRA');

  // Customer Autocomplete Suggestions State
  const [customerSuggestions, setCustomerSuggestions] = useState<SavedCustomer[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState<boolean>(false);

  // Status & Feedback State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isProformaModalOpen, setIsProformaModalOpen] = useState(false);
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false);
  const isInitialMount = useRef(true);
  // Track the ID of the sheet that has been loaded into state to avoid overwriting active user inputs
  const loadedSheetIdRef = useRef<string | null>(sheetToEdit?.id || null);

  // Persistence gating:
  // Existing sheets being edited are already persisted.
  // New sheets are ONLY saved into permanent saved_sheets once the user enters details and moves to the next section (step > 1), or adds items, or clicks manual save.
  const isSheetPersistedRef = useRef<boolean>(!!sheetToEdit);
  const hasProceededPastStep1Ref = useRef<boolean>(!!sheetToEdit);

  // Sync state ONLY when a DIFFERENT sheet is passed to edit (e.g. from Dashboard or History)
  useEffect(() => {
    if (sheetToEdit && sheetToEdit.id !== loadedSheetIdRef.current) {
      loadedSheetIdRef.current = sheetToEdit.id;
      isSheetPersistedRef.current = true;
      hasProceededPastStep1Ref.current = true;
      setSheetId(sheetToEdit.id);
      setSheetName(sheetToEdit.sheetName);
      setCustomerType(sheetToEdit.customerType || 'b2c');
      setCustomerName(sheetToEdit.customerName || '');
      setCustomerPhone(sheetToEdit.customerPhone || '');
      setCustomerAddress(sheetToEdit.customerAddress || '');
      setCustomerGstin(sheetToEdit.customerGstin || '');
      setCustomerState(sheetToEdit.customerState || 'Karnataka');
      setCustomerStateCode(sheetToEdit.customerStateCode || '29');
      setProjectName(sheetToEdit.projectName || '');
      setReferenceNumber(sheetToEdit.referenceNumber || `REF-${Math.floor(100000 + Math.random() * 900000)}`);
      setMeasurementDate(sheetToEdit.measurementDate || new Date().toISOString().split('T')[0]);
      setNotes(sheetToEdit.notes || '');
      setItems(sheetToEdit.items || []);
      setCarpentryCharges((sheetToEdit.additionalCharges?.carpentry || 0) + (sheetToEdit.additionalCharges?.sawing || 0));
      setTransportationCharges(sheetToEdit.additionalCharges?.transportation || 0);
      setPlaningCharges(sheetToEdit.additionalCharges?.planing || 0);
      setPlaningRatePerCft(sheetToEdit.additionalCharges?.planingRatePerCft || 0);
      setSawingCharges(0);
      setOtherCharges(sheetToEdit.additionalCharges?.other || 0);
      setOtherChargesLabel(sheetToEdit.additionalCharges?.otherLabel || 'Other Charges');
      setDiscountType(sheetToEdit.discount?.type || 'rupees');
      setDiscountValue(sheetToEdit.discount?.value || 0);
      setCustomGstTaxableAmount(sheetToEdit.customGstTaxableAmount || 0);
      const isCustomRate = sheetToEdit.gstPercent !== undefined && ![0, 5, 12, 18, 28].includes(sheetToEdit.gstPercent);
      setIsCustomGstRate(isCustomRate);
      setGstPercent(sheetToEdit.gstPercent !== undefined ? sheetToEdit.gstPercent : 18);
      setInvoiceNo(sheetToEdit.referenceNumber ? sheetToEdit.referenceNumber.replace('REF-', '') : '8');
      setInvoiceDate(formatToInvoiceDate(sheetToEdit.measurementDate));
      setSaveStatus('saved');
    }
  }, [sheetToEdit]);

  // Retrieve all known customers across past sheets & customer directory
  const getAllKnownCustomers = (): SavedCustomer[] => {
    const map = new Map<string, SavedCustomer>();
    try {
      const data = localStorage.getItem('timberpro_local_sheets');
      if (data) {
        const past: MeasurementSheet[] = JSON.parse(data);
        for (const s of past) {
          if (s.customerName && s.customerName.trim()) {
            const key = s.customerName.trim().toLowerCase();
            map.set(key, {
              name: s.customerName.trim(),
              phone: s.customerPhone || '',
              address: s.customerAddress || '',
              gstin: s.customerGstin || '',
              state: s.customerState || 'Karnataka',
              stateCode: s.customerStateCode || '29',
              projectName: s.projectName || ''
            });
          }
        }
      }
    } catch { }
    try {
      const saved = getStoredCustomers();
      for (const c of saved) {
        if (c.name && c.name.trim()) {
          map.set(c.name.trim().toLowerCase(), c);
        }
      }
    } catch { }
    return Array.from(map.values());
  };

  const handleCustomerNameInputChange = (val: string) => {
    setCustomerName(val);
    if (val.trim().length >= 1) {
      const all = getAllKnownCustomers();
      const q = val.trim().toLowerCase();
      const matches = all.filter(c => c.name.toLowerCase().includes(q));
      setCustomerSuggestions(matches);
      setShowCustomerSuggestions(matches.length > 0);
    } else {
      setShowCustomerSuggestions(false);
    }
  };

  const handleSelectCustomer = (c: SavedCustomer) => {
    setCustomerName(c.name);
    if (c.phone) setCustomerPhone(c.phone);
    if (c.address) setCustomerAddress(c.address);
    if (c.gstin) {
      setCustomerGstin(c.gstin);
      if (c.gstin.length >= 2) {
        const code = c.gstin.slice(0, 2);
        if (INDIAN_GST_STATES[code]) {
          setCustomerState(INDIAN_GST_STATES[code]);
          setCustomerStateCode(code);
        }
      }
    }
    if (c.state) setCustomerState(c.state);
    if (c.stateCode) setCustomerStateCode(c.stateCode);
    if (c.projectName) setProjectName(c.projectName);
    setShowCustomerSuggestions(false);
  };

  const persistCurrentCustomer = () => {
    if (customerName.trim().length >= 1) {
      saveCustomerToDirectory({
        name: customerName,
        phone: customerPhone,
        address: customerAddress,
        gstin: customerGstin,
        state: customerState,
        stateCode: customerStateCode,
        projectName
      });
    }
  };

  // B2B GST Search & Auto-Fill from https://www.gstinapi.in
  const handleSearchGst = async (overrideGstin?: string) => {
    const raw = overrideGstin !== undefined ? overrideGstin : customerGstin;
    const clean = raw.trim().toUpperCase();
    if (!clean || clean.length < 2) {
      setGstSearchNotice('Please enter a valid 15-character GSTIN (e.g. 29APYPK6256P1ZL).');
      return;
    }

    const code = clean.slice(0, 2);
    const matchedState = INDIAN_GST_STATES[code] || customerState || 'Karnataka';
    setCustomerState(matchedState);
    setCustomerStateCode(code);

    if (clean.length !== 15) {
      setGstSearchNotice(`State identified: ${matchedState} (${code}). Please enter the full 15-digit GSTIN to fetch details.`);
      return;
    }

    setIsGstSearching(true);
    setGstSearchNotice(null);

    try {
      const res = await fetchGstinDetails(clean);

      if (res.success && res.data) {
        const d = res.data;
        const companyName = (d.trade_name && d.trade_name.trim().length > 0)
          ? d.trade_name.trim()
          : (d.legal_name || '').trim();

        if (companyName) {
          setCustomerName(companyName);
        }

        // Format address from data
        let formattedAddress = '';
        if (d.address && d.address.trim()) {
          formattedAddress = d.address.trim();
        } else if (d.address_details) {
          const parts = [
            d.address_details.building_number,
            d.address_details.building_name,
            d.address_details.street,
            d.address_details.locality,
            d.address_details.city || d.city,
            d.address_details.state,
            d.address_details.pincode || d.pincode
          ].filter(Boolean);
          formattedAddress = parts.join(', ');
        }

        if (formattedAddress) {
          setCustomerAddress(formattedAddress);
        }

        if (d.state_code) {
          const stateFromApi = INDIAN_GST_STATES[d.state_code] || d.address_details?.state || matchedState;
          setCustomerState(stateFromApi);
          setCustomerStateCode(d.state_code);
        }

        const statusTag = d.status ? ` • Status: ${d.status}` : '';
        const typeTag = d.taxpayer_type ? ` (${d.taxpayer_type})` : '';
        setGstSearchNotice(`✓ Verified: ${companyName}${statusTag}${typeTag}`);

        // Persist to local customer directory
        if (companyName) {
          saveCustomerToDirectory({
            name: companyName,
            phone: customerPhone,
            address: formattedAddress || customerAddress,
            gstin: clean,
            state: customerState,
            stateCode: code
          });
        }
      } else {
        // Fallback to local saved customers check if offline or not in API
        const all = getAllKnownCustomers();
        const found = all.find(c => c.gstin && c.gstin.trim().toUpperCase() === clean);
        if (found) {
          if (found.name) setCustomerName(found.name);
          if (found.phone) setCustomerPhone(found.phone);
          if (found.address) setCustomerAddress(found.address);
          setGstSearchNotice(`✓ Auto-Filled from Saved Directory: ${found.name} (${matchedState}, State Code ${code})`);
        } else {
          setGstSearchNotice(`⚠️ ${res.error || 'GSTIN details not found'}. State verified: ${matchedState} (${code}). You can enter details manually.`);
        }
      }
    } catch (_err) {
      setGstSearchNotice(`⚠️ Could not reach GST verification service. State verified: ${matchedState} (${code}).`);
    } finally {
      setIsGstSearching(false);
    }
  };

  // Real-time unrounded totals calculation
  const totals = calculateTotals(items, businessSettings?.sqftFormulaType, ratePerCft);

  // Auto-sync Planing Charges when rate per CFT or total CFT changes
  useEffect(() => {
    if (planingRatePerCft > 0 && totals.totalCft > 0) {
      setPlaningCharges(Math.round(totals.totalCft * planingRatePerCft * 100) / 100);
    }
  }, [totals.totalCft, planingRatePerCft]);

  // Financial calculations with additional charges, discounts, and GST
  // Ensures timberSubtotal is never zero when timber items exist (supports both CFT and SQFT rates)
  const timberSubtotal = useMemo(() => {
    let sum = 0;
    for (const it of items) {
      const l = typeof it.lengthFeet === 'number' ? it.lengthFeet : 0;
      const w = typeof it.widthInches === 'number' ? it.widthInches : 0;
      const t = typeof it.thicknessInches === 'number' ? it.thicknessInches : 0;
      const p = typeof it.pieces === 'number' ? it.pieces : 0;
      if (l > 0 && w > 0 && t > 0 && p > 0) {
        const rowCft = it.cft > 0 ? it.cft : (l * w * t * p) / 2304;
        const rowSqft = it.sqft > 0 ? it.sqft : (rowCft * 12);
        const isSqft = w >= 7 && it.rateUnit === 'SQFT';
        const defaultRowRate = isSqft ? 120 : ratePerCft;
        const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
        const mult = isSqft ? rowSqft : rowCft;
        const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(mult * r * 100) / 100;
        sum += amt;
      }
    }
    return sum > 0 ? sum : (totals.totalAmount || 0);
  }, [items, ratePerCft, totals.totalAmount]);

  const sqftBilledItems = useMemo(() => {
    return items.filter((it) => (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit === 'SQFT');
  }, [items]);

  const additionalChargesTotal = (carpentryCharges || 0) + (transportationCharges || 0) + (planingCharges || 0) + (sawingCharges || 0) + (otherCharges || 0);
  const subtotalWithCharges = timberSubtotal + additionalChargesTotal;

  const discountAmount = useMemo(() => {
    if (!discountValue || discountValue <= 0) return 0;
    if (discountType === 'percentage') {
      return Math.round((subtotalWithCharges * (discountValue / 100)) * 100) / 100;
    }
    return Math.min(discountValue, subtotalWithCharges);
  }, [discountType, discountValue, subtotalWithCharges]);

  // Total bill amount before GST (e.g. ₹ 10,000)
  const fullAmountBeforeGst = Math.max(0, subtotalWithCharges - discountAmount);

  // The specific amount on which GST is applied:
  // User enters custom amount directly (e.g. ₹ 5,000)
  const gstTaxableBase = (customGstTaxableAmount > 0)
    ? customGstTaxableAmount
    : fullAmountBeforeGst;

  // GST Amount is calculated strictly on the gstTaxableBase
  const gstAmount = Math.round((gstTaxableBase * ((gstPercent || 0) / 100)) * 100) / 100;

  // Grand Total = Full Total Amount (₹ 10,000) + GST Amount (e.g. ₹ 800 or ₹ 900) = ₹ 10,800 or ₹ 10,900
  const finalGrandTotal = fullAmountBeforeGst + gstAmount;
  const taxableAmount = gstTaxableBase;

  // Sorted timber entries according to strict sawmill specifications:
  // Width (IN) - Ascending, Length (FT) - Descending within each width group, Grouping by width
  const sortedItems = useMemo(() => sortTimberEntries(items), [items]);
  const timberWidthGroups = useMemo(() => groupTimberByWidth(items), [items]);

  // Construct current full sheet object
  const getCurrentSheetObject = (): MeasurementSheet => {
    const raw: Partial<MeasurementSheet> = {
      id: sheetId,
      sheetName,
      customerType,
      customerName,
      customerPhone,
      customerAddress,
      customerGstin,
      customerState,
      customerStateCode,
      projectName,
      referenceNumber,
      measurementDate,
      notes,
      items,
      additionalCharges: {
        carpentry: carpentryCharges,
        transportation: transportationCharges,
        planing: planingCharges,
        planingRatePerCft,
        sawing: sawingCharges,
        other: otherCharges,
        otherLabel: otherChargesLabel
      },
      discount: {
        type: discountType,
        value: discountValue,
        amount: discountAmount
      },
      customGstTaxableAmount: customGstTaxableAmount > 0 ? customGstTaxableAmount : undefined,
      gstPercent,
      finalGrandTotal: (finalGrandTotal && finalGrandTotal > 0) ? finalGrandTotal : fullAmountBeforeGst
    };
    return sanitizeAndComputeSheet(raw, user?.id || 'guest');
  };

  // Activate persistence once user navigates past step 1 or adds timber items
  useEffect(() => {
    if (currentStep > 1) {
      hasProceededPastStep1Ref.current = true;
      isSheetPersistedRef.current = true;
    }
  }, [currentStep]);

  useEffect(() => {
    if (items.length > 0) {
      isSheetPersistedRef.current = true;
    }
  }, [items.length]);

  // Auto-save sheet to database on every change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Only save to permanent saved_sheets database if:
    // 1. It is an existing sheet being edited
    // 2. OR user has moved past Step 1 (to Step 2, 3, 4, 5, 6)
    // 3. OR user has added timber measurement items
    // 4. OR the sheet was previously persisted
    const shouldSaveToDatabase =
      isSheetPersistedRef.current ||
      hasProceededPastStep1Ref.current ||
      currentStep > 1 ||
      items.length > 0;

    const draftSheet: Partial<MeasurementSheet> = {
      id: sheetId,
      sheetName,
      customerType,
      customerName,
      customerPhone,
      customerAddress,
      customerGstin,
      customerState,
      customerStateCode,
      projectName,
      referenceNumber,
      measurementDate,
      notes,
      items,
      additionalCharges: {
        carpentry: carpentryCharges,
        transportation: transportationCharges,
        planing: planingCharges,
        planingRatePerCft,
        sawing: sawingCharges,
        other: otherCharges,
        otherLabel: otherChargesLabel
      },
      discount: {
        type: discountType,
        value: discountValue,
        amount: discountAmount
      },
      customGstTaxableAmount: customGstTaxableAmount > 0 ? customGstTaxableAmount : undefined,
      gstPercent,
      finalGrandTotal: (finalGrandTotal && finalGrandTotal > 0) ? finalGrandTotal : fullAmountBeforeGst
    };

    // Always preserve working session draft
    dbService.saveDraft(draftSheet);

    if (!shouldSaveToDatabase) {
      // Don't auto-save an empty "Direct Customer" sheet while still filling initial details on Step 1!
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('saving');

    const timer = setTimeout(async () => {
      try {
        const sheetObj = sanitizeAndComputeSheet(draftSheet, user?.id || 'guest');
        const res = await dbService.saveSheet(sheetObj, user?.id || 'guest');
        isSheetPersistedRef.current = true;
        if (onSaved) {
          onSaved(res.sheet);
        }
        setSaveStatus('saved');
        setErrorMessage(null);
      } catch (err) {
        console.warn('Auto-save notice:', err);
        setSaveStatus('saved');
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [
    currentStep,
    sheetName,
    customerType,
    customerName,
    customerPhone,
    customerAddress,
    customerGstin,
    customerState,
    customerStateCode,
    projectName,
    referenceNumber,
    measurementDate,
    notes,
    items,
    carpentryCharges,
    transportationCharges,
    planingCharges,
    sawingCharges,
    otherCharges,
    otherChargesLabel,
    discountType,
    discountValue,
    discountAmount,
    customGstTaxableAmount,
    gstPercent,
    finalGrandTotal,
    sheetId,
    user?.id
  ]);

  // Unsaved changes browser prompt warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  // Save to database
  const handleSave = async () => {
    isSheetPersistedRef.current = true;
    hasProceededPastStep1Ref.current = true;
    setSaveStatus('saving');
    setErrorMessage(null);
    persistCurrentCustomer();

    const sheetObj = getCurrentSheetObject();
    const result = await dbService.saveSheet(sheetObj, user?.id || 'guest');

    setSaveStatus('saved');
    dbService.clearDraft();
    if (onSaved) {
      onSaved(result.sheet);
    }
    setIsActionsModalOpen(false);
  };

  // Clear all measurement rows
  const handleClearAll = () => {
    setItems([]);
    setIsClearModalOpen(false);
    setIsActionsModalOpen(false);
  };

  // Create new clean sheet
  const handleNewCleanSheet = () => {
    isSheetPersistedRef.current = false;
    hasProceededPastStep1Ref.current = false;
    const newId = generateId();
    loadedSheetIdRef.current = newId;
    setSheetId(newId);
    setSheetName('Daily Timber Tally Sheet');
    setCustomerType('b2c');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerGstin('');
    setCustomerState('Karnataka');
    setCustomerStateCode('29');
    setProjectName('');
    const newRef = `REF-${Math.floor(100000 + Math.random() * 900000)}`;
    setReferenceNumber(newRef);
    setInvoiceNo(newRef.replace('REF-', ''));
    setMeasurementDate(new Date().toISOString().split('T')[0]);
    setInvoiceDate(formatToInvoiceDate());
    setNotes('');
    setItems([]);
    setCarpentryCharges(0);
    setTransportationCharges(0);
    setPlaningCharges(0);
    setSawingCharges(0);
    setOtherCharges(0);
    setDiscountValue(0);
    setCustomGstTaxableAmount(0);
    setIsCustomGstRate(false);
    setGstPercent(18);
    setCurrentStep(1);
    setSaveStatus('saved');
    dbService.clearDraft();
    setIsActionsModalOpen(false);
  };

  // Export handlers
  const handleExportCsv = () => {
    const current = getCurrentSheetObject();
    exportSheetToCsv(current, businessSettings);
    setIsActionsModalOpen(false);
  };

  const handleExportPdf = () => {
    persistCurrentCustomer();
    const current = getCurrentSheetObject();

    // Map items including additional charges as line items if present
    const invoiceItems = current.items
      .filter((it) => typeof it.lengthFeet === 'number' && it.lengthFeet > 0 && typeof it.pieces === 'number' && it.pieces > 0)
      .map((it, idx) => {
        const w = typeof it.widthInches === 'number' ? it.widthInches : 0;
        const isSqftBilled = w >= 7 && it.rateUnit === 'SQFT';
        const defaultRowRate = isSqftBilled ? 120 : ratePerCft;
        const rowRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
        const mult = isSqftBilled ? (typeof it.sqft === 'number' ? it.sqft : 0) : it.cft;
        const rowAmount = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(mult * rowRate * 100) / 100;
        return {
          slNo: idx + 1,
          description: `${it.lengthFeet}X${it.widthInches}X${it.thicknessInches} ${(it.woodType || 'MAHAGONY').toUpperCase()}`,
          hsn: '4407',
          cft: it.cft,
          sqft: it.sqft,
          widthInches: it.widthInches,
          rateUnit: isSqftBilled ? ('SQFT' as const) : ('CFT' as const),
          pieces: typeof it.pieces === 'number' ? it.pieces : 0,
          rate: rowRate,
          per: isSqftBilled ? 'SQFT' : 'CFT',
          discPercent: '',
          amount: rowAmount
        };
      });

    exportSheetToPdf(current, businessSettings, {
      invoiceNo,
      eWayBillNo,
      invoiceDate,
      paymentTerms,
      buyerOrderNo,
      buyerOrderDate,
      destination,
      motorVehicleNo,
      termsOfDelivery,
      consigneeName: customerName || 'New India Saw Mill',
      consigneeAddress: customerAddress || 'Local Mill Pickup',
      consigneeGstin: customerGstin || '29CJZPK3158H1ZG',
      consigneeState: customerState || 'Karnataka',
      consigneeStateCode: customerStateCode || '29',
      buyerName: customerName || 'New India Saw Mill',
      buyerAddress: customerAddress || 'Local Mill Pickup',
      buyerGstin: customerGstin || '29CJZPK3158H1ZG',
      buyerState: customerState || 'Karnataka',
      buyerStateCode: customerStateCode || '29',
      additionalCharges: {
        carpentry: carpentryCharges,
        transportation: transportationCharges,
        planing: planingCharges,
        planingRatePerCft,
        sawing: sawingCharges,
        other: otherCharges,
        otherLabel: otherChargesLabel
      },
      discountAmount,
      discountDesc: discountType === 'percentage' ? `DISCOUNT (${discountValue}%)` : 'SPECIAL DISCOUNT',
      gstPercent,
      gstTaxableBase: (customGstTaxableAmount > 0 && customGstTaxableAmount !== fullAmountBeforeGst) ? gstTaxableBase : undefined,
      finalGrandTotal,
      gstAmount,
      items: invoiceItems
    });
    setIsActionsModalOpen(false);
  };

  const handlePrint = () => {
    persistCurrentCustomer();
    setIsActionsModalOpen(false);
    window.print();
  };

  // Share Invoice PDF directly to WhatsApp (as a real PDF document, not chat text)
  const handleShareWhatsApp = async () => {
    persistCurrentCustomer();
    const cleanPhone = customerPhone.replace(/\D/g, '');
    const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : (cleanPhone.length > 10 ? cleanPhone : '');

    const current = getCurrentSheetObject();
    const invoiceItems = current.items
      .filter((it) => typeof it.lengthFeet === 'number' && it.lengthFeet > 0 && typeof it.pieces === 'number' && it.pieces > 0)
      .map((it, idx) => {
        const w = typeof it.widthInches === 'number' ? it.widthInches : 0;
        const isSqftBilled = w >= 7 && it.rateUnit === 'SQFT';
        const defaultRowRate = isSqftBilled ? 120 : ratePerCft;
        const rowRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
        const mult = isSqftBilled ? (typeof it.sqft === 'number' ? it.sqft : 0) : it.cft;
        const rowAmount = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(mult * rowRate * 100) / 100;
        return {
          slNo: idx + 1,
          description: `${it.lengthFeet}X${it.widthInches}X${it.thicknessInches} ${(it.woodType || 'MAHAGONY').toUpperCase()}`,
          hsn: '4407',
          cft: it.cft,
          sqft: it.sqft,
          widthInches: it.widthInches,
          rateUnit: isSqftBilled ? ('SQFT' as const) : ('CFT' as const),
          pieces: typeof it.pieces === 'number' ? it.pieces : 0,
          rate: rowRate,
          per: isSqftBilled ? 'SQFT' : 'CFT',
          discPercent: '',
          amount: rowAmount
        };
      });

    const exportData: ProformaInvoiceExportData = {
      invoiceNo,
      eWayBillNo,
      invoiceDate,
      paymentTerms,
      buyerOrderNo,
      buyerOrderDate,
      destination,
      motorVehicleNo,
      termsOfDelivery,
      consigneeName: customerName || 'New India Saw Mill',
      consigneeAddress: customerAddress || 'Local Mill Pickup',
      consigneeGstin: customerGstin || '29CJZPK3158H1ZG',
      consigneeState: customerState || 'Karnataka',
      consigneeStateCode: customerStateCode || '29',
      buyerName: customerName || 'New India Saw Mill',
      buyerAddress: customerAddress || 'Local Mill Pickup',
      buyerGstin: customerGstin || '29CJZPK3158H1ZG',
      buyerState: customerState || 'Karnataka',
      buyerStateCode: customerStateCode || '29',
      additionalCharges: {
        carpentry: carpentryCharges,
        transportation: transportationCharges,
        planing: planingCharges,
        planingRatePerCft,
        sawing: sawingCharges,
        other: otherCharges,
        otherLabel: otherChargesLabel
      },
      discountAmount,
      discountDesc: discountType === 'percentage' ? `DISCOUNT (${discountValue}%)` : 'SPECIAL DISCOUNT',
      gstPercent,
      gstTaxableBase: (customGstTaxableAmount > 0 && customGstTaxableAmount !== fullAmountBeforeGst) ? gstTaxableBase : undefined,
      finalGrandTotal,
      gstAmount,
      items: invoiceItems
    };

    // 1. Generate the official Proforma Invoice PDF Blob & File
    const { blob, filename } = getProformaInvoicePdfBlob(current, businessSettings, exportData);
    const pdfFile = new File([blob], filename, { type: 'application/pdf' });

    // 2. Mobile Native Web Share API with actual PDF File
    // On Android/iOS, this attaches the real PDF file into WhatsApp!
    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: `Invoice #${invoiceNo}`,
          text: `Proforma Invoice #${invoiceNo} for ${customerName || 'Customer'}`
        });
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Native file share error, proceeding to direct download:', err);
        } else {
          return;
        }
      }
    }

    // 3. Fallback for Desktop:
    // Download the actual PDF file so user has it immediately
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 8000);

    // Direct WhatsApp chat to that number with a clean invoice notice (not long chat text)
    const shortMsg = `📄 *PROFORMA INVOICE #${invoiceNo}*\n` +
      `Customer: *${customerName || 'Customer'}*\n` +
      `Amount: *₹${formatIndianCurrency(finalGrandTotal)}*\n` +
      `UPI ID: *hindustansawmill@icici*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📎 Official PDF Invoice (*${filename}*) has been generated and downloaded. Please attach and send.`;

    const waUrl = targetPhone
      ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(shortMsg)}`
      : `https://wa.me/?text=${encodeURIComponent(shortMsg)}`;
    window.open(waUrl, '_blank');
  };

  return (
    <>
      {/* On-Screen Calculator Workspace (Hidden during print) */}
      <div className="calc-main-container no-print">

        {/* 1. Header Toolbar (Sheet Title, Status, and Actions Button) */}
        <div className="calc-top-toolbar">
          {/* Left: Sheet Title & Status */}
          <div className="calc-toolbar-title-wrap">
            <input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              className="calc-sheet-title-input"
              onFocus={(e) => (e.target.style.borderColor = 'var(--primary-500)')}
              onBlur={(e) => (e.target.style.borderColor = 'transparent')}
              title="Click to rename sheet"
            />

            {/* Auto-Save Status Badge */}
            <div className="calc-toolbar-status">
              {saveStatus === 'saved' && (
                <span className="badge badge-connected" title="All changes automatically saved">
                  <CheckCircle size={11} /> Auto-Saved
                </span>
              )}
              {saveStatus === 'saving' && (
                <span className="badge badge-demo" title="Saving changes automatically...">
                  <Clock size={11} /> Auto-Saving...
                </span>
              )}
              {saveStatus === 'unsaved' && (
                <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#b45309' }}>
                  <Clock size={11} /> Saving...
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="badge badge-connected">
                  <CheckCircle size={11} /> Saved Locally
                </span>
              )}
            </div>
          </div>

          {/* Right: Actions Menu Button (Desktop only; on mobile replaced by bottom-right round button) */}
          <div className="calc-desktop-actions-btn-wrap">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setIsActionsModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 700,
                padding: '0.4rem 0.75rem',
                fontSize: '0.82rem'
              }}
              title="Sheet Actions Menu: Save, Invoice, PDF, Print, CSV"
            >
              <SlidersHorizontal size={14} />
              <span>Actions ▾</span>
            </button>
          </div>
        </div>

        {/* 2. Step-by-Step 6-Phase Wizard Navigation Bar (Optimized for Phones & Large Touch) */}
        <div className="calc-steps-nav">
          <button
            type="button"
            className={`calc-step-tab ${currentStep === 1 ? 'active' : ''}`}
            onClick={() => setCurrentStep(1)}
          >
            <span className="step-num">1</span>
            <span className="step-label">Customer</span>
            {customerName && <span className="step-badge ok">✓</span>}
          </button>

          <span className="step-arrow">&rarr;</span>

          <button
            type="button"
            className={`calc-step-tab ${currentStep === 2 ? 'active' : ''}`}
            onClick={() => setCurrentStep(2)}
          >
            <span className="step-num">2</span>
            <span className="step-label">Calculator</span>
            {items.length > 0 && <span className="step-badge">{items.length}</span>}
          </button>

          <span className="step-arrow">&rarr;</span>

          <button
            type="button"
            className={`calc-step-tab ${currentStep === 3 ? 'active' : ''}`}
            onClick={() => setCurrentStep(3)}
          >
            <span className="step-num">3</span>
            <span className="step-label">Charges</span>
            {additionalChargesTotal > 0 && <span className="step-badge">₹{additionalChargesTotal}</span>}
          </button>

          <span className="step-arrow">&rarr;</span>

          <button
            type="button"
            className={`calc-step-tab ${currentStep === 4 ? 'active' : ''}`}
            onClick={() => setCurrentStep(4)}
          >
            <span className="step-num">4</span>
            <span className="step-label">GST &amp; Disc</span>
            {gstPercent > 0 && <span className="step-badge">{gstPercent}%</span>}
          </button>

          <span className="step-arrow">&rarr;</span>

          <button
            type="button"
            className={`calc-step-tab ${currentStep === 5 ? 'active' : ''}`}
            onClick={() => setCurrentStep(5)}
          >
            <span className="step-num">5</span>
            <span className="step-label">Order</span>
          </button>

          <span className="step-arrow">&rarr;</span>

          <button
            type="button"
            className={`calc-step-tab ${currentStep === 6 ? 'active' : ''}`}
            onClick={() => setCurrentStep(6)}
          >
            <span className="step-num">6</span>
            <span className="step-label">Invoice</span>
          </button>

          {/* Compact Auto-Save status badge inside navigation for mobile */}
          <div className="calc-steps-save-status">
            {saveStatus === 'saved' && (
              <span className="badge badge-connected" title="All changes saved">
                <CheckCircle size={10} /> Saved
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="badge badge-demo" title="Saving changes...">
                <Clock size={10} /> Saving
              </span>
            )}
          </div>
        </div>

        {/* Feedback alert */}
        {errorMessage && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--danger-400)',
              fontSize: '0.85rem'
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* =========================================================================
            STEP 1: CUSTOMER DETAILS (B2B vs B2C Selection & GST Search)
            ========================================================================= */}
        {currentStep === 1 && (
          <div className="card calc-step-card">
            <div className="calc-step-header">
              <h3 className="calc-step-title">
                <User size={15} color="var(--primary-600)" /> Customer Details
              </h3>
              <p className="calc-step-desc">
                Select customer type to enter billing contact and GST credentials
              </p>
            </div>

            {/* Sleek Compact Customer Type Pill Toggle */}
            <div className="calc-cust-type-wrap">
              <span className="calc-cust-type-label">Customer Type:</span>
              <div className="calc-cust-type-toggle">
                <button
                  type="button"
                  onClick={() => setCustomerType('b2c')}
                  className={`calc-cust-toggle-btn ${customerType === 'b2c' ? 'active' : ''}`}
                >
                  <User size={13} />
                  <span>Retail / Cash (B2C)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCustomerType('b2b')}
                  className={`calc-cust-toggle-btn ${customerType === 'b2b' ? 'active' : ''}`}
                >
                  <Building size={13} />
                  <span>Business GST (B2B)</span>
                </button>
              </div>
            </div>

            {/* B2B GSTIN Search Box */}
            {customerType === 'b2b' && (
              <div className="calc-gst-search-box">
                <div className="calc-gst-search-header">
                  <label className="calc-gst-search-label">
                    <ShieldCheck size={15} color="var(--primary-600)" /> 15-Digit GST Number:
                  </label>
                  <span className="calc-gst-live-badge">
                    Live GSTIN API Powered
                  </span>
                </div>
                <div className="calc-gst-search-row">
                  <input
                    type="text"
                    value={customerGstin}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setCustomerGstin(val);
                      if (val.length === 15 && val !== customerGstin) {
                        handleSearchGst(val);
                      }
                    }}
                    placeholder="e.g. 29APYPK6256P1ZL"
                    maxLength={15}
                    className="calc-gst-input"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchGst();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary calc-gst-btn"
                    onClick={() => handleSearchGst()}
                    disabled={isGstSearching || !customerGstin.trim()}
                  >
                    <Search size={15} />
                    <span>{isGstSearching ? 'Fetching...' : 'Fetch Details'}</span>
                  </button>
                </div>

                {gstSearchNotice && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: gstSearchNotice.startsWith('✓') ? '#15803d' : '#b45309' }}>
                    {gstSearchNotice}
                  </div>
                )}
              </div>
            )}

            {/* Customer Inputs Form Grid */}
            <div className="calc-customer-grid">
              {/* Customer / Company Name with Autocomplete */}
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                  <User size={13} color="var(--primary-600)" /> {customerType === 'b2b' ? 'Company / Firm Name:' : 'Customer Name:'}
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => handleCustomerNameInputChange(e.target.value)}
                  onFocus={() => {
                    if (customerName.trim().length >= 1) {
                      const all = getAllKnownCustomers();
                      const q = customerName.trim().toLowerCase();
                      const matches = all.filter(c => c.name.toLowerCase().includes(q));
                      setCustomerSuggestions(matches);
                      setShowCustomerSuggestions(matches.length > 0);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowCustomerSuggestions(false), 250);
                    persistCurrentCustomer();
                  }}
                  placeholder={customerType === 'b2b' ? 'e.g. New India Saw Mill & Timber Works' : 'e.g. Ramesh Kumar'}
                  autoComplete="off"
                />

                {/* Autocomplete Suggestions */}
                {showCustomerSuggestions && customerSuggestions.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 99,
                      backgroundColor: 'var(--bg-card, #ffffff)',
                      border: '1px solid var(--border-medium, #c2b59b)',
                      borderRadius: '6px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      marginTop: '4px'
                    }}
                  >
                    <div style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', backgroundColor: 'var(--bg-subtle, #f5efe6)', borderBottom: '1px solid var(--border-light)' }}>
                      Saved Customers (Click to auto-fill)
                    </div>
                    {customerSuggestions.map((c, i) => (
                      <div
                        key={i}
                        onMouseDown={() => handleSelectCustomer(c)}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-50, #fcf7f0)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        style={{
                          padding: '0.5rem 0.65rem',
                          cursor: 'pointer',
                          borderBottom: i < customerSuggestions.length - 1 ? '1px solid var(--border-light, #eee)' : 'none',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                          {c.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '0.65rem', marginTop: '0.1rem', flexWrap: 'wrap' }}>
                          {c.phone && <span>📞 {c.phone}</span>}
                          {c.gstin && <span style={{ fontWeight: 600, color: 'var(--primary-700)' }}>GST: {c.gstin}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Phone Number */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                  <Phone size={13} color="var(--primary-600)" /> Phone Number:
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  onBlur={persistCurrentCustomer}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>

              {/* Delivery / Billing Address */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                  <MapPin size={13} color="var(--primary-600)" /> Address / Delivery Site:
                </label>
                <textarea
                  rows={1}
                  className="calc-address-textarea"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  onBlur={persistCurrentCustomer}
                  placeholder="e.g. Sy. No. 10/7 Khata No. 27/2, Industrial Suburb 2nd Stage, Mysore / Bangalore"
                />
              </div>

              {/* B2C Optional GST Number */}
              {customerType === 'b2c' && (
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <FileText size={13} color="var(--primary-600)" /> GST Number (Optional):
                  </label>
                  <input
                    type="text"
                    value={customerGstin}
                    onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                    onBlur={persistCurrentCustomer}
                    placeholder="Optional GSTIN"
                  />
                </div>
              )}

              {/* State & Code */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                  <MapPin size={13} color="var(--primary-600)" /> State / Code:
                </label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    value={customerState}
                    onChange={(e) => setCustomerState(e.target.value)}
                    onBlur={persistCurrentCustomer}
                    placeholder="Karnataka"
                    style={{ flex: 2 }}
                  />
                  <input
                    type="text"
                    value={customerStateCode}
                    onChange={(e) => setCustomerStateCode(e.target.value)}
                    onBlur={persistCurrentCustomer}
                    placeholder="29"
                    style={{ width: '55px', textAlign: 'center' }}
                  />
                </div>
              </div>

              {/* Reference Number & Measurement Date in 1 Row */}
              <div className="calc-ref-date-row">
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <Hash size={13} color="var(--primary-600)" /> Ref Number:
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="e.g. REF-261026"
                  />
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <Calendar size={13} color="var(--primary-600)" /> Date:
                  </label>
                  <input
                    type="date"
                    value={measurementDate}
                    onChange={(e) => setMeasurementDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Step 1 Footer CTA: Proceed to Step 2 Calculator */}
            <div className="step-footer-cta">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  persistCurrentCustomer();
                  setCurrentStep(2);
                }}
                style={{ width: '100%', maxWidth: '380px', justifyContent: 'center', fontWeight: 800, padding: '0.65rem 1rem', fontSize: '0.9rem' }}
              >
                Next: Timber Calculator &rarr;
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 2: TIMBER CALCULATOR (MEASUREMENTS, WOOD DROPDOWN & TALLY)
            ========================================================================= */}
        {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card calc-table-card" style={{ padding: '0.85rem' }}>
              <div className="calc-step2-top-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                <div className="calc-step2-title-block">
                  <h3 style={{ fontSize: '1.15rem', margin: 0, color: 'var(--text-main)', fontWeight: 800 }}>
                    Timber Measurement Daily Tally
                  </h3>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Customer: <strong>{customerName || 'Direct Cash Buyer'}</strong> &bull; CFT = (L &times; W &times; T &times; Pcs) &divide; 144
                  </p>
                </div>

                <div className="calc-step2-actions-block" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="badge calc-step2-total-badge" style={{ backgroundColor: 'var(--primary-100)', color: 'var(--primary-800)', border: '1px solid var(--primary-200)', fontSize: '0.78rem', padding: '0.3rem 0.65rem', fontWeight: 700 }}>
                    {customerName ? `${customerName} • ` : ''}Total: {formatValue(totals.totalCft, 3)} CFT &bull; ₹ {formatIndianCurrency(totals.totalAmount || 0)}
                  </span>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (items.length > 0 && !window.confirm('Start a new clean sheet?')) return;
                      handleNewCleanSheet();
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', fontWeight: 700 }}
                  >
                    <FilePlus size={14} color="var(--primary-600)" />
                    <span>New Sheet</span>
                  </button>
                </div>
              </div>

              {/* Measurement Table with Wood Species Dropdown & Rapid Row Entry */}
              <MeasurementTable
                items={items}
                onChange={(newItems) => setItems(newItems)}
                sqftConvention={businessSettings?.sqftFormulaType}
                defaultRate={ratePerCft}
              />

              {/* Step 2 Bottom Navigation */}
              <div className="step-footer-nav" style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCurrentStep(1)}
                  style={{ fontWeight: 600, padding: '0.75rem 1.25rem' }}
                >
                  <ArrowLeft size={16} /> Previous: Customer
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setCurrentStep(3)}
                  style={{ fontWeight: 800, padding: '0.75rem 1.4rem' }}
                >
                  Next: Additional Charges &rarr;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 3: ADDITIONAL CHARGES (CARPENTRY, TRANSPORTATION, PLANING, SAWING)
            ========================================================================= */}
        {currentStep === 3 && (
          <div className="card calc-step-card">
            <div className="calc-step-header">
              <h3 className="calc-step-title">
                <Truck size={17} color="var(--primary-600)" /> Additional Services &amp; Charges
              </h3>
              <p className="calc-step-desc">
                Add extra milling costs such as carpentry works, transportation, and planing
              </p>
            </div>

            {/* Charges Input Cards */}
            <div className="calc-charges-grid">

              {/* 1. Carpentry Works */}
              <div className="calc-charge-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Scissors size={14} color="var(--primary-600)" /> Carpentry Works (₹)
                  </label>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary-700)' }}>
                    ₹ {formatIndianCurrency(carpentryCharges)}
                  </span>
                </div>
                <input
                  type="number"
                  value={carpentryCharges === 0 ? '' : carpentryCharges}
                  onChange={(e) => setCarpentryCharges(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                  style={{ width: '100%', fontSize: '0.95rem', fontWeight: 800, padding: '0.4rem 0.55rem' }}
                />
                <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                  {[500, 1000, 2000, 5000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setCarpentryCharges(amt)}
                      style={{ fontSize: '0.7rem', padding: '0.18rem 0.45rem', background: 'var(--bg-card)', border: '1px solid var(--border-medium)' }}
                    >
                      +₹{amt}
                    </button>
                  ))}
                  {carpentryCharges > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setCarpentryCharges(0)}
                      style={{ fontSize: '0.7rem', padding: '0.18rem 0.35rem', color: 'var(--danger-400)' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Transportation Charges */}
              <div className="calc-charge-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Truck size={14} color="var(--primary-600)" /> Transportation Charges (₹)
                  </label>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary-700)' }}>
                    ₹ {formatIndianCurrency(transportationCharges)}
                  </span>
                </div>
                <input
                  type="number"
                  value={transportationCharges === 0 ? '' : transportationCharges}
                  onChange={(e) => setTransportationCharges(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                  style={{ width: '100%', fontSize: '0.95rem', fontWeight: 800, padding: '0.4rem 0.55rem' }}
                />
                <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                  {[1000, 2000, 3500, 5000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setTransportationCharges(amt)}
                      style={{ fontSize: '0.7rem', padding: '0.18rem 0.45rem', background: 'var(--bg-card)', border: '1px solid var(--border-medium)' }}
                    >
                      +₹{amt}
                    </button>
                  ))}
                  {transportationCharges > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setTransportationCharges(0)}
                      style={{ fontSize: '0.7rem', padding: '0.18rem 0.35rem', color: 'var(--danger-400)' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* 3. Planing Charges (Depends on per CFT price) */}
              <div className="calc-charge-card" style={{ border: '1.5px solid var(--border-medium)', borderRadius: '10px', padding: '0.75rem', background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Sparkles size={14} color="var(--primary-600)" /> Planing Charges (₹)
                  </label>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary-700)' }}>
                    ₹ {formatIndianCurrency(planingCharges)}
                  </span>
                </div>

                {/* Display Total CFT */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', background: 'var(--primary-50, #f8f6f0)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '0.35rem 0.6rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Total Timber Volume for Planing:
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'var(--font-mono, monospace)', color: 'var(--primary-800)' }}>
                      {totals.totalCft > 0 ? totals.totalCft.toFixed(4) : '0.0000'} CFT
                    </span>
                  </div>
                  {sqftBilledItems.length > 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--primary-700)', fontStyle: 'italic' }}>
                      ⚡ Includes {sqftBilledItems.length} item{sqftBilledItems.length > 1 ? 's' : ''} priced in SQFT converted to cubic CFT for planing.
                    </div>
                  )}
                </div>

                {/* Input: Planing Rate per CFT */}
                <div style={{ marginBottom: '0.45rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Planing Rate (₹ / CFT):
                    </label>
                    {totals.totalCft > 0 && planingRatePerCft > 0 && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {totals.totalCft.toFixed(3)} × ₹{planingRatePerCft} = ₹{formatIndianCurrency(planingCharges)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        ₹
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={planingRatePerCft === 0 ? '' : planingRatePerCft}
                        onChange={(e) => {
                          const rate = Math.max(0, parseFloat(e.target.value) || 0);
                          setPlaningRatePerCft(rate);
                          const calculated = Math.round(totals.totalCft * rate * 100) / 100;
                          setPlaningCharges(calculated);
                        }}
                        placeholder="e.g. 15 or 20"
                        style={{ width: '100%', fontSize: '0.9rem', fontWeight: 800, padding: '0.38rem 0.5rem 0.38rem 1.6rem', borderRadius: '6px', border: '1px solid var(--border-medium)' }}
                      />
                    </div>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      per CFT
                    </span>
                  </div>
                </div>

                {/* Quick Rate Buttons */}
                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  {[10, 15, 20, 25, 30].map(r => (
                    <button
                      key={r}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setPlaningRatePerCft(r);
                        const calculated = Math.round(totals.totalCft * r * 100) / 100;
                        setPlaningCharges(calculated);
                      }}
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.18rem 0.45rem',
                        background: planingRatePerCft === r ? 'var(--primary-100, #eedfc8)' : 'var(--bg-card)',
                        borderColor: planingRatePerCft === r ? 'var(--primary-600)' : 'var(--border-medium)',
                        fontWeight: planingRatePerCft === r ? 800 : 600
                      }}
                    >
                      ₹{r}/cft
                    </button>
                  ))}
                </div>

                {/* Or Enter Total Planing Charges Directly */}
                <div style={{ borderTop: '1px dashed var(--border-light)', paddingTop: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Total Planing Amount (₹):
                    </label>
                    {planingCharges > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPlaningCharges(0);
                          setPlaningRatePerCft(0);
                        }}
                        style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.7rem', color: 'var(--danger-500)', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    value={planingCharges === 0 ? '' : planingCharges}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      setPlaningCharges(val);
                      if (totals.totalCft > 0 && val > 0) {
                        setPlaningRatePerCft(Math.round((val / totals.totalCft) * 100) / 100);
                      } else if (val === 0) {
                        setPlaningRatePerCft(0);
                      }
                    }}
                    placeholder="0"
                    style={{ width: '100%', fontSize: '0.85rem', fontWeight: 700, padding: '0.32rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  />
                </div>
              </div>

              {/* 4. Other Miscellaneous Charges */}
              <div className="calc-charge-card" style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', alignItems: 'center' }}>
                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.2rem', display: 'block' }}>
                      Other Service Label:
                    </label>
                    <input
                      type="text"
                      value={otherChargesLabel}
                      onChange={(e) => setOtherChargesLabel(e.target.value)}
                      placeholder="e.g. Loading / Seasoning Charges"
                      style={{ width: '100%', fontSize: '0.85rem', fontWeight: 600, padding: '0.4rem 0.55rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.2rem', display: 'block' }}>
                      Amount (₹):
                    </label>
                    <input
                      type="number"
                      value={otherCharges === 0 ? '' : otherCharges}
                      onChange={(e) => setOtherCharges(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="0"
                      style={{ width: '100%', fontSize: '0.95rem', fontWeight: 800, padding: '0.4rem 0.55rem' }}
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* Charges Summary Banner */}
            <div style={{ background: 'var(--bg-card)', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px dashed var(--primary-300)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Timber: ₹{formatIndianCurrency(timberSubtotal)} + Charges: ₹{formatIndianCurrency(additionalChargesTotal)}</span>
                <strong style={{ fontSize: '0.98rem', color: 'var(--primary-800)' }}>Subtotal: ₹{formatIndianCurrency(subtotalWithCharges)}</strong>
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Extra Charges: <span style={{ color: 'var(--primary-700)' }}>₹ {formatIndianCurrency(additionalChargesTotal)}</span>
              </div>
            </div>

            {/* Step 3 Bottom Navigation */}
            <div className="step-footer-nav" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCurrentStep(2)}
                style={{ fontWeight: 600, padding: '0.55rem 0.9rem', fontSize: '0.84rem' }}
              >
                <ArrowLeft size={15} /> Previous: Calculator
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setCurrentStep(4)}
                style={{ fontWeight: 800, padding: '0.55rem 1rem', fontSize: '0.85rem' }}
              >
                Next: GST &amp; Disc &rarr;
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 4: GST & DISCOUNT (DISCOUNT IN PRICE OR %, GST SELECTION & GRAND TOTAL)
            ========================================================================= */}
        {currentStep === 4 && (
          <div className="card calc-step-card">
            <div className="calc-step-header">
              <h3 className="calc-step-title">
                <Percent size={17} color="var(--primary-600)" /> GST &amp; Discount
              </h3>
              <p className="calc-step-desc">
                Apply concession discounts and select GST tax rate to calculate final grand total
              </p>
            </div>

            {/* Live Subtotal Display */}
            <div className="calc-subtotal-banner">
              <div>
                <span className="calc-subtotal-label">Current Subtotal (Timber + Charges):</span>
                <div className="calc-subtotal-val">
                  ₹ {formatIndianCurrency(subtotalWithCharges)}
                </div>
              </div>
              <div className="calc-subtotal-breakdown">
                Timber: ₹{formatIndianCurrency(timberSubtotal)}<br />
                Charges: ₹{formatIndianCurrency(additionalChargesTotal)}
              </div>
            </div>

            {/* 1. Discount Section (Price in ₹ or Percentage %) */}
            <div style={{ background: 'var(--bg-card)', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-medium)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Tag size={15} color="var(--primary-600)" /> Add Discount:
                </label>

                {/* Discount Mode Toggle: Rupees vs Percentage */}
                <div style={{ display: 'inline-flex', borderRadius: '6px', border: '1px solid var(--border-medium)', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setDiscountType('rupees')}
                    style={{
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: discountType === 'rupees' ? 800 : 500,
                      backgroundColor: discountType === 'rupees' ? 'var(--primary-600)' : 'var(--bg-subtle)',
                      color: discountType === 'rupees' ? '#fff' : 'var(--text-main)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    ₹ in Rupees
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percentage')}
                    style={{
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: discountType === 'percentage' ? 800 : 500,
                      backgroundColor: discountType === 'percentage' ? 'var(--primary-600)' : 'var(--bg-subtle)',
                      color: discountType === 'percentage' ? '#fff' : 'var(--text-main)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    % in Percent
                  </button>
                </div>
              </div>

              {/* Discount Input & Quick Chips */}
              <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '150px' }}>
                  <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--text-muted)' }}>
                    {discountType === 'percentage' ? '%' : '₹'}
                  </span>
                  <input
                    type="number"
                    value={discountValue === 0 ? '' : discountValue}
                    onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                    style={{ width: '100%', paddingLeft: '24px', paddingRight: '8px', fontSize: '0.95rem', fontWeight: 800, padding: '0.38rem 0.5rem 0.38rem 22px' }}
                  />
                </div>

                {/* Quick Chips */}
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {discountType === 'percentage' ? (
                    [2, 5, 10, 15].map(p => (
                      <button
                        key={p}
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDiscountValue(p)}
                        style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem', border: '1px solid var(--border-medium)', background: discountValue === p ? 'var(--primary-100)' : 'transparent' }}
                      >
                        {p}% Off
                      </button>
                    ))
                  ) : (
                    [500, 1000, 2000, 5000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDiscountValue(amt)}
                        style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem', border: '1px solid var(--border-medium)', background: discountValue === amt ? 'var(--primary-100)' : 'transparent' }}
                      >
                        ₹{amt} Off
                      </button>
                    ))
                  )}
                  {discountValue > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDiscountValue(0)}
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.35rem', color: 'var(--danger-400)' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {discountAmount > 0 && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#15803d', fontWeight: 700 }}>
                  ✓ Discount applied: -₹{formatIndianCurrency(discountAmount)} &bull; Price after discount: ₹{formatIndianCurrency(taxableAmount)}
                </div>
              )}
            </div>

            {/* 2. GST Selection & Custom Taxable Amount Section */}
            <div style={{ background: 'var(--bg-card)', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-medium)', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Percent size={15} color="var(--primary-600)" /> Amount to Apply GST On:
                </label>

                {/* Quick Chips to set custom amount */}
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCustomGstTaxableAmount(Math.round(fullAmountBeforeGst * 0.5))}
                    style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', border: '1px solid var(--border-medium)', background: customGstTaxableAmount === Math.round(fullAmountBeforeGst * 0.5) ? 'var(--primary-100)' : 'transparent' }}
                  >
                    50% (₹{formatIndianCurrency(Math.round(fullAmountBeforeGst * 0.5))})
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCustomGstTaxableAmount(Math.round(fullAmountBeforeGst * 0.25))}
                    style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', border: '1px solid var(--border-medium)', background: customGstTaxableAmount === Math.round(fullAmountBeforeGst * 0.25) ? 'var(--primary-100)' : 'transparent' }}
                  >
                    25% (₹{formatIndianCurrency(Math.round(fullAmountBeforeGst * 0.25))})
                  </button>
                  {customGstTaxableAmount > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setCustomGstTaxableAmount(0)}
                      style={{ fontSize: '0.7rem', padding: '0.15rem 0.35rem', color: 'var(--danger-400)' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Direct Input for Custom Taxable Amount */}
              <div style={{ background: 'var(--bg-subtle, #fbf7ee)', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--primary-300, #fde68a)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ position: 'relative', maxWidth: '240px' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--text-muted)', fontSize: '1rem' }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    value={customGstTaxableAmount === 0 ? '' : customGstTaxableAmount}
                    onChange={(e) => setCustomGstTaxableAmount(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Enter amount (e.g. 5000)"
                    style={{ width: '100%', paddingLeft: '24px', fontSize: '1.05rem', fontWeight: 800, padding: '0.35rem 0.5rem 0.35rem 24px' }}
                  />
                </div>

                <div style={{ fontSize: '0.74rem', color: '#b45309', fontWeight: 600 }}>
                  💡 Total is ₹{formatIndianCurrency(fullAmountBeforeGst)}. GST applies on {customGstTaxableAmount > 0 ? `₹${formatIndianCurrency(customGstTaxableAmount)}` : `₹${formatIndianCurrency(fullAmountBeforeGst)}`}.
                </div>
              </div>

              {/* GST Rate Selection Header & Buttons */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                  Select GST Rate (%):
                </label>

                <div className="calc-gst-rate-grid">
                  {[0, 5, 12, 18, 28].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => {
                        setIsCustomGstRate(false);
                        setGstPercent(rate);
                      }}
                      className={`calc-gst-rate-btn ${(!isCustomGstRate && gstPercent === rate) ? 'active' : ''}`}
                    >
                      <span className="rate-num">{rate}%</span>
                      <span className="rate-sub">
                        {rate === 0 ? 'None' : (rate === 18 ? 'Std' : 'GST')}
                      </span>
                    </button>
                  ))}

                  {/* Custom GST % Button */}
                  <button
                    type="button"
                    onClick={() => setIsCustomGstRate(true)}
                    className={`calc-gst-rate-btn ${isCustomGstRate ? 'active' : ''}`}
                  >
                    <span className="rate-num">Custom</span>
                    <span className="rate-sub">
                      {isCustomGstRate ? `${gstPercent}%` : 'Rate'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Custom GST % Input Field (Visible when Custom Rate is clicked) */}
              {isCustomGstRate && (
                <div style={{ padding: '0.55rem', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--primary-300, #bbf7d0)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)' }}>Custom GST Rate:</span>
                  <div style={{ position: 'relative', width: '100px' }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={gstPercent}
                      onChange={(e) => setGstPercent(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="e.g. 18"
                      style={{ width: '100%', paddingRight: '22px', fontWeight: 800, fontSize: '0.92rem', textAlign: 'right', padding: '0.35rem 0.45rem' }}
                    />
                    <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--text-muted)', fontSize: '0.85rem' }}>%</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {[3, 6, 8, 9, 14, 16, 20].map((quickRate) => (
                      <button
                        key={quickRate}
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setGstPercent(quickRate)}
                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', border: '1px solid var(--border-medium)', background: gstPercent === quickRate ? 'var(--primary-100)' : 'transparent' }}
                      >
                        {quickRate}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Live GST Breakdown Summary */}
              <div style={{ marginTop: '0.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.25rem' }}>
                <span>GST Taxable Base: <strong>₹{formatIndianCurrency(gstTaxableBase)}</strong>{customGstTaxableAmount > 0 ? ' (Custom)' : ''}</span>
                <span>GST Amount ({gstPercent}%): <strong style={{ color: 'var(--primary-800)' }}>+₹{formatIndianCurrency(gstAmount)}</strong></span>
              </div>
            </div>

            {/* 3. Final Grand Total Banner */}
            <div className="calc-grand-total-banner">
              <span className="calc-grand-total-label">
                Total Price Payable (Grand Total)
              </span>
              <div className="calc-grand-total-amount">
                ₹ {formatIndianCurrency(finalGrandTotal)}
              </div>
              <div className="calc-grand-total-math">
                Subtotal ₹{formatIndianCurrency(fullAmountBeforeGst)} + GST ₹{formatIndianCurrency(gstAmount)} = ₹{formatIndianCurrency(finalGrandTotal)}
              </div>
              <div className="calc-grand-total-words">
                {numberToIndianCurrencyWords(finalGrandTotal)}
              </div>
            </div>

            {/* Step 4 Bottom Navigation */}
            <div className="step-footer-nav" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCurrentStep(3)}
                style={{ fontWeight: 600, padding: '0.55rem 0.9rem', fontSize: '0.84rem' }}
              >
                <ArrowLeft size={15} /> Previous: Charges
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setCurrentStep(5)}
                style={{ fontWeight: 800, padding: '0.55rem 1rem', fontSize: '0.85rem' }}
              >
                Next: Order Sorting &rarr;
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 5: ORDER / SORTING OF TIMBER ENTRIES
            Width (IN) - Ascending, Length (FT) - Descending within each width group
            ========================================================================= */}
        {currentStep === 5 && (
          <div className="card calc-step-card">
            <div className="calc-step-header">
              <h3 className="calc-step-title">
                <Layers size={17} color="var(--primary-600)" /> Timber Order &amp; Width Group Sorting
              </h3>
              <p className="calc-step-desc">
                Entries sorted strictly by <strong>Width Ascending</strong> and <strong>Length Descending</strong> for industrial saw mill tally
              </p>
            </div>

            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--text-muted)' }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>No timber measurements entered yet.</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCurrentStep(2)}
                  style={{ marginTop: '0.65rem', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Go to Step 2 to add timber entries
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {timberWidthGroups.map((group) => (
                  <div
                    key={group.widthInches}
                    style={{
                      border: '1px solid var(--border-medium)',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      backgroundColor: 'var(--bg-card)'
                    }}
                  >
                    {/* Width Group Header */}
                    <div
                      style={{
                        backgroundColor: 'var(--primary-50, #fcf7ee)',
                        borderBottom: '1px solid var(--border-medium)',
                        padding: '0.45rem 0.65rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.35rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ backgroundColor: 'var(--primary-600)', color: '#fff', fontSize: '0.76rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                          Width: {group.widthInches}&Prime;
                        </span>
                        <strong style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>
                          {group.totalPieces} Pcs &bull; {formatValue(group.totalCft, 3)} CFT
                        </strong>
                      </div>
                      <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--primary-800)' }}>
                        ₹ {formatIndianCurrency(group.totalAmount)}
                      </span>
                    </div>

                    {/* Group Entries Table */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '0.3rem 0.45rem' }}>#</th>
                            <th style={{ padding: '0.3rem 0.45rem' }}>Species / Type</th>
                            <th style={{ padding: '0.3rem 0.45rem', textAlign: 'right' }}>Length (FT) &darr;</th>
                            <th style={{ padding: '0.3rem 0.45rem', textAlign: 'right' }}>Thick (IN)</th>
                            <th style={{ padding: '0.3rem 0.45rem', textAlign: 'right' }}>Pieces</th>
                            <th style={{ padding: '0.3rem 0.45rem', textAlign: 'right' }}>CFT</th>
                            <th style={{ padding: '0.3rem 0.45rem', textAlign: 'right' }}>Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((it, idx) => (
                            <tr
                              key={it.id || idx}
                              style={{
                                borderBottom: idx < group.items.length - 1 ? '1px solid var(--border-light)' : 'none',
                                backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'
                              }}
                            >
                              <td style={{ padding: '0.35rem 0.45rem', color: 'var(--text-muted)' }}>{idx + 1}</td>
                              <td style={{ padding: '0.35rem 0.45rem', fontWeight: 700 }}>{(it.woodType || 'MAHAGONY').toUpperCase()}</td>
                              <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', fontWeight: 800, color: 'var(--primary-700)' }}>{it.lengthFeet} ft</td>
                              <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}>{it.thicknessInches}&Prime;</td>
                              <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', fontWeight: 700 }}>{it.pieces}</td>
                              <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', fontWeight: 700 }}>{formatValue(it.cft, 3)}</td>
                              <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', fontWeight: 800 }}>₹{formatIndianCurrency(it.amount || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Step 5 Bottom Navigation */}
            <div className="step-footer-nav" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCurrentStep(4)}
                style={{ fontWeight: 600, padding: '0.55rem 0.9rem', fontSize: '0.84rem' }}
              >
                <ArrowLeft size={15} /> Previous: GST &amp; Disc
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setCurrentStep(6)}
                style={{ fontWeight: 800, padding: '0.55rem 1rem', fontSize: '0.85rem' }}
              >
                Next: Review &amp; Share &rarr;
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 6: FINAL REVIEW, WHATSAPP SHARE, PDF DOWNLOAD & PRINT
            ========================================================================= */}
        {currentStep === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

            {/* 3 High-Impact Primary Mobile Action Buttons (WhatsApp, PDF, Print) */}
            <div className="card calc-step-card" style={{ backgroundColor: 'var(--bg-card)' }}>
              <div className="calc-step-header">
                <h3 className="calc-step-title">
                  <Printer size={17} color="var(--primary-600)" /> Instant Share &amp; Export Options
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                {/* 1. Share via WhatsApp */}
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="calc-export-btn"
                  style={{
                    backgroundColor: '#25D366',
                    color: '#ffffff',
                    boxShadow: '0 2px 8px rgba(37, 211, 102, 0.25)'
                  }}
                  title="Sends official Proforma Invoice PDF file directly to customer WhatsApp"
                >
                  <MessageCircle size={18} />
                  <span>Send PDF to WhatsApp</span>
                </button>

                {/* 2. Download Official PDF */}
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="calc-export-btn"
                  style={{
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    boxShadow: '0 2px 8px rgba(220, 38, 38, 0.2)'
                  }}
                  title="Downloads official A4 Proforma Invoice PDF matching sawmill layout"
                >
                  <FileDown size={18} />
                  <span>Download PDF Invoice</span>
                </button>

                {/* 3. Print Official Invoice */}
                <button
                  type="button"
                  onClick={handlePrint}
                  className="calc-export-btn"
                  style={{
                    backgroundColor: 'var(--primary-700, #4b3621)',
                    color: '#ffffff',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                  title="Sends official Proforma Invoice directly to printer"
                >
                  <Printer size={18} />
                  <span>Print Sheet Invoice</span>
                </button>
              </div>

              {/* Secondary Save & Full Proforma Modal trigger */}
              <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSave}
                  disabled={saveStatus === 'saving'}
                  style={{ flex: 1, minWidth: '130px', justifyContent: 'center', fontWeight: 700, padding: '0.45rem 0.75rem', fontSize: '0.82rem' }}
                >
                  <Save size={14} /> {saveStatus === 'saving' ? 'Saving...' : 'Save to Cloud DB'}
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsProformaModalOpen(true)}
                  style={{ flex: 1, minWidth: '130px', justifyContent: 'center', fontWeight: 700, padding: '0.45rem 0.75rem', fontSize: '0.82rem' }}
                >
                  <FileText size={14} /> Full Invoice Preview
                </button>
              </div>
            </div>

            {/* Summary Review Card */}
            <div className="card calc-step-card">
              <div className="calc-step-header">
                <h3 className="calc-step-title">
                  <CheckCircle size={17} color="var(--primary-600)" /> Billing &amp; Tally Overview
                </h3>
              </div>

              <div className="calc-summary-preview-grid">
                <div className="summary-preview-item">
                  <span className="preview-label">Customer / Buyer:</span>
                  <span className="preview-val font-bold">{customerName || 'Direct Cash Customer'}</span>
                </div>
                <div className="summary-preview-item">
                  <span className="preview-label">Phone:</span>
                  <span className="preview-val">{customerPhone || 'Not provided'}</span>
                </div>
                <div className="summary-preview-item">
                  <span className="preview-label">GSTIN / UIN:</span>
                  <span className="preview-val font-mono">{customerGstin || 'Not registered'}</span>
                </div>
                <div className="summary-preview-item">
                  <span className="preview-label">Address:</span>
                  <span className="preview-val">{customerAddress || 'Local Mill Pickup'}</span>
                </div>
                <div className="summary-preview-item">
                  <span className="preview-label">Total Volume:</span>
                  <span className="preview-val font-bold" style={{ color: 'var(--primary-700)' }}>
                    {formatValue(totals.totalCft, 3)} CFT
                  </span>
                </div>
                <div className="summary-preview-item">
                  <span className="preview-label">Total Pieces:</span>
                  <span className="preview-val font-bold">{totals.totalPieces} Pcs</span>
                </div>
                <div className="summary-preview-item">
                  <span className="preview-label">Timber Amount (Wood):</span>
                  <span className="preview-val font-bold">₹ {formatIndianCurrency(timberSubtotal)}</span>
                </div>
                {planingCharges > 0 && (
                  <div className="summary-preview-item">
                    <span className="preview-label">Planing Charges{planingRatePerCft > 0 ? ` (₹${planingRatePerCft}/CFT)` : ''}:</span>
                    <span className="preview-val font-bold">+₹ {formatIndianCurrency(planingCharges)}</span>
                  </div>
                )}
                {gstAmount > 0 && (
                  <div className="summary-preview-item">
                    <span className="preview-label">GST ({gstPercent}%):</span>
                    <span className="preview-val font-bold">+₹ {formatIndianCurrency(gstAmount)}</span>
                  </div>
                )}
                {carpentryCharges > 0 && (
                  <div className="summary-preview-item">
                    <span className="preview-label">Carpenter Charges:</span>
                    <span className="preview-val font-bold">+₹ {formatIndianCurrency(carpentryCharges)}</span>
                  </div>
                )}
                {transportationCharges > 0 && (
                  <div className="summary-preview-item">
                    <span className="preview-label">Transport Charges:</span>
                    <span className="preview-val font-bold">+₹ {formatIndianCurrency(transportationCharges)}</span>
                  </div>
                )}
                {otherCharges > 0 && (
                  <div className="summary-preview-item">
                    <span className="preview-label">{otherChargesLabel}:</span>
                    <span className="preview-val font-bold">+₹ {formatIndianCurrency(otherCharges)}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="summary-preview-item">
                    <span className="preview-label">Discount:</span>
                    <span className="preview-val font-bold" style={{ color: '#15803d' }}>-₹ {formatIndianCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="summary-preview-item" style={{ gridColumn: '1 / -1', background: 'var(--primary-50)', padding: '0.55rem 0.75rem', borderRadius: '6px' }}>
                  <span className="preview-label" style={{ fontWeight: 800, fontSize: '0.85rem' }}>Final Grand Total:</span>
                  <span className="preview-val font-bold" style={{ color: 'var(--primary-800)', fontSize: '1.2rem' }}>
                    ₹ {formatIndianCurrency(finalGrandTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Editable Dispatch & Logistics Card */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.65rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-main)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Edit3 size={16} color="var(--primary-600)" /> Invoice &amp; Dispatch Logistics (Optional)
                  </h3>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Editable details printed on the official proforma document
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Invoice No.</label>
                  <input
                    type="text"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    style={{ width: '100%', fontSize: '0.85rem', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Invoice Date</label>
                  <input
                    type="text"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    style={{ width: '100%', fontSize: '0.85rem', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>e-Way Bill No.</label>
                  <input
                    type="text"
                    value={eWayBillNo}
                    onChange={(e) => setEWayBillNo(e.target.value)}
                    placeholder="Optional"
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Payment Terms</label>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Buyer's Order No.</label>
                  <input
                    type="text"
                    value={buyerOrderNo}
                    onChange={(e) => setBuyerOrderNo(e.target.value)}
                    placeholder="Optional"
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Order Dated</label>
                  <input
                    type="text"
                    value={buyerOrderDate}
                    onChange={(e) => setBuyerOrderDate(e.target.value)}
                    placeholder="DD-Mon-YY"
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Destination</label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Motor Vehicle No.</label>
                  <input
                    type="text"
                    value={motorVehicleNo}
                    onChange={(e) => setMotorVehicleNo(e.target.value)}
                    placeholder="KA-09-XX-1234"
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Terms of Delivery (Multi-line)</label>
                  <textarea
                    rows={3}
                    value={termsOfDelivery}
                    onChange={(e) => setTermsOfDelivery(e.target.value)}
                    placeholder="e.g. TRANSPORTATION EXTRA&#10;APPLICABLE GST EXTRA"
                    style={{ width: '100%', fontSize: '0.85rem', lineHeight: 1.4 }}
                  />
                </div>
              </div>
            </div>

            {/* Step 6 Bottom Navigation */}
            <div className="step-footer-nav" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCurrentStep(5)}
                style={{ fontWeight: 600, padding: '0.75rem 1.25rem' }}
              >
                <ArrowLeft size={16} /> Previous: Timber Order
              </button>
            </div>
          </div>
        )}

        {/* Mobile Sticky Step Dock Bar (Always visible on mobile screen without scrolling) */}
        <div className="calc-mobile-docked-nav no-print">
          {currentStep > 1 && (
            <button
              type="button"
              className="btn btn-secondary calc-dock-btn calc-dock-prev"
              onClick={() => setCurrentStep(prev => (prev - 1) as 1 | 2 | 3 | 4 | 5 | 6)}
              style={{ flex: '0 0 auto', padding: '0.45rem 0.65rem' }}
            >
              <ArrowLeft size={15} /> Back
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary calc-dock-btn"
            onClick={() => setIsActionsModalOpen(true)}
            style={{
              flex: '0 0 auto',
              padding: '0.45rem 0.65rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontWeight: 700
            }}
            title="Sheet Actions Menu: Save, Invoice, PDF, Print, CSV"
          >
            <SlidersHorizontal size={14} color="var(--primary-700)" />
            <span>Actions</span>
          </button>

          {currentStep < 6 ? (
            <button
              type="button"
              className="btn btn-primary calc-dock-btn calc-dock-next"
              style={{ flex: 1 }}
              onClick={() => {
                if (currentStep === 1) persistCurrentCustomer();
                setCurrentStep(prev => (prev + 1) as 1 | 2 | 3 | 4 | 5 | 6);
              }}
            >
              <span>
                {currentStep === 1 && 'Next: Calculator →'}
                {currentStep === 2 && 'Next: Charges →'}
                {currentStep === 3 && 'Next: GST & Disc →'}
                {currentStep === 4 && 'Next: Order Sorting →'}
                {currentStep === 5 && 'Next: Review & Share →'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary calc-dock-btn calc-dock-next"
              onClick={handleShareWhatsApp}
              style={{ flex: 1, backgroundColor: '#25D366' }}
            >
              <MessageCircle size={16} />
              <span>Share to WhatsApp</span>
            </button>
          )}
        </div>

        {/* Quick Actions Drawer / Modal */}
        {isActionsModalOpen && (
          <div className="modal-overlay" onClick={() => setIsActionsModalOpen(false)}>
            <div
              className="modal-content actions-sheet-modal"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '420px', padding: '1.25rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <SlidersHorizontal size={18} color="var(--primary-600)" />
                  <h3 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 800 }}>Sheet Actions</h3>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setIsActionsModalOpen(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="actions-menu-list">
                <button
                  type="button"
                  className="action-menu-item primary"
                  onClick={() => {
                    setIsActionsModalOpen(false);
                    handleShareWhatsApp();
                  }}
                  style={{ backgroundColor: 'rgba(37, 211, 102, 0.1)', borderColor: '#25D366' }}
                >
                  <MessageCircle size={18} color="#25D366" />
                  <div>
                    <strong style={{ color: '#128C7E' }}>Send PDF to WhatsApp</strong>
                    <p>Send official PDF invoice to customer phone</p>
                  </div>
                </button>

                <button
                  type="button"
                  className="action-menu-item"
                  onClick={handleExportPdf}
                >
                  <FileDown size={18} color="#dc2626" />
                  <div>
                    <strong>Download PDF Invoice</strong>
                    <p>Official A4 proforma invoice matching sawmill layout</p>
                  </div>
                </button>

                <button
                  type="button"
                  className="action-menu-item"
                  onClick={handlePrint}
                >
                  <Printer size={18} />
                  <div>
                    <strong>Print Sheet</strong>
                    <p>Print official proforma invoice</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="action-menu-item"/*  */
                  disabled={saveStatus === 'saving'}
                >
                  <Save size={18} />
                  <div>
                    <strong>Save to Cloud DB</strong>
                    <p>{saveStatus === 'saved' ? 'All changes saved' : 'Save draft to database'}</p>
                  </div>
                </button>

                <button
                  type="button"
                  className="action-menu-item"
                  onClick={handleExportCsv}
                >
                  <Share2 size={18} />
                  <div>
                    <strong>Export CSV</strong>
                    <p>Excel-compatible tally table data</p>
                  </div>
                </button>

                <button
                  type="button"
                  className="action-menu-item"
                  onClick={handleNewCleanSheet}
                >
                  <FilePlus size={18} />
                  <div>
                    <strong>New Clean Sheet</strong>
                    <p>Start a new blank tally</p>
                  </div>
                </button>

                <button
                  type="button"
                  className="action-menu-item danger"
                  onClick={() => {
                    setIsActionsModalOpen(false);
                    setIsClearModalOpen(true);
                  }}
                  disabled={items.length === 0}
                >
                  <Trash2 size={18} />
                  <div>
                    <strong>Clear All Measurements</strong>
                    <p>Remove all rows from this sheet</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear All Rows Confirmation Modal */}
        <ConfirmModal
          isOpen={isClearModalOpen}
          title="Clear All Measurement Rows?"
          message="This will remove all measurement rows from this sheet. You can start over with a clean table."
          confirmLabel="Clear All Rows"
          isDestructive={true}
          onConfirm={handleClearAll}
          onCancel={() => setIsClearModalOpen(false)}
        />

        {/* Proforma Invoice A4 Industrial Modal */}
        <ProformaInvoiceModal
          isOpen={isProformaModalOpen}
          onClose={() => setIsProformaModalOpen(false)}
          sheet={getCurrentSheetObject()}
          businessSettings={businessSettings}
        />
      </div>

      {/* Printable Official Proforma Invoice (Rendered strictly when user prints) */}
      <div className="sheet-print-container">
        <PrintableProformaInvoice
          businessSettings={businessSettings}
          invoiceNo={invoiceNo}
          eWayBillNo={eWayBillNo}
          invoiceDate={invoiceDate}
          paymentTerms={paymentTerms}
          buyerOrderNo={buyerOrderNo}
          buyerOrderDate={buyerOrderDate}
          destination={destination}
          motorVehicleNo={motorVehicleNo}
          termsOfDelivery={termsOfDelivery}
          consigneeName={customerName || 'New India Saw Mill'}
          consigneeAddress={customerAddress || 'Local Mill Pickup'}
          consigneeGstin={customerGstin || '29CJZPK3158H1ZG'}
          consigneeState={customerState || 'Karnataka'}
          consigneeStateCode={customerStateCode || '29'}
          buyerName={customerName || 'New India Saw Mill'}
          buyerAddress={customerAddress || 'Local Mill Pickup'}
          buyerGstin={customerGstin || '29CJZPK3158H1ZG'}
          buyerState={customerState || 'Karnataka'}
          buyerStateCode={customerStateCode || '29'}
          items={sortedItems}
          ratePerCft={ratePerCft}
          additionalCharges={{
            carpentry: carpentryCharges,
            transportation: transportationCharges,
            planing: planingCharges,
            planingRatePerCft,
            sawing: sawingCharges,
            other: otherCharges,
            otherLabel: otherChargesLabel
          }}
          discountAmount={discountAmount}
          discountDesc={discountType === 'percentage' ? `${discountValue}%` : `₹${discountValue}`}
          gstPercent={gstPercent}
          gstTaxableBase={(customGstTaxableAmount > 0 && customGstTaxableAmount !== fullAmountBeforeGst) ? gstTaxableBase : undefined}
          gstAmount={gstAmount}
          finalGrandTotal={finalGrandTotal}
        />
      </div>
    </>
  );
};
