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
  Sparkles,
  Eye,
  ShoppingBag,
  TrendingUp
} from 'lucide-react';
import type { MeasurementItem, MeasurementSheet, BusinessSettings } from '../types';
import { MeasurementTable } from '../components/MeasurementTable';
import { ConfirmModal } from '../components/ConfirmModal';
import { ProformaInvoiceModal } from '../components/ProformaInvoiceModal';
import { PrintableProformaInvoice } from '../components/PrintableProformaInvoice';
import { calculateTotals, formatValue, sortTimberEntries, groupTimberByWood, calculateRow } from '../utils/calculator';
import { formatIndianCurrency } from '../utils/indianNumberWords';
import { exportSheetToCsv } from '../utils/exportCsv';
import { exportSheetToPdf, printProformaInvoicePdf, getProformaInvoicePdfBlob, type ProformaInvoiceExportData } from '../utils/exportPdf';
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

  // 14-Step Linear Workflow State:
  // 1: Order / Voucher Type (Sales vs Purchase)
  // 2: Customer Type (B2B vs B2C)
  // 3: Buyer (Bill to) Details
  // 4: Consignee (Ship to) Details
  // 5: Timber Calculator
  // 6: Planing Charges (with image)
  // 7: Carpentry Charges (with image)
  // 8: Transportation Charges (with image)
  // 9: Other Miscellaneous Charges (with image)
  // 10: GST Tax Configuration (with image)
  // 11: Customer Discount (with image)
  // 12: Timber Order / Sorting (Preview Calculation)
  // 13: Preview Bill To & Ship To Details
  // 14: Final Invoice & Share
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14>(1);

  // Sheet Metadata State
  const [sheetId, setSheetId] = useState<string>(sheetToEdit?.id || generateId());
  const [sheetName, setSheetName] = useState<string>(sheetToEdit?.sheetName || 'Daily Timber Tally Sheet');

  // Step 1: Order / Voucher Type (Sales vs Purchase)
  const [voucherType, setVoucherType] = useState<'sales' | 'purchase'>(sheetToEdit?.voucherType || 'sales');

  // Step 2: Buyer (Bill to) Customer Details
  const [customerType, setCustomerType] = useState<'b2b' | 'b2c'>(sheetToEdit?.customerType || 'b2c');
  const [customerName, setCustomerName] = useState<string>(sheetToEdit?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState<string>(sheetToEdit?.customerPhone || '');
  const [customerAddress, setCustomerAddress] = useState<string>(sheetToEdit?.customerAddress || '');
  const [customerGstin, setCustomerGstin] = useState<string>(sheetToEdit?.customerGstin || '');
  const [customerState, setCustomerState] = useState<string>(sheetToEdit?.customerState || '');
  const [customerStateCode, setCustomerStateCode] = useState<string>(sheetToEdit?.customerStateCode || '');
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

  // Step 3: Consignee (Ship to) Details
  const [consigneeName, setConsigneeName] = useState<string>(
    sheetToEdit?.consigneeName || sheetToEdit?.customerName || ''
  );
  const [consigneePhone, setConsigneePhone] = useState<string>(
    sheetToEdit?.consigneePhone || sheetToEdit?.customerPhone || ''
  );
  const [consigneeAddress, setConsigneeAddress] = useState<string>(
    sheetToEdit?.consigneeAddress || sheetToEdit?.customerAddress || ''
  );
  const [consigneeGstin, setConsigneeGstin] = useState<string>(
    sheetToEdit?.consigneeGstin || sheetToEdit?.customerGstin || ''
  );
  const [consigneeDistrict, setConsigneeDistrict] = useState<string>(
    sheetToEdit?.consigneeDistrict || ''
  );
  const [consigneeStateCode, setConsigneeStateCode] = useState<string>(
    sheetToEdit?.consigneeStateCode || sheetToEdit?.customerStateCode || ''
  );
  const [consigneeState, setConsigneeState] = useState<string>(
    sheetToEdit?.consigneeState || sheetToEdit?.destination || 'Karnataka'
  );
  const [isShipToTouched, setIsShipToTouched] = useState<boolean>(
    Boolean(sheetToEdit?.consigneeName && sheetToEdit.consigneeName !== sheetToEdit.customerName)
  );
  const [isShipToGstSearching, setIsShipToGstSearching] = useState<boolean>(false);
  const [shipToGstNotice, setShipToGstNotice] = useState<string | null>(null);
  const [shipToCopyNotice, setShipToCopyNotice] = useState<string | null>(null);

  // Step 2: Timber Items & Rate
  const [items, setItems] = useState<MeasurementItem[]>(
    sheetToEdit?.items && sheetToEdit.items.length > 0 ? sortTimberEntries(sheetToEdit.items) : []
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
  const [destination, setDestination] = useState<string>(
    sheetToEdit?.destination || 'Karnataka'
  );
  const [motorVehicleNo, setMotorVehicleNo] = useState<string>('');
  const [termsOfDelivery, setTermsOfDelivery] = useState<string>('TRANSPORTATION EXTRA\nAPPLICABLE GST EXTRA');

  // Customer Autocomplete Suggestions State
  const [customerSuggestions, setCustomerSuggestions] = useState<SavedCustomer[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState<boolean>(false);
  const [phoneSuggestions, setPhoneSuggestions] = useState<SavedCustomer[]>([]);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState<boolean>(false);

  // Status & Feedback State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isProformaModalOpen, setIsProformaModalOpen] = useState(false);
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false);
  const [editModalTarget, setEditModalTarget] = useState<'bill_to' | 'ship_to' | null>(null);

  // Global listener so the top header Actions button on mobile can trigger sheet actions
  useEffect(() => {
    const handleOpenActions = () => setIsActionsModalOpen(true);
    window.addEventListener('open-sheet-actions', handleOpenActions);
    return () => window.removeEventListener('open-sheet-actions', handleOpenActions);
  }, []);

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
      setVoucherType(sheetToEdit.voucherType || 'sales');
      setCustomerType(sheetToEdit.customerType || 'b2c');
      setCustomerName(sheetToEdit.customerName || '');
      setCustomerPhone(sheetToEdit.customerPhone || '');
      setCustomerAddress(sheetToEdit.customerAddress || '');
      setCustomerGstin(sheetToEdit.customerGstin || '');
      setCustomerState(sheetToEdit.customerState || '');
      setCustomerStateCode(sheetToEdit.customerStateCode || '');
      setProjectName(sheetToEdit.projectName || '');
      setReferenceNumber(sheetToEdit.referenceNumber || `REF-${Math.floor(100000 + Math.random() * 900000)}`);
      setMeasurementDate(sheetToEdit.measurementDate || new Date().toISOString().split('T')[0]);
      setNotes(sheetToEdit.notes || '');
      setItems(sortTimberEntries(sheetToEdit.items || []));
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
      setDestination(sheetToEdit.destination || 'Karnataka');
      setConsigneeName(sheetToEdit.consigneeName || sheetToEdit.customerName || '');
      setConsigneePhone(sheetToEdit.consigneePhone || sheetToEdit.customerPhone || '');
      setConsigneeAddress(sheetToEdit.consigneeAddress || sheetToEdit.customerAddress || '');
      setConsigneeGstin(sheetToEdit.consigneeGstin || sheetToEdit.customerGstin || '');
      setConsigneeDistrict(sheetToEdit.consigneeDistrict || '');
      setConsigneeStateCode(sheetToEdit.consigneeStateCode || sheetToEdit.customerStateCode || '');
      setConsigneeState(sheetToEdit.consigneeState || sheetToEdit.destination || 'Karnataka');
      setIsShipToTouched(Boolean(sheetToEdit.consigneeName && sheetToEdit.consigneeName !== sheetToEdit.customerName));
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

  const handlePhoneInputChange = (val: string) => {
    setCustomerPhone(val);
    const digits = val.replace(/\D/g, '');
    if (digits.length >= 2) {
      const all = getAllKnownCustomers();
      const matches = all.filter(c => (c.phone || '').replace(/\D/g, '').includes(digits));
      setPhoneSuggestions(matches);
      setShowPhoneSuggestions(matches.length > 0);
    } else {
      setShowPhoneSuggestions(false);
    }
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
    if (c.state) {
      setCustomerState(c.state);
      setDestination(c.state.toUpperCase());
    }
    if (c.stateCode) setCustomerStateCode(c.stateCode);
    if (c.projectName) setProjectName(c.projectName);
    setShowCustomerSuggestions(false);
    setShowPhoneSuggestions(false);
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
    if (!destination || destination === 'BANGLORE') {
      setDestination(matchedState.toUpperCase());
    }

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

  // Consignee (Ship To) GST search
  const handleSearchConsigneeGst = async (gstinOverride?: string) => {
    const rawGst = (gstinOverride || consigneeGstin).trim().toUpperCase();
    const clean = rawGst.replace(/[^A-Z0-9]/g, '');

    if (!clean || clean.length < 2) {
      setShipToGstNotice('Please enter a valid 15-character GSTIN (e.g. 29APYPK6256P1ZL).');
      return;
    }

    const code = clean.slice(0, 2);
    const matchedState = INDIAN_GST_STATES[code] || consigneeState || 'Karnataka';
    setConsigneeState(matchedState);
    setConsigneeStateCode(code);

    if (clean.length !== 15) {
      setShipToGstNotice(`State identified: ${matchedState} (${code}). Please enter the full 15-digit GSTIN to fetch details.`);
      return;
    }

    setIsShipToGstSearching(true);
    setShipToGstNotice(null);

    try {
      const res = await fetchGstinDetails(clean);

      if (res.success && res.data) {
        const d = res.data;
        const companyName = (d.trade_name && d.trade_name.trim().length > 0)
          ? d.trade_name.trim()
          : (d.legal_name || '').trim();

        if (companyName) {
          setConsigneeName(companyName);
        }

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
          setConsigneeAddress(formattedAddress);
        }

        if (d.state_code) {
          const stateFromApi = INDIAN_GST_STATES[d.state_code] || d.address_details?.state || matchedState;
          setConsigneeState(stateFromApi);
          setConsigneeStateCode(d.state_code);
        }

        const statusTag = d.status ? ` • Status: ${d.status}` : '';
        const typeTag = d.taxpayer_type ? ` (${d.taxpayer_type})` : '';
        setShipToGstNotice(`✓ Verified: ${companyName}${statusTag}${typeTag}`);
      } else {
        const all = getAllKnownCustomers();
        const found = all.find(c => c.gstin && c.gstin.trim().toUpperCase() === clean);
        if (found) {
          if (found.name) setConsigneeName(found.name);
          if (found.phone) setConsigneePhone(found.phone);
          if (found.address) setConsigneeAddress(found.address);
          setShipToGstNotice(`✓ Auto-Filled from Saved Directory: ${found.name} (${matchedState}, State Code ${code})`);
        } else {
          setShipToGstNotice(`⚠️ ${res.error || 'GSTIN details not found'}. State verified: ${matchedState} (${code}). You can enter details manually.`);
        }
      }
    } catch (_err) {
      setShipToGstNotice(`⚠️ Could not reach GST verification service. State verified: ${matchedState} (${code}).`);
    } finally {
      setIsShipToGstSearching(false);
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
        const rowCft = it.cft > 0 ? it.cft : (l * w * t * p) / 144;
        const rowSqft = it.sqft > 0 ? it.sqft : (rowCft * 12);
        const isSqft = w >= 7 && it.rateUnit !== 'CFT';
        const defaultRowRate = isSqft ? 120 : ratePerCft;
        const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
        const mult = isSqft ? rowSqft : rowCft;
        const amt = typeof it.amount === 'number' && it.amount > 0 ? it.amount : Math.round(mult * r * 100) / 100;
        sum += amt;
      }
    }
    return sum > 0 ? sum : (totals.totalAmount || 0);
  }, [items, ratePerCft, totals.totalAmount]);

  const additionalChargesTotal = (carpentryCharges || 0) + (transportationCharges || 0) + (planingCharges || 0) + (sawingCharges || 0) + (otherCharges || 0);
  const subtotalWithCharges = timberSubtotal + additionalChargesTotal;

  // The specific amount on which GST is applied:
  // User enters custom amount directly (e.g. ₹ 5,000) or defaults to the subtotal with charges
  const gstTaxableBase = (customGstTaxableAmount > 0)
    ? customGstTaxableAmount
    : subtotalWithCharges;

  // GST Amount is calculated strictly on the gstTaxableBase
  const gstAmount = Math.round((gstTaxableBase * ((gstPercent || 0) / 100)) * 100) / 100;

  // Total bill amount before customer discount (Timber + Additional Charges + GST)
  const totalBeforeDiscount = Math.round((subtotalWithCharges + gstAmount) * 100) / 100;

  // Customer Discount / Concession:
  // - If percentage: calculated as % of subtotal with charges
  // - If flat rupees: flat amount deducted directly from total payable
  const discountAmount = useMemo(() => {
    if (!discountValue || discountValue <= 0) return 0;
    if (discountType === 'percentage') {
      return Math.round((subtotalWithCharges * (discountValue / 100)) * 100) / 100;
    }
    return Math.min(discountValue, totalBeforeDiscount);
  }, [discountType, discountValue, subtotalWithCharges, totalBeforeDiscount]);

  // Grand Total = Total Before Discount - Discount Deducted
  const finalGrandTotal = Math.max(0, Math.round((totalBeforeDiscount - discountAmount) * 100) / 100);

  // Sorted timber entries according to strict sawmill specifications:
  // Wood Species Grouping -> Width (IN) Ascending -> Length (FT) Descending -> Thickness (IN) Descending
  const sortedItems = useMemo(() => sortTimberEntries(items), [items]);
  const timberWoodGroups = useMemo(() => groupTimberByWood(items, ratePerCft), [items, ratePerCft]);

  // Handle in-place row editing in Step 8 (Measurements, Pieces, Rates)
  const handleStep8UpdateItem = (
    itemId: string,
    field: keyof MeasurementItem,
    rawValue: string
  ) => {
    const itemIndex = items.findIndex((it) => it.id === itemId);
    if (itemIndex === -1) return;

    const updated = [...items];
    const target = { ...updated[itemIndex] };

    if (field === 'woodType' || field === 'remarks') {
      target[field] = rawValue;
    } else {
      const parsed = rawValue === '' ? '' : parseFloat(rawValue);
      (target as any)[field] = isNaN(parsed as number) ? '' : parsed;

      // Recalculate row
      const calc = calculateRow(
        target.lengthFeet,
        target.widthInches,
        target.thicknessInches,
        target.pieces,
        businessSettings?.sqftFormulaType
      );
      target.cft = calc.cft;
      target.sqft = calc.sqft;

      const wNum = typeof target.widthInches === 'number' ? target.widthInches : 0;
      if (field === 'widthInches') {
        if (wNum >= 7) {
          target.rateUnit = 'SQFT';
          if (!target.rate || target.rate === ratePerCft) {
            target.rate = 120;
          }
        } else if (wNum > 0 && wNum < 7) {
          target.rateUnit = 'CFT';
          if (target.rate === 120) {
            target.rate = ratePerCft;
          }
        }
      }

      const isSqft = wNum >= 7 && target.rateUnit !== 'CFT';
      const defaultRowRate = isSqft ? 120 : ratePerCft;
      const rowRate = typeof target.rate === 'number' && target.rate > 0 ? target.rate : defaultRowRate;
      const multiplier = isSqft ? calc.sqft : calc.cft;
      target.amount = Math.round(multiplier * rowRate * 100) / 100;
    }

    updated[itemIndex] = target;
    setItems(updated);
  };

  // Delete row in Step 8
  const handleStep8DeleteRow = (itemId: string) => {
    const updated = items.filter((it) => it.id !== itemId);
    const reindexed = updated.map((it, idx) => ({ ...it, serialNumber: idx + 1 }));
    setItems(reindexed);
  };

  // Add row to a specific wood species in Step 8
  const handleStep8AddRow = (woodType: string) => {
    const newRow: MeasurementItem = {
      id: generateId(),
      serialNumber: items.length + 1,
      lengthFeet: '',
      widthInches: '',
      thicknessInches: '',
      pieces: 1,
      cft: 0,
      sqft: 0,
      rate: ratePerCft,
      amount: 0,
      woodType: woodType || 'MAHAGONY'
    };
    setItems([...items, newRow]);
  };

  // Construct current full sheet object
  const getCurrentSheetObject = (): MeasurementSheet => {
    const raw: Partial<MeasurementSheet> = {
      id: sheetId,
      sheetName,
      voucherType,
      customerType,
      customerName,
      customerPhone,
      customerAddress,
      customerGstin,
      customerState: customerState || destination || 'Karnataka',
      customerStateCode,
      destination: destination || consigneeDistrict?.toUpperCase() || consigneeState?.toUpperCase() || 'Karnataka',
      consigneeName,
      consigneePhone,
      consigneeAddress,
      consigneeGstin,
      consigneeDistrict,
      consigneeState: consigneeState || customerState || destination || 'Karnataka',
      consigneeStateCode,
      projectName,
      referenceNumber,
      measurementDate,
      notes,
      items: sortTimberEntries(items),
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
      finalGrandTotal: (finalGrandTotal && finalGrandTotal > 0) ? finalGrandTotal : totalBeforeDiscount
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
      voucherType,
      customerType,
      customerName,
      customerPhone,
      customerAddress,
      customerGstin,
      customerState: customerState || destination || 'Karnataka',
      customerStateCode,
      destination: destination || consigneeDistrict?.toUpperCase() || consigneeState?.toUpperCase() || 'Karnataka',
      consigneeName,
      consigneePhone,
      consigneeAddress,
      consigneeGstin,
      consigneeDistrict,
      consigneeState: consigneeState || customerState || destination || 'Karnataka',
      consigneeStateCode,
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
      finalGrandTotal: (finalGrandTotal && finalGrandTotal > 0) ? finalGrandTotal : totalBeforeDiscount
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
    voucherType,
    customerType,
    customerName,
    customerPhone,
    customerAddress,
    customerGstin,
    customerState,
    customerStateCode,
    destination,
    consigneeName,
    consigneePhone,
    consigneeAddress,
    consigneeGstin,
    consigneeDistrict,
    consigneeState,
    consigneeStateCode,
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
    setCustomerState('');
    setCustomerStateCode('');
    setDestination('Karnataka');
    setConsigneeName('');
    setConsigneePhone('');
    setConsigneeAddress('');
    setConsigneeGstin('');
    setConsigneeDistrict('');
    setConsigneeStateCode('');
    setConsigneeState('Karnataka');
    setIsShipToTouched(false);
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
    setVoucherType('sales');
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

  const getFullInvoiceExportData = () => {
    const current = getCurrentSheetObject();
    const sortedCurrentItems = sortTimberEntries(current.items);

    // Map items including additional charges as line items if present
    const invoiceItems = sortedCurrentItems
      .filter((it) => typeof it.lengthFeet === 'number' && it.lengthFeet > 0 && typeof it.pieces === 'number' && it.pieces > 0)
      .map((it, idx) => {
        const w = typeof it.widthInches === 'number' ? it.widthInches : 0;
        const isSqftBilled = w >= 7 && it.rateUnit !== 'CFT';
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
      voucherType,
      customerName: customerName || undefined,
      invoiceNo,
      eWayBillNo,
      invoiceDate,
      paymentTerms,
      buyerOrderNo,
      buyerOrderDate,
      destination: consigneeDistrict?.toUpperCase() || consigneeState?.toUpperCase() || destination?.toUpperCase() || 'KARNATAKA',
      motorVehicleNo,
      termsOfDelivery,
      consigneeName: consigneeName || customerName || '',
      consigneePhone: consigneePhone || customerPhone || '',
      consigneeAddress: consigneeAddress || customerAddress || '',
      consigneeGstin: consigneeGstin || customerGstin || '',
      consigneeState: consigneeState || destination || 'Karnataka',
      consigneeStateCode: consigneeStateCode || customerStateCode || '29',
      buyerName: customerName || consigneeName || '',
      buyerPhone: customerPhone || consigneePhone || '',
      buyerAddress: customerAddress || consigneeAddress || '',
      buyerGstin: customerGstin || consigneeGstin || '',
      buyerState: customerState || destination || consigneeState || 'Karnataka',
      buyerStateCode: customerStateCode || consigneeStateCode || '29',
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
      gstTaxableBase: (customGstTaxableAmount > 0 && customGstTaxableAmount !== subtotalWithCharges) ? gstTaxableBase : undefined,
      finalGrandTotal,
      gstAmount,
      items: invoiceItems
    };

    return { current, exportData };
  };

  const handleExportPdf = () => {
    persistCurrentCustomer();
    const { current, exportData } = getFullInvoiceExportData();
    exportSheetToPdf(current, businessSettings, exportData);
    setIsActionsModalOpen(false);
  };

  const handlePrint = () => {
    persistCurrentCustomer();
    setIsActionsModalOpen(false);
    const { current, exportData } = getFullInvoiceExportData();
    printProformaInvoicePdf(current, businessSettings, exportData);
  };

  // Sync back edits made in Proforma Invoice Modal to form state and storage
  const handleUpdateFromProforma = (updated: Partial<MeasurementSheet>) => {
    if (updated.consigneeName !== undefined) setConsigneeName(updated.consigneeName);
    if (updated.consigneePhone !== undefined) setConsigneePhone(updated.consigneePhone);
    if (updated.consigneeAddress !== undefined) setConsigneeAddress(updated.consigneeAddress);
    if (updated.consigneeGstin !== undefined) setConsigneeGstin(updated.consigneeGstin);
    if (updated.consigneeState !== undefined) setConsigneeState(updated.consigneeState);
    if (updated.consigneeStateCode !== undefined) setConsigneeStateCode(updated.consigneeStateCode);
    if (updated.consigneeDistrict !== undefined) setConsigneeDistrict(updated.consigneeDistrict);

    if (updated.customerName !== undefined) setCustomerName(updated.customerName);
    if (updated.customerPhone !== undefined) setCustomerPhone(updated.customerPhone);
    if (updated.customerAddress !== undefined) setCustomerAddress(updated.customerAddress);
    if (updated.customerGstin !== undefined) setCustomerGstin(updated.customerGstin);
    if (updated.customerState !== undefined) setCustomerState(updated.customerState);
    if (updated.customerStateCode !== undefined) setCustomerStateCode(updated.customerStateCode);

    if (updated.destination !== undefined) setDestination(updated.destination);
    if (updated.motorVehicleNo !== undefined) setMotorVehicleNo(updated.motorVehicleNo);
    if (updated.termsOfDelivery !== undefined) setTermsOfDelivery(updated.termsOfDelivery);
    if (updated.paymentTerms !== undefined) setPaymentTerms(updated.paymentTerms);
    if (updated.buyerOrderNo !== undefined) setBuyerOrderNo(updated.buyerOrderNo);
    if (updated.buyerOrderDate !== undefined) setBuyerOrderDate(updated.buyerOrderDate);

    setIsShipToTouched(true);
  };

  // Share Invoice PDF directly to customer's WhatsApp chat
  const handleShareWhatsApp = async () => {
    persistCurrentCustomer();

    // 1. Extract customer phone from invoice details
    let rawPhone = (customerPhone || '').trim();
    let digits = rawPhone.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) {
      digits = digits.slice(1);
    }
    if (digits.length === 10) {
      digits = `91${digits}`;
    }

    if (!digits) {
      const entered = window.prompt(
        "Please enter the customer's 10-digit WhatsApp phone number:",
        customerPhone || ''
      );
      if (!entered) return;
      rawPhone = entered.trim();
      digits = rawPhone.replace(/\D/g, '');
      if (digits.startsWith('0') && digits.length === 11) {
        digits = digits.slice(1);
      }
      if (digits.length === 10) {
        digits = `91${digits}`;
      }
      if (!digits) {
        alert("Please enter a valid phone number to share via WhatsApp.");
        return;
      }
      setCustomerPhone(rawPhone);
    }

    const { current, exportData } = getFullInvoiceExportData();

    // 2. Generate the official Proforma Invoice PDF named after the client
    const { blob, filename } = getProformaInvoicePdfBlob(current, businessSettings, exportData);
    const pdfFile = new File([blob], filename, { type: 'application/pdf' });

    const invoiceNo = exportData.invoiceNo || 'Invoice';
    const clientName = (customerName || '').trim() || 'Valued Customer';
    const totalPayable = formatIndianCurrency(finalGrandTotal > 0 ? finalGrandTotal : totalBeforeDiscount);

    const shareMessage = `🌲 *HINDUSTAN SAW MILL & WOOD WORKS* 🌲\n` +
      `📄 *Proforma Invoice:* ${invoiceNo}\n` +
      `👤 *Customer:* ${clientName}\n` +
      `💰 *Grand Total:* Rs. ${totalPayable}\n\n` +
      `Please find your official Timber Proforma Invoice PDF attached.\n` +
      `Thank you for your business!`;

    // 3. Option 1: Mobile Web Share API with PDF attached directly
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: `${invoiceNo} - ${clientName}`,
          text: shareMessage
        });
        return; // Successfully presented to WhatsApp with PDF attached!
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // User closed the share menu without sending
          return;
        }
        console.warn('Native file share failed, falling back to download + WhatsApp link', err);
      }
    }

    // 4. Desktop / Fallback flow: Download PDF and open customer's WhatsApp chat with pre-filled message
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 15000);

    const waUrl = `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(shareMessage)}`;
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
            STEP 1: SELECT ORDER / VOUCHER TYPE (Sales vs Purchase)
            ========================================================================= */}
        {currentStep === 1 && (
          <div className="card calc-step-card">
            <div className="calc-step-header" style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
              <h3 className="calc-step-title" style={{ justifyContent: 'center', fontSize: '1.15rem' }}>
                <ShoppingBag size={18} color="var(--primary-600)" /> Select Order Type
              </h3>
              <p className="calc-step-desc">
                Choose whether this transaction is for Sales or Purchase
              </p>
            </div>

            <div className="calc-type-choice-grid">
              {/* 1. Sales Card */}
              <div
                className={`calc-type-card ${voucherType === 'sales' ? 'selected' : ''}`}
                onClick={() => {
                  setVoucherType('sales');
                  setCurrentStep(2);
                }}
              >
                <div className="calc-type-card-icon">
                  <TrendingUp size={28} />
                </div>
                <div className="calc-type-card-content">
                  <h4>Sales</h4>
                  <p>Timber sale to customer, outward delivery, and sales proforma tax invoice</p>
                </div>
                <span className="calc-type-card-arrow">
                  Select Sales &rarr;
                </span>
              </div>

              {/* 2. Purchase Card */}
              <div
                className={`calc-type-card ${voucherType === 'purchase' ? 'selected' : ''}`}
                onClick={() => {
                  setVoucherType('purchase');
                  setCurrentStep(2);
                }}
              >
                <div className="calc-type-card-icon">
                  <Truck size={28} />
                </div>
                <div className="calc-type-card-content">
                  <h4>Purchase</h4>
                  <p>Inward procurement, log / timber purchase from supplier or timber trader</p>
                </div>
                <span className="calc-type-card-arrow">
                  Select Purchase &rarr;
                </span>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 2: SELECT CUSTOMER TYPE (B2B vs B2C Selection Only)
            ========================================================================= */}
        {currentStep === 2 && (
          <div className="card calc-step-card">
            <div className="calc-step-header" style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
              <h3 className="calc-step-title" style={{ justifyContent: 'center', fontSize: '1.15rem' }}>
                <User size={18} color="var(--primary-600)" /> Select Customer Type
              </h3>
              <p className="calc-step-desc">
                Choose party category to proceed with customer details &amp; billing
              </p>
            </div>

            <div className="calc-type-choice-grid">
              {/* 1. Retail / Cash (B2C) Card */}
              <div
                className={`calc-type-card ${customerType === 'b2c' ? 'selected' : ''}`}
                onClick={() => {
                  setCustomerType('b2c');
                  setCurrentStep(3);
                }}
              >
                <div className="calc-type-card-icon">
                  <User size={28} />
                </div>
                <div className="calc-type-card-content">
                  <h4>Retail / Cash (B2C)</h4>
                  <p>Direct consumer, contractor or walk-in buyer without mandatory GST tax invoicing</p>
                </div>
                <span className="calc-type-card-arrow">
                  Select Retail (B2C) &rarr;
                </span>
              </div>

              {/* 2. Business GST (B2B) Card */}
              <div
                className={`calc-type-card ${customerType === 'b2b' ? 'selected' : ''}`}
                onClick={() => {
                  setCustomerType('b2b');
                  setCurrentStep(3);
                }}
              >
                <div className="calc-type-card-icon">
                  <Building size={28} />
                </div>
                <div className="calc-type-card-content">
                  <h4>Business GST (B2B)</h4>
                  <p>Registered enterprise or timber trader with 15-digit GSTIN lookup and tax invoice</p>
                </div>
                <span className="calc-type-card-arrow">
                  Select Business (B2B) &rarr;
                </span>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 3: BUYER (BILL TO) DETAILS (DYNAMIC B2C vs B2B)
            ========================================================================= */}
        {currentStep === 3 && (
          <div className="card calc-step-card">
            {/* Top Indicator: Bill to (Centered, Highlighted & Bold) */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border-light, #e2e8f0)', marginBottom: '0.45rem' }}>
              <span style={{
                fontSize: '0.88rem',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#1d4ed8',
                background: '#dbeafe',
                padding: '4px 18px',
                borderRadius: '6px',
                border: '1.5px solid #60a5fa',
                whiteSpace: 'nowrap',
                lineHeight: 1.25,
                boxShadow: '0 1px 3px rgba(29, 78, 216, 0.15)'
              }}>
                BILL TO
              </span>
            </div>

            {/* Customer Inputs Form */}
            {customerType === 'b2b' ? (
              /* =========================================================================
                 B2B ORDER:
                 1. Phone Number (Top)
                 2. GST Number Fetching
                 3. Company / Firm Name
                 4. Address / Delivery Site
                 5. Remaining Things (State & Code, Ref Number & Date)
                 ========================================================================= */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {/* 1. Phone Number (Top) */}
                <div style={{ position: 'relative' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <Phone size={14} color="var(--primary-600)" /> Phone Number:
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => handlePhoneInputChange(e.target.value)}
                    onFocus={() => {
                      if (customerPhone.trim().length >= 2) {
                        const digits = customerPhone.replace(/\D/g, '');
                        const all = getAllKnownCustomers();
                        const matches = all.filter(c => (c.phone || '').replace(/\D/g, '').includes(digits));
                        setPhoneSuggestions(matches);
                        setShowPhoneSuggestions(matches.length > 0);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowPhoneSuggestions(false), 250);
                      persistCurrentCustomer();
                    }}
                    style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                    placeholder=""
                  />
                  {/* Phone Suggestions */}
                  {showPhoneSuggestions && phoneSuggestions.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 99,
                        backgroundColor: 'var(--bg-card, #ffffff)',
                        border: '1.5px solid var(--border-medium, #cbd5e1)',
                        borderRadius: '6px',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        marginTop: '4px'
                      }}
                    >
                      <div style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', backgroundColor: 'var(--bg-subtle, #f1f5f9)', borderBottom: '1px solid var(--border-light)' }}>
                        Saved Contacts (Click to auto-fill)
                      </div>
                      {phoneSuggestions.map((c, i) => (
                        <div
                          key={i}
                          onMouseDown={() => handleSelectCustomer(c)}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-50, #f1f5f9)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                          style={{
                            padding: '0.5rem 0.65rem',
                            cursor: 'pointer',
                            borderBottom: i < phoneSuggestions.length - 1 ? '1px solid var(--border-light, #eee)' : 'none',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: '0.65rem', marginTop: '0.1rem', flexWrap: 'wrap', fontWeight: 600 }}>
                            {c.phone && <span>📞 {c.phone}</span>}
                            {c.gstin && <span style={{ fontWeight: 700, color: 'var(--primary-700)' }}>GST: {c.gstin}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. 15-Digit GST Number Fetching */}
                <div className="calc-gst-search-box" style={{ margin: 0 }}>
                  <div className="calc-gst-search-header">
                    <label className="calc-gst-search-label" style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                      <ShieldCheck size={15} color="var(--primary-600)" /> 15-Digit GST Number:
                    </label>
                    <span className="calc-gst-live-badge" style={{ fontWeight: 800 }}>
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
                      maxLength={15}
                      className="calc-gst-input"
                      placeholder=""
                      style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}
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
                      style={{ fontWeight: 800 }}
                    >
                      <Search size={15} />
                      <span>{isGstSearching ? 'Fetching...' : 'Fetch Details'}</span>
                    </button>
                  </div>

                  {gstSearchNotice && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', fontWeight: 800, color: gstSearchNotice.startsWith('✓') ? '#15803d' : '#b45309' }}>
                      {gstSearchNotice}
                    </div>
                  )}
                </div>

                {/* 3. Company / Firm Name */}
                <div style={{ position: 'relative' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <User size={14} color="var(--primary-600)" /> Company / Firm Name:
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
                    autoComplete="off"
                    placeholder=""
                    style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
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
                        border: '1.5px solid var(--border-medium, #cbd5e1)',
                        borderRadius: '6px',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        marginTop: '4px'
                      }}
                    >
                      <div style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', backgroundColor: 'var(--bg-subtle, #f1f5f9)', borderBottom: '1px solid var(--border-light)' }}>
                        Saved Companies (Click to auto-fill)
                      </div>
                      {customerSuggestions.map((c, i) => (
                        <div
                          key={i}
                          onMouseDown={() => handleSelectCustomer(c)}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-50, #f1f5f9)')}
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
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: '0.65rem', marginTop: '0.1rem', flexWrap: 'wrap', fontWeight: 600 }}>
                            {c.phone && <span>📞 {c.phone}</span>}
                            {c.gstin && <span style={{ fontWeight: 700, color: 'var(--primary-700)' }}>GST: {c.gstin}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Address / Delivery Site */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <MapPin size={14} color="var(--primary-600)" /> Address / Delivery Site:
                  </label>
                  <textarea
                    rows={1}
                    className="calc-address-textarea"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    onBlur={persistCurrentCustomer}
                    placeholder=""
                    style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* 5. Remaining Things: State & Code, Ref & Date */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
                  {/* State & Code */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                      <Truck size={14} color="var(--primary-600)" /> State / Code:
                    </label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        type="text"
                        value={destination}
                        placeholder=""
                        onChange={(e) => {
                          setDestination(e.target.value);
                          setCustomerState(e.target.value);
                        }}
                        onBlur={persistCurrentCustomer}
                        style={{ flex: 2, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                      <input
                        type="text"
                        value={customerStateCode}
                        onChange={(e) => setCustomerStateCode(e.target.value)}
                        onBlur={persistCurrentCustomer}
                        placeholder=""
                        style={{ width: '55px', textAlign: 'center', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>

                  {/* Ref & Date */}
                  <div className="calc-ref-date-row" style={{ margin: 0 }}>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                        <Hash size={14} color="var(--primary-600)" /> Ref Number:
                      </label>
                      <input
                        type="text"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        placeholder=""
                        style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                        <Calendar size={14} color="var(--primary-600)" /> Date:
                      </label>
                      <input
                        type="date"
                        value={measurementDate}
                        onChange={(e) => setMeasurementDate(e.target.value)}
                        style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* =========================================================================
                 B2C ORDER:
                 1. Phone Number (Top)
                 2. Customer Name
                 3. Address / Delivery Site
                 4. Remaining Things (GST Number Optional, State / Code, Ref Number, Date)
                 ========================================================================= */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {/* 1. Phone Number (Top) */}
                <div style={{ position: 'relative' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <Phone size={14} color="var(--primary-600)" /> Phone Number:
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => handlePhoneInputChange(e.target.value)}
                    onFocus={() => {
                      if (customerPhone.trim().length >= 2) {
                        const digits = customerPhone.replace(/\D/g, '');
                        const all = getAllKnownCustomers();
                        const matches = all.filter(c => (c.phone || '').replace(/\D/g, '').includes(digits));
                        setPhoneSuggestions(matches);
                        setShowPhoneSuggestions(matches.length > 0);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowPhoneSuggestions(false), 250);
                      persistCurrentCustomer();
                    }}
                    style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                    placeholder=""
                  />
                  {/* Phone Suggestions */}
                  {showPhoneSuggestions && phoneSuggestions.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 99,
                        backgroundColor: 'var(--bg-card, #ffffff)',
                        border: '1.5px solid var(--border-medium, #cbd5e1)',
                        borderRadius: '6px',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        marginTop: '4px'
                      }}
                    >
                      <div style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', backgroundColor: 'var(--bg-subtle, #f1f5f9)', borderBottom: '1px solid var(--border-light)' }}>
                        Saved Contacts (Click to auto-fill)
                      </div>
                      {phoneSuggestions.map((c, i) => (
                        <div
                          key={i}
                          onMouseDown={() => handleSelectCustomer(c)}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-50, #f1f5f9)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                          style={{
                            padding: '0.5rem 0.65rem',
                            cursor: 'pointer',
                            borderBottom: i < phoneSuggestions.length - 1 ? '1px solid var(--border-light, #eee)' : 'none',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: '0.65rem', marginTop: '0.1rem', flexWrap: 'wrap', fontWeight: 600 }}>
                            {c.phone && <span>📞 {c.phone}</span>}
                            {c.gstin && <span style={{ fontWeight: 700, color: 'var(--primary-700)' }}>GST: {c.gstin}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Customer Name (Below Phone) */}
                <div style={{ position: 'relative' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <User size={14} color="var(--primary-600)" /> Customer Name:
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
                    autoComplete="off"
                    placeholder=""
                    style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
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
                        border: '1.5px solid var(--border-medium, #cbd5e1)',
                        borderRadius: '6px',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        marginTop: '4px'
                      }}
                    >
                      <div style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', backgroundColor: 'var(--bg-subtle, #f1f5f9)', borderBottom: '1px solid var(--border-light)' }}>
                        Saved Customers (Click to auto-fill)
                      </div>
                      {customerSuggestions.map((c, i) => (
                        <div
                          key={i}
                          onMouseDown={() => handleSelectCustomer(c)}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-50, #f1f5f9)')}
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
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: '0.65rem', marginTop: '0.1rem', flexWrap: 'wrap', fontWeight: 600 }}>
                            {c.phone && <span>📞 {c.phone}</span>}
                            {c.gstin && <span style={{ fontWeight: 700, color: 'var(--primary-700)' }}>GST: {c.gstin}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Address / Delivery Site (Below Name) */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <MapPin size={14} color="var(--primary-600)" /> Address / Delivery Site:
                  </label>
                  <textarea
                    rows={1}
                    className="calc-address-textarea"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    onBlur={persistCurrentCustomer}
                    placeholder=""
                    style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* 4. Remaining Things: Optional GST, State & Code, Ref & Date */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
                  {/* B2C Optional GST Number */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                      <FileText size={14} color="var(--primary-600)" /> GST Number (Optional):
                    </label>
                    <input
                      type="text"
                      value={customerGstin}
                      onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                      onBlur={persistCurrentCustomer}
                      placeholder=""
                      style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                    />
                  </div>

                  {/* State & Code */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                      <Truck size={14} color="var(--primary-600)" /> State / Code:
                    </label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        type="text"
                        value={destination}
                        placeholder=""
                        onChange={(e) => {
                          setDestination(e.target.value);
                          setCustomerState(e.target.value);
                        }}
                        onBlur={persistCurrentCustomer}
                        style={{ flex: 2, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                      <input
                        type="text"
                        value={customerStateCode}
                        onChange={(e) => setCustomerStateCode(e.target.value)}
                        onBlur={persistCurrentCustomer}
                        placeholder=""
                        style={{ width: '55px', textAlign: 'center', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>

                  {/* Ref Number & Date */}
                  <div className="calc-ref-date-row" style={{ margin: 0 }}>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                        <Hash size={14} color="var(--primary-600)" /> Ref Number:
                      </label>
                      <input
                        type="text"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        placeholder=""
                        style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                        <Calendar size={14} color="var(--primary-600)" /> Date:
                      </label>
                      <input
                        type="date"
                        value={measurementDate}
                        onChange={(e) => setMeasurementDate(e.target.value)}
                        style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            STEP 4: CONSIGNEE (SHIP TO) DETAILS (DYNAMIC B2C vs B2B)
            ========================================================================= */}
        {currentStep === 4 && (
          <div className="card calc-step-card">
            {/* Top Indicator: Ship to (Centered, Highlighted & Bold) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border-light, #e2e8f0)', marginBottom: '0.45rem' }}>
              <span style={{
                fontSize: '0.88rem',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#0284c7',
                background: '#e0f2fe',
                padding: '4px 18px',
                borderRadius: '6px',
                border: '1.5px solid #38bdf8',
                whiteSpace: 'nowrap',
                lineHeight: 1.25,
                boxShadow: '0 1px 3px rgba(2, 132, 199, 0.15)'
              }}>
                SHIP TO
              </span>

              {/* Action: Copy from Bill To Button */}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setConsigneeName(customerName);
                  setConsigneePhone(customerPhone);
                  setConsigneeAddress(customerAddress);
                  setConsigneeGstin(customerGstin);
                  setConsigneeStateCode(customerStateCode || '29');
                  setConsigneeState(destination || customerState || 'Karnataka');
                  setIsShipToTouched(true);
                  setShipToCopyNotice('✓ Copied from Bill To');
                  setTimeout(() => setShipToCopyNotice(null), 2500);
                }}
                style={{ fontSize: '0.68rem', padding: '2px 8px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap', height: '24px', minHeight: '24px' }}
              >
                <span>📋 Copy from Bill To</span>
              </button>
            </div>

            {shipToCopyNotice && (
              <div style={{ padding: '0.4rem 0.7rem', background: '#dcfce7', color: '#15803d', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800 }}>
                {shipToCopyNotice}
              </div>
            )}

            {customerType === 'b2b' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* 1. Phone Number */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <Phone size={14} color="var(--primary-600)" /> Phone Number:
                  </label>
                  <input
                    type="tel"
                    value={consigneePhone}
                    onChange={(e) => {
                      setIsShipToTouched(true);
                      setConsigneePhone(e.target.value.replace(/[^0-9+ ]/g, ''));
                    }}
                    placeholder=""
                    style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* 2. 15-Digit GST Number Fetching */}
                <div className="calc-gst-search-box" style={{ margin: 0 }}>
                  <div className="calc-gst-search-header">
                    <label className="calc-gst-search-label" style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                      <ShieldCheck size={15} color="var(--primary-600)" /> 15-Digit GST Number:
                    </label>
                    <span className="calc-gst-live-badge" style={{ fontWeight: 800 }}>
                      Live GSTIN API Powered
                    </span>
                  </div>
                  <div className="calc-gst-search-row">
                    <input
                      type="text"
                      value={consigneeGstin}
                      onChange={(e) => {
                        setIsShipToTouched(true);
                        const val = e.target.value.toUpperCase();
                        setConsigneeGstin(val);
                        if (val.length === 15 && val !== consigneeGstin) {
                          handleSearchConsigneeGst(val);
                        }
                      }}
                      maxLength={15}
                      className="calc-gst-input"
                      placeholder=""
                      style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchConsigneeGst();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary calc-gst-btn"
                      onClick={() => handleSearchConsigneeGst()}
                      disabled={isShipToGstSearching || !consigneeGstin.trim()}
                      style={{ fontWeight: 800 }}
                    >
                      <Search size={15} />
                      <span>{isShipToGstSearching ? 'Fetching...' : 'Fetch Details'}</span>
                    </button>
                  </div>

                  {shipToGstNotice && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', fontWeight: 800, color: shipToGstNotice.startsWith('✓') ? '#15803d' : '#b45309' }}>
                      {shipToGstNotice}
                    </div>
                  )}
                </div>

                {/* 3. Company / Firm Name */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <Building size={14} color="var(--primary-600)" /> Receiving Company / Firm Name:
                  </label>
                  <input
                    type="text"
                    value={consigneeName}
                    onChange={(e) => {
                      setIsShipToTouched(true);
                      setConsigneeName(e.target.value);
                    }}
                    placeholder=""
                    style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* 4. Address / Delivery Site */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <MapPin size={14} color="var(--primary-600)" /> Delivery Site / Shipping Address:
                  </label>
                  <textarea
                    rows={1}
                    className="calc-address-textarea"
                    value={consigneeAddress}
                    onChange={(e) => {
                      setIsShipToTouched(true);
                      setConsigneeAddress(e.target.value);
                    }}
                    placeholder=""
                    style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* 5. District & State / Code */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                      <MapPin size={14} color="var(--primary-600)" /> District:
                    </label>
                    <input
                      type="text"
                      value={consigneeDistrict}
                      onChange={(e) => {
                        setIsShipToTouched(true);
                        setConsigneeDistrict(e.target.value);
                      }}
                      placeholder=""
                      style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                      <Truck size={14} color="var(--primary-600)" /> State / Code:
                    </label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        type="text"
                        value={consigneeState}
                        placeholder=""
                        onChange={(e) => {
                          setIsShipToTouched(true);
                          setConsigneeState(e.target.value);
                        }}
                        style={{ flex: 2, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                      <input
                        type="text"
                        value={consigneeStateCode}
                        onChange={(e) => {
                          setIsShipToTouched(true);
                          setConsigneeStateCode(e.target.value);
                        }}
                        placeholder=""
                        style={{ width: '55px', textAlign: 'center', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* 1. Phone Number */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <Phone size={14} color="var(--primary-600)" /> Phone Number:
                  </label>
                  <input
                    type="tel"
                    value={consigneePhone}
                    onChange={(e) => {
                      setIsShipToTouched(true);
                      setConsigneePhone(e.target.value.replace(/[^0-9+ ]/g, ''));
                    }}
                    placeholder=""
                    style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* 2. Customer Name */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <User size={14} color="var(--primary-600)" /> Receiving Person / Customer Name:
                  </label>
                  <input
                    type="text"
                    value={consigneeName}
                    onChange={(e) => {
                      setIsShipToTouched(true);
                      setConsigneeName(e.target.value);
                    }}
                    placeholder=""
                    style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* 3. Address / Delivery Site */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <MapPin size={14} color="var(--primary-600)" /> Delivery Site / Shipping Address:
                  </label>
                  <textarea
                    rows={1}
                    className="calc-address-textarea"
                    value={consigneeAddress}
                    onChange={(e) => {
                      setIsShipToTouched(true);
                      setConsigneeAddress(e.target.value);
                    }}
                    placeholder=""
                    style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* 4. GST Number Optional, District & State / Code */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                      <ShieldCheck size={14} color="var(--primary-600)" /> GST Number (Optional):
                    </label>
                    <input
                      type="text"
                      value={consigneeGstin}
                      onChange={(e) => {
                        setIsShipToTouched(true);
                        setConsigneeGstin(e.target.value.toUpperCase());
                      }}
                      placeholder=""
                      style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                      <MapPin size={14} color="var(--primary-600)" /> District:
                    </label>
                    <input
                      type="text"
                      value={consigneeDistrict}
                      onChange={(e) => {
                        setIsShipToTouched(true);
                        setConsigneeDistrict(e.target.value);
                      }}
                      placeholder=""
                      style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                      <Truck size={14} color="var(--primary-600)" /> State / Code:
                    </label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        type="text"
                        value={consigneeState}
                        placeholder=""
                        onChange={(e) => {
                          setIsShipToTouched(true);
                          setConsigneeState(e.target.value);
                        }}
                        style={{ flex: 2, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                      <input
                        type="text"
                        value={consigneeStateCode}
                        onChange={(e) => {
                          setIsShipToTouched(true);
                          setConsigneeStateCode(e.target.value);
                        }}
                        placeholder=""
                        style={{ width: '55px', textAlign: 'center', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            STEP 5: TIMBER CALCULATOR (MEASUREMENTS, WOOD DROPDOWN & TALLY)
            ========================================================================= */}
        {currentStep === 5 && (
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

                <div className="calc-step2-actions-block" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', justifyContent: 'space-between' }}>
                  <span className="badge calc-step2-total-badge" style={{ backgroundColor: 'var(--primary-100)', color: 'var(--primary-800)', border: '1px solid var(--primary-200)', fontSize: '0.74rem', padding: '0.22rem 0.5rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                    <span className="mobile-hide">{customerName ? `${customerName} • ` : ''}</span>
                    Total: {formatValue(totals.totalCft, 3)} CFT &bull; ₹ {formatIndianCurrency(totals.totalAmount || 0)}
                  </span>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (items.length > 0 && !window.confirm('Start a new clean sheet?')) return;
                      handleNewCleanSheet();
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.74rem', fontWeight: 700, padding: '0.22rem 0.55rem', whiteSpace: 'nowrap' }}
                  >
                    <FilePlus size={13} color="var(--primary-600)" />
                    <span className="mobile-hide">New Sheet</span>
                    <span className="mobile-show">New</span>
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
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 6: PLANING CHARGES (WITH IMAGE)
            ========================================================================= */}
        {currentStep === 6 && (
          <div className="card calc-step-card">
            {/* Visual Service Banner */}
            <div className="calc-service-banner">
              <img
                src="https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=1200&q=80"
                alt="Planing & Surface Milling"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="calc-service-banner-overlay">
                <span className="calc-service-banner-tag">
                  <Sparkles size={12} /> Surface Finishing
                </span>
                <h3 className="calc-service-banner-title">Planing &amp; Milling Works</h3>
              </div>
            </div>

            {/* Input Card */}
            <div className="calc-charge-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
                  <Sparkles size={15} color="var(--primary-600)" /> Planing Charges (₹):
                </label>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary-700)' }}>
                  ₹ {formatIndianCurrency(planingCharges)}
                </span>
              </div>
              <div style={{ position: 'relative', width: '100%' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-muted)' }}>
                  ₹
                </span>
                <input
                  type="number"
                  className="calc-prefixed-input"
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
                  style={{ width: '100%', fontSize: '1.15rem', fontWeight: 700, borderRadius: '8px', border: '1.5px solid var(--border-medium)' }}
                />
              </div>

              {/* Compact Volume & Rate info */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--primary-50, #f8f6f0)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '0.35rem 0.65rem', marginTop: '0.5rem', marginBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Total Timber Volume:
                </span>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: 'var(--primary-800)' }}>
                  {totals.totalCft > 0 ? totals.totalCft.toFixed(3) : '0.000'} CFT
                </span>
              </div>

              {/* Compact Rate per CFT */}
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    className="calc-prefixed-input"
                    value={planingRatePerCft === 0 ? '' : planingRatePerCft}
                    onChange={(e) => {
                      const rate = Math.max(0, parseFloat(e.target.value) || 0);
                      setPlaningRatePerCft(rate);
                      const calculated = Math.round(totals.totalCft * rate * 100) / 100;
                      setPlaningCharges(calculated);
                    }}
                    style={{ width: '100%', fontSize: '0.95rem', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-medium)' }}
                  />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  / CFT
                </span>
              </div>

              {/* Quick Rate Buttons */}
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
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
                      fontSize: '0.78rem',
                      padding: '0.2rem 0.5rem',
                      background: planingRatePerCft === r ? 'var(--primary-100, #eedfc8)' : 'var(--bg-card)',
                      borderColor: planingRatePerCft === r ? 'var(--primary-600)' : 'var(--border-medium)',
                      fontWeight: planingRatePerCft === r ? 700 : 600,
                      borderRadius: '5px'
                    }}
                  >
                    ₹{r}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Running Total Banner */}
            <div style={{ background: 'var(--bg-card)', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px dashed var(--primary-300)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Timber Subtotal: <strong style={{ color: 'var(--text-main)', fontWeight: 700 }}>₹{formatIndianCurrency(timberSubtotal)}</strong>
              </span>
              <strong style={{ fontSize: '0.88rem', color: 'var(--primary-800)', fontWeight: 700 }}>
                Planing: ₹{formatIndianCurrency(planingCharges)}
              </strong>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 7: CARPENTRY CHARGES (WITH IMAGE)
            ========================================================================= */}
        {currentStep === 7 && (
          <div className="card calc-step-card">
            {/* Visual Service Banner */}
            <div className="calc-service-banner">
              <img
                src="https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1200&q=80"
                alt="Carpentry Works"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="calc-service-banner-overlay">
                <span className="calc-service-banner-tag">
                  <Scissors size={12} /> Carpentry &amp; Woodcraft
                </span>
                <h3 className="calc-service-banner-title">Carpentry &amp; Woodworking</h3>
              </div>
            </div>

            {/* Input Card */}
            <div className="calc-charge-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
                  <Scissors size={15} color="var(--primary-600)" /> Carpentry Charges (₹):
                </label>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary-700)' }}>
                  ₹ {formatIndianCurrency(carpentryCharges)}
                </span>
              </div>
              <div style={{ position: 'relative', width: '100%' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-muted)' }}>
                  ₹
                </span>
                <input
                  type="number"
                  className="calc-prefixed-input"
                  value={carpentryCharges === 0 ? '' : carpentryCharges}
                  onChange={(e) => setCarpentryCharges(Math.max(0, Number(e.target.value) || 0))}
                  style={{ width: '100%', fontSize: '1.15rem', fontWeight: 700, borderRadius: '8px', border: '1.5px solid var(--border-medium)' }}
                />
              </div>
              <div className="calc-charge-quick-chips" style={{ display: 'flex', gap: '0.35rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
                {[500, 1000, 2000, 5000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCarpentryCharges(amt)}
                    style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.55rem', background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: '6px' }}
                  >
                    +₹{amt}
                  </button>
                ))}
                {carpentryCharges > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCarpentryCharges(0)}
                    style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.55rem', color: 'var(--danger-500)', borderRadius: '6px' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Quick Running Total Banner */}
            <div style={{ background: 'var(--bg-card)', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px dashed var(--primary-300)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Subtotal before Carpentry: <strong style={{ color: 'var(--text-main)', fontWeight: 700 }}>₹{formatIndianCurrency(timberSubtotal + planingCharges)}</strong>
              </span>
              <strong style={{ fontSize: '0.88rem', color: 'var(--primary-800)', fontWeight: 700 }}>
                Carpentry: ₹{formatIndianCurrency(carpentryCharges)}
              </strong>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 8: TRANSPORTATION CHARGES (WITH IMAGE)
            ========================================================================= */}
        {currentStep === 8 && (
          <div className="card calc-step-card">
            {/* Visual Service Banner */}
            <div className="calc-service-banner">
              <img
                src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=800&q=80"
                alt="Transportation & Delivery"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="calc-service-banner-overlay">
                <span className="calc-service-banner-tag">
                  <Truck size={12} /> Logistics &amp; Transport
                </span>
                <h3 className="calc-service-banner-title">Transportation &amp; Delivery</h3>
              </div>
            </div>

            {/* Input Card */}
            <div className="calc-charge-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
                  <Truck size={15} color="var(--primary-600)" /> Transportation Charges (₹):
                </label>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary-700)' }}>
                  ₹ {formatIndianCurrency(transportationCharges)}
                </span>
              </div>
              <div style={{ position: 'relative', width: '100%' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-muted)' }}>
                  ₹
                </span>
                <input
                  type="number"
                  className="calc-prefixed-input"
                  value={transportationCharges === 0 ? '' : transportationCharges}
                  onChange={(e) => setTransportationCharges(Math.max(0, Number(e.target.value) || 0))}
                  style={{ width: '100%', fontSize: '1.15rem', fontWeight: 700, borderRadius: '8px', border: '1.5px solid var(--border-medium)' }}
                />
              </div>
              <div className="calc-charge-quick-chips" style={{ display: 'flex', gap: '0.35rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
                {[1000, 2000, 3500, 5000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTransportationCharges(amt)}
                    style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.55rem', background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: '6px' }}
                  >
                    +₹{amt}
                  </button>
                ))}
                {transportationCharges > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTransportationCharges(0)}
                    style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.55rem', color: 'var(--danger-500)', borderRadius: '6px' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Quick Running Total Banner */}
            <div style={{ background: 'var(--bg-card)', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px dashed var(--primary-300)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Subtotal before Transport: <strong style={{ color: 'var(--text-main)', fontWeight: 700 }}>₹{formatIndianCurrency(timberSubtotal + planingCharges + carpentryCharges)}</strong>
              </span>
              <strong style={{ fontSize: '0.88rem', color: 'var(--primary-800)', fontWeight: 700 }}>
                Transport: ₹{formatIndianCurrency(transportationCharges)}
              </strong>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 9: OTHER CHARGES (WITH IMAGE)
            ========================================================================= */}
        {currentStep === 9 && (
          <div className="card calc-step-card">
            {/* Visual Service Banner */}
            <div className="calc-service-banner">
              <img
                src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80"
                alt="Other Miscellaneous Charges"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="calc-service-banner-overlay">
                <span className="calc-service-banner-tag">
                  <Layers size={12} /> Additional Handling &amp; Services
                </span>
                <h3 className="calc-service-banner-title">Other Miscellaneous Charges</h3>
              </div>
            </div>

            {/* Input Card */}
            <div className="calc-charge-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
                  <Layers size={15} color="var(--primary-600)" /> Other Charges (₹):
                </label>
                {otherCharges > 0 && (
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary-700)' }}>
                    ₹ {formatIndianCurrency(otherCharges)}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', width: '100%' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-muted)' }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    className="calc-prefixed-input"
                    value={otherCharges === 0 ? '' : otherCharges}
                    onChange={(e) => setOtherCharges(Math.max(0, Number(e.target.value) || 0))}
                    style={{ width: '100%', fontSize: '1.15rem', fontWeight: 700, borderRadius: '8px', border: '1.5px solid var(--border-medium)' }}
                  />
                </div>

                <div>
                  <input
                    type="text"
                    value={otherChargesLabel}
                    onChange={(e) => setOtherChargesLabel(e.target.value)}
                    style={{ width: '100%', fontSize: '0.88rem', fontWeight: 600, padding: '0.4rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-medium)' }}
                  />
                </div>
              </div>

              <div className="calc-charge-quick-chips" style={{ display: 'flex', gap: '0.35rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
                {[500, 1000, 2000, 5000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setOtherCharges(amt)}
                    style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.55rem', background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: '6px' }}
                  >
                    +₹{amt}
                  </button>
                ))}
                {otherCharges > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setOtherCharges(0);
                      setOtherChargesLabel('');
                    }}
                    style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.55rem', color: 'var(--danger-500)', borderRadius: '6px' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Quick Running Total Banner */}
            <div style={{ background: 'var(--bg-card)', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px dashed var(--primary-300)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Subtotal before Other: <strong style={{ color: 'var(--text-main)', fontWeight: 700 }}>₹{formatIndianCurrency(timberSubtotal + carpentryCharges + transportationCharges + planingCharges)}</strong>
              </span>
              <strong style={{ fontSize: '0.88rem', color: 'var(--primary-800)', fontWeight: 700 }}>
                Other: ₹{formatIndianCurrency(otherCharges)}
              </strong>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 10: GST TAX (WITH IMAGE)
            ========================================================================= */}
        {currentStep === 10 && (
          <div className="card calc-step-card">
            {/* Visual Service Banner */}
            <div className="calc-service-banner">
              <img
                src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80"
                alt="GST Tax Calculation"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="calc-service-banner-overlay">
                <span className="calc-service-banner-tag">
                  <Percent size={12} /> Tax Compliance &amp; Invoicing
                </span>
                <h3 className="calc-service-banner-title">Goods &amp; Services Tax (GST)</h3>
              </div>
            </div>

            {/* Input Card */}
            <div className="calc-charge-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
                  <Percent size={15} color="var(--primary-600)" /> GST Taxable Base (₹):
                </label>
                {gstAmount > 0 && (
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary-800)' }}>
                    +₹{formatIndianCurrency(gstAmount)} ({gstPercent}%)
                  </span>
                )}
              </div>

              {/* Taxable Base Amount input */}
              <div style={{ position: 'relative', width: '100%', marginBottom: '0.5rem' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-muted)' }}>
                  ₹
                </span>
                <input
                  type="number"
                  className="calc-prefixed-input"
                  placeholder={formatIndianCurrency(subtotalWithCharges)}
                  value={customGstTaxableAmount === 0 ? '' : customGstTaxableAmount}
                  onChange={(e) => setCustomGstTaxableAmount(Math.max(0, Number(e.target.value) || 0))}
                  style={{ width: '100%', fontSize: '1.15rem', fontWeight: 700, borderRadius: '8px', border: '1.5px solid var(--border-medium)' }}
                />
              </div>

              {/* GST Rate Selection Title & Buttons */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem', display: 'block' }}>
                  Select GST Rate:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))', gap: '0.35rem' }}>
                  {[0, 5, 12, 18, 28].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => {
                        setIsCustomGstRate(false);
                        setGstPercent(rate);
                      }}
                      className="btn"
                      style={{
                        padding: '0.4rem 0.35rem',
                        fontSize: '0.92rem',
                        fontWeight: 700,
                        borderRadius: '6px',
                        backgroundColor: (!isCustomGstRate && gstPercent === rate) ? 'var(--primary-800, #1e3a8a)' : 'var(--bg-card)',
                        color: (!isCustomGstRate && gstPercent === rate) ? '#ffffff' : 'var(--text-main)',
                        borderColor: (!isCustomGstRate && gstPercent === rate) ? 'var(--primary-800)' : 'var(--border-medium)'
                      }}
                    >
                      {rate}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsCustomGstRate(!isCustomGstRate)}
                    className="btn"
                    style={{
                      padding: '0.4rem 0.35rem',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      borderRadius: '6px',
                      backgroundColor: isCustomGstRate ? 'var(--primary-800, #1e3a8a)' : 'var(--bg-card)',
                      color: isCustomGstRate ? '#ffffff' : 'var(--text-main)',
                      borderColor: isCustomGstRate ? 'var(--primary-800)' : 'var(--border-medium)'
                    }}
                  >
                    {isCustomGstRate ? `${gstPercent}%` : 'Custom'}
                  </button>
                </div>
              </div>

              {/* Custom GST % Input Field */}
              {isCustomGstRate && (
                <div style={{ padding: '0.45rem 0.65rem', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--primary-400)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>Enter Custom GST %:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={gstPercent}
                    onChange={(e) => setGstPercent(Math.max(0, Number(e.target.value) || 0))}
                    style={{ width: '75px', fontWeight: 700, fontSize: '0.95rem', textAlign: 'center', padding: '0.3rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border-medium)' }}
                  />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>%</span>
                </div>
              )}
            </div>

            {/* Quick Running Total Banner */}
            <div style={{ background: 'var(--bg-card)', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px dashed var(--primary-300)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Taxable Base: <strong style={{ color: 'var(--text-main)', fontWeight: 700 }}>₹{formatIndianCurrency(gstTaxableBase)}</strong>
              </span>
              <strong style={{ fontSize: '0.88rem', color: 'var(--primary-800)', fontWeight: 700 }}>
                GST ({gstPercent}%): +₹{formatIndianCurrency(gstAmount)}
              </strong>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 11: DISCOUNT (WITH IMAGE)
            ========================================================================= */}
        {currentStep === 11 && (
          <div className="card calc-step-card">
            {/* Visual Service Banner */}
            <div className="calc-service-banner">
              <img
                src="https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=80"
                alt="Discount & Offers"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="calc-service-banner-overlay">
                <span className="calc-service-banner-tag">
                  <Tag size={12} /> Special Offers &amp; Concessions
                </span>
                <h3 className="calc-service-banner-title">Customer Discount &amp; Concession</h3>
              </div>
            </div>

            {/* Input Card */}
            <div className="calc-charge-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
                  <Tag size={15} color="var(--primary-600)" /> Discount Value:
                </label>

                {/* Mode Toggle: Rupees vs Percentage */}
                <div style={{ display: 'inline-flex', borderRadius: '6px', border: '1px solid var(--border-medium)', overflow: 'hidden', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => setDiscountType('rupees')}
                    style={{
                      padding: '0.3rem 0.65rem',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      backgroundColor: discountType === 'rupees' ? 'var(--primary-800, #1e3a8a)' : 'var(--bg-subtle)',
                      color: discountType === 'rupees' ? '#fff' : 'var(--text-main)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Flat ₹ (Rupees)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percentage')}
                    style={{
                      padding: '0.3rem 0.65rem',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      backgroundColor: discountType === 'percentage' ? 'var(--primary-800, #1e3a8a)' : 'var(--bg-subtle)',
                      color: discountType === 'percentage' ? '#fff' : 'var(--text-main)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    % Percentage
                  </button>
                </div>
              </div>

              {/* Discount Input */}
              <div style={{ position: 'relative', width: '100%' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-muted)' }}>
                  {discountType === 'percentage' ? '%' : '₹'}
                </span>
                <input
                  type="number"
                  className="calc-prefixed-input"
                  value={discountValue === 0 ? '' : discountValue}
                  onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value) || 0))}
                  style={{ width: '100%', fontSize: '1.15rem', fontWeight: 700, borderRadius: '8px', border: '1.5px solid var(--border-medium)' }}
                />
              </div>

              {/* Quick Chips */}
              <div className="calc-charge-quick-chips" style={{ display: 'flex', gap: '0.35rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
                {discountType === 'rupees' ? (
                  [500, 1000, 2000, 5000, 10000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDiscountValue(amt)}
                      style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.55rem', background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: '6px' }}
                    >
                      -₹{amt}
                    </button>
                  ))
                ) : (
                  [2, 5, 10, 15, 20].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDiscountValue(pct)}
                      style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.55rem', background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: '6px' }}
                    >
                      {pct}%
                    </button>
                  ))
                )}
                {discountValue > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setDiscountValue(0)}
                    style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.55rem', color: 'var(--danger-500)', borderRadius: '6px' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Quick Running Total Banner */}
            <div style={{ background: 'var(--bg-card)', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px dashed var(--primary-300)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--danger-600, #dc2626)', fontWeight: 700 }}>
                Discount Deducted: -₹{formatIndianCurrency(discountAmount)}
              </span>
              <strong style={{ fontSize: '0.92rem', color: 'var(--primary-800)', fontWeight: 700 }}>
                Total Payable: ₹{formatIndianCurrency(finalGrandTotal)}
              </strong>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 12: ORDER / SORTING OF TIMBER ENTRIES
            Width (IN) - Ascending, Thickness (IN) - Descending, Length (FT) - Descending
            ========================================================================= */}
        {currentStep === 12 && (
          <div className="card calc-step-card">
            <div className="calc-step-header">
              <h3 className="calc-step-title">
                <Layers size={17} color="var(--primary-600)" /> Timber Species &amp; Mill Dimension Sorting
              </h3>
              <p className="calc-step-desc">
                Entries grouped by <strong>Wood Species</strong>, then sorted strictly by <strong>Width Ascending</strong> and <strong>Length Descending</strong> for saw mill tally
              </p>
            </div>

            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--text-muted)' }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>No timber measurements entered yet.</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCurrentStep(5)}
                  style={{ marginTop: '0.65rem', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Go to Timber Calculator to add timber entries
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {timberWoodGroups.map((group) => (
                  <div
                    key={group.woodType}
                    style={{
                      border: '1px solid var(--border-medium)',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      backgroundColor: 'var(--bg-card)'
                    }}
                  >
                    {/* Wood Species Group Header */}
                    <div
                      style={{
                        backgroundColor: 'var(--primary-50, #fcf7ee)',
                        borderBottom: '1px solid var(--border-medium)',
                        padding: '0.5rem 0.75rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.35rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ backgroundColor: 'var(--primary-700)', color: '#fff', fontSize: '0.8rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', letterSpacing: '0.04em' }}>
                          {group.woodType}
                        </span>
                        <strong style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>
                          {group.totalPieces} Pcs &bull; {formatValue(group.totalCft, 3)} CFT
                        </strong>
                      </div>
                      <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--primary-800)' }}>
                        ₹ {formatIndianCurrency(group.totalAmount)}
                      </span>
                    </div>

                    {/* Desktop View Table */}
                    <div className="mobile-hide" style={{ width: '100%' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '0.35rem 0.5rem', width: '36px' }}>#</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center', width: '68px' }}>Length (ft)</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center', width: '68px' }}>Width (in)</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center', width: '68px' }}>Thick (in)</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center', width: '60px' }}>Pieces</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center', width: '90px' }}>CFT / SQFT</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center', width: '85px' }}>Rate (₹)</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', width: '95px' }}>Amount (₹)</th>
                            <th style={{ padding: '0.35rem 0.5rem', width: '32px', textAlign: 'center' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((it, idx) => {
                            const isSqft = (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit !== 'CFT';
                            const defaultRowRate = isSqft ? 120 : ratePerCft;
                            const rowRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
                            const mult = isSqft ? it.sqft : it.cft;
                            const rowAmount = (typeof it.amount === 'number' && it.amount > 0) ? it.amount : Math.round(mult * rowRate * 100) / 100;
                            return (
                              <tr
                                key={it.id || idx}
                                style={{
                                  borderBottom: idx < group.items.length - 1 ? '1px solid var(--border-light)' : 'none',
                                  backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'
                                }}
                              >
                                <td style={{ padding: '0.35rem 0.5rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                                  {it.serialNumber || idx + 1}
                                </td>
                                <td style={{ padding: '0.25rem 0.3rem', textAlign: 'center' }}>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    placeholder=""
                                    className="calc-input tally-cell-input"
                                    value={it.lengthFeet}
                                    onChange={(e) => handleStep8UpdateItem(it.id, 'lengthFeet', e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    style={{ width: '58px', padding: '0.22rem 0.3rem', textAlign: 'center', fontWeight: 800 }}
                                  />
                                </td>
                                <td style={{ padding: '0.25rem 0.3rem', textAlign: 'center' }}>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    placeholder=""
                                    className="calc-input tally-cell-input"
                                    value={it.widthInches}
                                    onChange={(e) => handleStep8UpdateItem(it.id, 'widthInches', e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    style={{ width: '58px', padding: '0.22rem 0.3rem', textAlign: 'center', fontWeight: 800 }}
                                  />
                                </td>
                                <td style={{ padding: '0.25rem 0.3rem', textAlign: 'center' }}>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    placeholder=""
                                    className="calc-input tally-cell-input"
                                    value={it.thicknessInches}
                                    onChange={(e) => handleStep8UpdateItem(it.id, 'thicknessInches', e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    style={{ width: '58px', padding: '0.22rem 0.3rem', textAlign: 'center', fontWeight: 800 }}
                                  />
                                </td>
                                <td style={{ padding: '0.25rem 0.3rem', textAlign: 'center' }}>
                                  <input
                                    type="number"
                                    step="1"
                                    min="1"
                                    placeholder=""
                                    className="calc-input tally-cell-input"
                                    value={it.pieces}
                                    onChange={(e) => handleStep8UpdateItem(it.id, 'pieces', e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    style={{ width: '50px', padding: '0.22rem 0.3rem', textAlign: 'center', fontWeight: 800 }}
                                  />
                                </td>
                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center', fontWeight: 800, color: 'var(--primary-700)' }}>
                                  {isSqft ? `${formatValue(it.sqft, 2)} SQFT` : `${formatValue(it.cft, 3)} CFT`}
                                </td>
                                <td style={{ padding: '0.25rem 0.3rem', textAlign: 'center' }}>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    placeholder=""
                                    className="calc-input tally-cell-input"
                                    value={(it.rate as any) === '' ? '' : (typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate)}
                                    onChange={(e) => handleStep8UpdateItem(it.id, 'rate', e.target.value)}
                                    onBlur={() => {
                                      if ((it.rate as any) === '' || it.rate === undefined || it.rate === null) {
                                        handleStep8UpdateItem(it.id, 'rate', defaultRowRate.toString());
                                      }
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    style={{ width: '68px', padding: '0.22rem 0.3rem', textAlign: 'center', fontWeight: 800 }}
                                  />
                                </td>
                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--primary-900)', fontFamily: 'var(--font-mono)' }}>
                                  ₹{formatIndianCurrency(rowAmount)}
                                </td>
                                <td style={{ padding: '0.25rem 0.3rem', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    title="Delete row"
                                    onClick={() => handleStep8DeleteRow(it.id)}
                                    style={{ color: 'var(--danger-500, #dc2626)', padding: '0.15rem', minWidth: 0 }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View: Clean 2-Line Rows with Zero Horizontal Scroll */}
                    <div className="mobile-show" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.35rem', width: '100%', boxSizing: 'border-box' }}>
                      {/* Mobile Mini Header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: 'var(--bg-subtle, #f1f5f9)',
                          padding: '0.3rem 0.45rem',
                          borderRadius: '5px',
                          fontSize: '0.67rem',
                          fontWeight: 800,
                          color: 'var(--text-main)',
                          textTransform: 'uppercase'
                        }}
                      >
                        <div style={{ width: '28px' }}>#</div>
                        <div style={{ display: 'flex', gap: '0.25rem', flex: 1, justifyContent: 'center' }}>
                          <span style={{ width: '42px', textAlign: 'center' }}>L (ft)</span>
                          <span style={{ width: '42px', textAlign: 'center' }}>W (in)</span>
                          <span style={{ width: '42px', textAlign: 'center' }}>T (in)</span>
                          <span style={{ width: '38px', textAlign: 'center' }}>Pcs</span>
                        </div>
                        <div style={{ width: '24px', textAlign: 'center' }}>Del</div>
                      </div>

                      {/* Mobile Cards List */}
                      {group.items.map((it, idx) => {
                        const isSqft = (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit !== 'CFT';
                        const defaultRowRate = isSqft ? 120 : ratePerCft;
                        const rowRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate;
                        const mult = isSqft ? it.sqft : it.cft;
                        const displayAmount = (typeof it.amount === 'number' && it.amount > 0) ? it.amount : Math.round(mult * rowRate * 100) / 100;
                        return (
                          <div
                            key={it.id || idx}
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.75)',
                              border: '1px solid var(--border-medium)',
                              borderRadius: '7px',
                              boxShadow: '0 2px 5px rgba(15, 23, 42, 0.04)',
                              padding: '0.4rem 0.45rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.3rem',
                              width: '100%',
                              boxSizing: 'border-box'
                            }}
                          >
                            {/* Line 1: Measurements Input Strip */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem', width: '100%' }}>
                              <span style={{ fontWeight: 800, color: 'var(--primary-700)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', width: '28px', flexShrink: 0 }}>
                                #{it.serialNumber || idx + 1}
                              </span>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flex: 1, justifyContent: 'center' }}>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  placeholder=""
                                  className="calc-input tally-cell-input"
                                  value={it.lengthFeet}
                                  onChange={(e) => handleStep8UpdateItem(it.id, 'lengthFeet', e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  style={{ width: '42px', padding: '0.22rem 0.1rem', textAlign: 'center', fontWeight: 800 }}
                                />
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>×</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  placeholder=""
                                  className="calc-input tally-cell-input"
                                  value={it.widthInches}
                                  onChange={(e) => handleStep8UpdateItem(it.id, 'widthInches', e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  style={{ width: '42px', padding: '0.22rem 0.1rem', textAlign: 'center', fontWeight: 800 }}
                                />
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>×</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  placeholder=""
                                  className="calc-input tally-cell-input"
                                  value={it.thicknessInches}
                                  onChange={(e) => handleStep8UpdateItem(it.id, 'thicknessInches', e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  style={{ width: '42px', padding: '0.22rem 0.1rem', textAlign: 'center', fontWeight: 800 }}
                                />
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>×</span>
                                <input
                                  type="number"
                                  step="1"
                                  min="1"
                                  placeholder=""
                                  className="calc-input tally-cell-input"
                                  value={it.pieces}
                                  onChange={(e) => handleStep8UpdateItem(it.id, 'pieces', e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  style={{ width: '38px', padding: '0.22rem 0.1rem', textAlign: 'center', fontWeight: 800 }}
                                />
                              </div>

                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                title="Delete row"
                                onClick={() => handleStep8DeleteRow(it.id)}
                                style={{
                                  padding: 0,
                                  color: 'var(--danger-500, #dc2626)',
                                  minWidth: 0,
                                  width: '24px',
                                  height: '24px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            {/* Line 2: Volume & Price */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingTop: '0.25rem',
                                borderTop: '1px dashed var(--border-light, #eee)',
                                fontSize: '0.76rem',
                                width: '100%'
                              }}
                            >
                              {/* Volume */}
                              <span style={{ fontWeight: 800, color: 'var(--primary-700)', fontFamily: 'var(--font-mono)' }}>
                                {isSqft ? `${formatValue(it.sqft, 2)} SQFT` : `${formatValue(it.cft, 3)} CFT`}
                              </span>

                              {/* Rate input */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>Rate: ₹</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  placeholder=""
                                  className="calc-input tally-cell-input"
                                  value={(it.rate as any) === '' ? '' : (typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRowRate)}
                                  onChange={(e) => handleStep8UpdateItem(it.id, 'rate', e.target.value)}
                                  onBlur={() => {
                                    if ((it.rate as any) === '' || it.rate === undefined || it.rate === null) {
                                      handleStep8UpdateItem(it.id, 'rate', defaultRowRate.toString());
                                    }
                                  }}
                                  onFocus={(e) => e.target.select()}
                                  style={{
                                    width: '52px',
                                    padding: '0.15rem 0.2rem',
                                    fontWeight: 800,
                                    textAlign: 'center',
                                    color: 'var(--primary-900)'
                                  }}
                                />
                              </div>

                              {/* Row Amount */}
                              <strong style={{ fontWeight: 800, color: 'var(--primary-800)', fontSize: '0.84rem' }}>
                                ₹{formatIndianCurrency(displayAmount)}
                              </strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add row to this wood species footer */}
                    <div style={{ padding: '0.35rem 0.55rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', backgroundColor: 'var(--bg-subtle)' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleStep8AddRow(group.woodType)}
                        style={{ fontSize: '0.74rem', padding: '0.2rem 0.5rem', fontWeight: 700, color: 'var(--primary-700)' }}
                      >
                        + Add Row to {group.woodType}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            STEP 13: PREVIEW BILL TO & SHIP TO DETAILS
            ========================================================================= */}
        {currentStep === 13 && (
          <div className="card calc-step-card">
            <div className="calc-step-header" style={{ marginBottom: '0.85rem' }}>
              <h3 className="calc-step-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Eye size={18} color="var(--primary-600)" /> Preview Bill To &amp; Ship To Details
              </h3>
              <p className="calc-step-desc">
                Review and verify buyer billing and consignee shipping destinations before generating final invoice
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              {/* Card 1: BILL TO Preview */}
              <div
                style={{
                  border: '1.5px solid #bfdbfe',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 2px 8px rgba(30, 58, 138, 0.06)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header */}
                <div
                  style={{
                    backgroundColor: '#eff6ff',
                    padding: '0.65rem 0.85rem',
                    borderBottom: '1.5px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <span style={{
                    fontSize: '0.88rem',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#1d4ed8',
                    background: '#dbeafe',
                    padding: '4px 18px',
                    borderRadius: '6px',
                    border: '1.5px solid #60a5fa',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.25,
                    boxShadow: '0 1px 3px rgba(29, 78, 216, 0.15)'
                  }}>
                    BILL TO
                  </span>
                </div>

                {/* Details list */}
                <div style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', flex: 1, fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Buyer / Name:</span>
                    <strong style={{ color: 'var(--text-main, #0f172a)', textAlign: 'right' }}>{customerName || 'Direct Cash Customer'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Phone Number:</span>
                    <strong style={{ color: 'var(--text-main, #0f172a)', textAlign: 'right' }}>{customerPhone || '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Billing Address:</span>
                    <span style={{ color: 'var(--text-main, #0f172a)', fontWeight: 700, wordBreak: 'break-word' }}>{customerAddress || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>GSTIN / UIN:</span>
                    <strong style={{ fontFamily: 'monospace', color: customerGstin ? '#1d4ed8' : 'var(--text-muted)', textAlign: 'right' }}>{customerGstin || 'Unregistered'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>State &amp; Code:</span>
                    <strong style={{ color: 'var(--text-main, #0f172a)', textAlign: 'right' }}>
                      {customerState || 'Karnataka'} {customerStateCode ? `(Code: ${customerStateCode})` : '(Code: 29)'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Ref Number:</span>
                    <strong style={{ fontFamily: 'monospace', color: 'var(--text-main, #0f172a)', textAlign: 'right' }}>{referenceNumber || '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Invoice Date:</span>
                    <strong style={{ color: 'var(--text-main, #0f172a)', textAlign: 'right' }}>{invoiceDate || measurementDate || '—'}</strong>
                  </div>
                </div>

                {/* Edit Button */}
                <div style={{ padding: '0.65rem 1rem', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditModalTarget('bill_to')}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}
                  >
                    <Edit3 size={14} /> Edit Bill To Details
                  </button>
                </div>
              </div>

              {/* Card 2: SHIP TO Preview */}
              <div
                style={{
                  border: '1.5px solid #bae6fd',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.06)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header */}
                <div
                  style={{
                    backgroundColor: '#f0f9ff',
                    padding: '0.65rem 0.85rem',
                    borderBottom: '1.5px solid #bae6fd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <span style={{
                    fontSize: '0.88rem',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#0284c7',
                    background: '#e0f2fe',
                    padding: '4px 18px',
                    borderRadius: '6px',
                    border: '1.5px solid #38bdf8',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.25,
                    boxShadow: '0 1px 3px rgba(2, 132, 199, 0.15)'
                  }}>
                    SHIP TO
                  </span>
                </div>

                {/* Details list */}
                <div style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', flex: 1, fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Consignee / Receiving:</span>
                    <strong style={{ color: 'var(--text-main, #0f172a)', textAlign: 'right' }}>{consigneeName || customerName || 'Direct Cash Customer'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Contact Phone:</span>
                    <strong style={{ color: 'var(--text-main, #0f172a)', textAlign: 'right' }}>{consigneePhone || customerPhone || '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Shipping / Delivery Site:</span>
                    <span style={{ color: 'var(--text-main, #0f172a)', fontWeight: 700, wordBreak: 'break-word' }}>{consigneeAddress || customerAddress || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>GSTIN / UIN:</span>
                    <strong style={{ fontFamily: 'monospace', color: (consigneeGstin || customerGstin) ? '#0284c7' : 'var(--text-muted)', textAlign: 'right' }}>
                      {consigneeGstin || customerGstin || 'Unregistered'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>District:</span>
                    <strong style={{ color: 'var(--text-main, #0f172a)', textAlign: 'right' }}>{consigneeDistrict || 'Mysore'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>State &amp; Code:</span>
                    <strong style={{ color: 'var(--text-main, #0f172a)', textAlign: 'right' }}>
                      {consigneeState || destination || customerState || 'Karnataka'} {consigneeStateCode ? `(Code: ${consigneeStateCode})` : (customerStateCode ? `(Code: ${customerStateCode})` : '(Code: 29)')}
                    </strong>
                  </div>
                </div>

                {/* Edit Button */}
                <div style={{ padding: '0.65rem 1rem', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditModalTarget('ship_to')}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}
                  >
                    <Edit3 size={14} /> Edit Ship To Details
                  </button>
                </div>
              </div>
            </div>

            {/* Quick full proforma preview button */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsProformaModalOpen(true)}
                style={{ fontWeight: 700, padding: '0.55rem 1.15rem', fontSize: '0.88rem', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <FileText size={16} /> Full Invoice Preview Modal
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 14: FINAL REVIEW, WHATSAPP SHARE, PDF DOWNLOAD & PRINT
            ========================================================================= */}
        {currentStep === 14 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

            {/* 3 High-Impact Primary Mobile Action Buttons (WhatsApp, PDF, Print) */}
            <div className="card calc-step-card" style={{ backgroundColor: 'var(--bg-card)' }}>
              <div className="calc-step-header">
                <h3 className="calc-step-title">
                  <Printer size={17} color="var(--primary-600)" /> Instant Share &amp; Export Options
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {/* 1. Share via WhatsApp */}
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="calc-export-btn"
                  style={{
                    backgroundColor: '#25D366',
                    color: '#ffffff',
                    minHeight: '62px',
                    padding: '1.15rem 1.35rem',
                    fontSize: '1.15rem',
                    fontWeight: 800,
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.65rem',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(37, 211, 102, 0.4)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Directly opens customer's WhatsApp chat with the downloaded invoice PDF"
                >
                  <MessageCircle size={26} />
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
                    minHeight: '62px',
                    padding: '1.15rem 1.35rem',
                    fontSize: '1.15rem',
                    fontWeight: 800,
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.65rem',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Downloads official A4 Proforma Invoice PDF matching sawmill layout"
                >
                  <FileDown size={26} />
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
                    minHeight: '62px',
                    padding: '1.15rem 1.35rem',
                    fontSize: '1.15rem',
                    fontWeight: 800,
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.65rem',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.22)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Sends official Proforma Invoice directly to printer"
                >
                  <Printer size={26} />
                  <span>Print Sheet Invoice</span>
                </button>
              </div>

              {/* Full Proforma Modal trigger */}
              <div style={{ marginTop: '0.55rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsProformaModalOpen(true)}
                  style={{ width: '100%', justifyContent: 'center', fontWeight: 700, padding: '0.65rem 0.95rem', fontSize: '0.92rem', minHeight: '44px', borderRadius: '10px' }}
                >
                  <FileText size={16} /> Full Invoice Preview
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
                  <span className="preview-label">Ship To Consignee:</span>
                  <span className="preview-val font-bold">{consigneeName || customerName || 'Direct Cash Customer'}</span>
                </div>
                <div className="summary-preview-item">
                  <span className="preview-label">Ship To Destination:</span>
                  <span className="preview-val">{consigneeDistrict || consigneeState || customerState || 'Karnataka'}</span>
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
                {gstAmount > 0 && (
                  <div className="summary-preview-item">
                    <span className="preview-label">GST ({gstPercent}%):</span>
                    <span className="preview-val font-bold">+₹ {formatIndianCurrency(gstAmount)}</span>
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
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Order Dated</label>
                  <input
                    type="text"
                    value={buyerOrderDate}
                    onChange={(e) => setBuyerOrderDate(e.target.value)}
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
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Terms of Delivery (Multi-line)</label>
                  <textarea
                    rows={3}
                    value={termsOfDelivery}
                    onChange={(e) => setTermsOfDelivery(e.target.value)}
                    style={{ width: '100%', fontSize: '0.85rem', lineHeight: 1.4 }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sticky Step Dock Bar (Persistent bottom navigation across all viewports) */}
        <div className="calc-mobile-docked-nav no-print">
          <div className="calc-dock-inner">
            {currentStep > 1 && (
              <button
                type="button"
                className="btn btn-secondary calc-dock-btn calc-dock-prev"
                onClick={() => setCurrentStep(prev => (prev - 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14)}
                style={{ flex: '0 0 auto', padding: '0.45rem 0.85rem' }}
              >
                <ArrowLeft size={15} /> Back
              </button>
            )}

            {currentStep < 14 ? (
              <button
                type="button"
                className="btn btn-primary calc-dock-btn calc-dock-next"
                style={{ flex: 1 }}
                onClick={() => {
                  if (currentStep === 3) {
                    persistCurrentCustomer();
                    if (!isShipToTouched && !consigneeName && !consigneeAddress) {
                      setConsigneeName(customerName);
                      setConsigneePhone(customerPhone);
                      setConsigneeAddress(customerAddress);
                      setConsigneeGstin(customerGstin);
                      setConsigneeStateCode(customerStateCode || '29');
                      setConsigneeState(destination || customerState || 'Karnataka');
                    }
                  }
                  setCurrentStep(prev => (prev + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14);
                }}
              >
                <span>
                  {currentStep === 1 && 'Next: Customer Type (B2B / B2C) →'}
                  {currentStep === 2 && 'Next: Bill To Details →'}
                  {currentStep === 3 && 'Next: Ship To Details →'}
                  {currentStep === 4 && 'Next: Timber Calculator →'}
                  {currentStep === 5 && 'Next: Planing →'}
                  {currentStep === 6 && 'Next: Carpentry →'}
                  {currentStep === 7 && 'Next: Transport →'}
                  {currentStep === 8 && 'Next: Other Charges →'}
                  {currentStep === 9 && 'Next: GST Tax →'}
                  {currentStep === 10 && 'Next: Discount →'}
                  {currentStep === 11 && 'Next: Order Sorting →'}
                  {currentStep === 12 && 'Next: Preview Bill To & Ship To →'}
                  {currentStep === 13 && 'Next: Invoice & Share →'}
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
                    <p>Open customer's WhatsApp chat with invoice PDF</p>
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
                  disabled={saveStatus === 'saving'}
                  className="action-menu-item"/*  */
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
        {isProformaModalOpen && (
          <ProformaInvoiceModal
            isOpen={isProformaModalOpen}
            onClose={() => setIsProformaModalOpen(false)}
            sheet={getCurrentSheetObject()}
            businessSettings={businessSettings}
            onUpdateSheet={handleUpdateFromProforma}
          />
        )}

        {/* Direct In-Place Edit Modal for Bill To / Ship To (Top Aligned, Compact & Live Synced) */}
        {editModalTarget && (
          <div
            className="modal-overlay calc-edit-compact-overlay"
            onClick={() => {
              persistCurrentCustomer();
              setEditModalTarget(null);
            }}
            style={{
              zIndex: 10000,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              paddingTop: 'max(0.6rem, env(safe-area-inset-top, 0.6rem))',
              paddingBottom: '3rem',
              overflowY: 'auto'
            }}
          >
            <div
              className="modal-content calc-edit-compact-modal"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '430px',
                width: '94%',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                border: '1.5px solid var(--border-medium)',
                marginTop: '0.2rem',
                maxHeight: 'calc(100vh - 2rem)',
                overflowY: 'auto',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
              }}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.45rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Edit3 size={15} color="var(--primary-600)" />
                  <h3 style={{ fontSize: '0.94rem', margin: 0, fontWeight: 800 }}>
                    {editModalTarget === 'bill_to' ? 'Edit Bill To Details' : 'Edit Ship To Details'}
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    persistCurrentCustomer();
                    setEditModalTarget(null);
                  }}
                  style={{ padding: '3px' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Tab switchers */}
              <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.65rem', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '7px' }}>
                <button
                  type="button"
                  onClick={() => setEditModalTarget('bill_to')}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    borderRadius: '5px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: editModalTarget === 'bill_to' ? '#1d4ed8' : 'transparent',
                    color: editModalTarget === 'bill_to' ? '#ffffff' : '#475569',
                    transition: 'all 0.15s ease'
                  }}
                >
                  BILL TO DETAILS
                </button>
                <button
                  type="button"
                  onClick={() => setEditModalTarget('ship_to')}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    borderRadius: '5px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: editModalTarget === 'ship_to' ? '#0284c7' : 'transparent',
                    color: editModalTarget === 'ship_to' ? '#ffffff' : '#475569',
                    transition: 'all 0.15s ease'
                  }}
                >
                  SHIP TO DETAILS
                </button>
              </div>

              {/* Form Body: Bill To */}
              {editModalTarget === 'bill_to' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.42rem' }}>
                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                      Customer / Company Name:
                    </label>
                    <input
                      type="text"
                      className="calc-input"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder=""
                      style={{ width: '100%', fontWeight: 700, fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.5rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                      Phone Number:
                    </label>
                    <input
                      type="tel"
                      className="calc-input"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder=""
                      style={{ width: '100%', fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.5rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                      Address / Delivery Site:
                    </label>
                    <textarea
                      className="calc-input"
                      rows={2}
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder=""
                      style={{ width: '100%', resize: 'vertical', fontSize: '0.78rem', minHeight: '40px', padding: '0.22rem 0.5rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                      GSTIN Number (Optional):
                    </label>
                    <input
                      type="text"
                      className="calc-input font-mono"
                      value={customerGstin}
                      onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                      placeholder=""
                      style={{ width: '100%', fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.5rem' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 75px', gap: '0.42rem' }}>
                    <div>
                      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                        State:
                      </label>
                      <input
                        type="text"
                        className="calc-input"
                        value={customerState}
                        onChange={(e) => setCustomerState(e.target.value)}
                        placeholder=""
                        style={{ width: '100%', fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.5rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                        Code:
                      </label>
                      <input
                        type="text"
                        className="calc-input font-mono"
                        value={customerStateCode}
                        onChange={(e) => setCustomerStateCode(e.target.value)}
                        placeholder=""
                        style={{ width: '100%', textAlign: 'center', fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.35rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.42rem' }}>
                    <div>
                      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                        Ref Number:
                      </label>
                      <input
                        type="text"
                        className="calc-input font-mono"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        placeholder=""
                        style={{ width: '100%', fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.5rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                        Invoice Date:
                      </label>
                      <input
                        type="date"
                        className="calc-input"
                        value={measurementDate}
                        onChange={(e) => {
                          setMeasurementDate(e.target.value);
                          setInvoiceDate(formatToInvoiceDate(e.target.value));
                        }}
                        style={{ width: '100%', fontSize: '0.74rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.35rem' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Form Body: Ship To */}
              {editModalTarget === 'ship_to' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.42rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setConsigneeName(customerName);
                        setConsigneePhone(customerPhone);
                        setConsigneeAddress(customerAddress);
                        setConsigneeGstin(customerGstin);
                        setConsigneeStateCode(customerStateCode || '29');
                        setConsigneeState(destination || customerState || 'Karnataka');
                        setIsShipToTouched(true);
                      }}
                      style={{ fontSize: '0.68rem', padding: '2px 7px', fontWeight: 700, height: '22px', minHeight: '22px' }}
                    >
                      📋 Copy from Bill To
                    </button>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                      Receiving Person / Customer Name:
                    </label>
                    <input
                      type="text"
                      className="calc-input"
                      value={consigneeName}
                      onChange={(e) => {
                        setConsigneeName(e.target.value);
                        setIsShipToTouched(true);
                      }}
                      placeholder=""
                      style={{ width: '100%', fontWeight: 700, fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.5rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                      Contact Phone:
                    </label>
                    <input
                      type="tel"
                      className="calc-input"
                      value={consigneePhone}
                      onChange={(e) => {
                        setConsigneePhone(e.target.value);
                        setIsShipToTouched(true);
                      }}
                      placeholder=""
                      style={{ width: '100%', fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.5rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                      Delivery Site / Shipping Address:
                    </label>
                    <textarea
                      className="calc-input"
                      rows={2}
                      value={consigneeAddress}
                      onChange={(e) => {
                        setConsigneeAddress(e.target.value);
                        setIsShipToTouched(true);
                      }}
                      placeholder=""
                      style={{ width: '100%', resize: 'vertical', fontSize: '0.78rem', minHeight: '40px', padding: '0.22rem 0.5rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                      GSTIN Number (Optional):
                    </label>
                    <input
                      type="text"
                      className="calc-input font-mono"
                      value={consigneeGstin}
                      onChange={(e) => {
                        setConsigneeGstin(e.target.value.toUpperCase());
                        setIsShipToTouched(true);
                      }}
                      placeholder=""
                      style={{ width: '100%', fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.5rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                      District:
                    </label>
                    <input
                      type="text"
                      className="calc-input"
                      value={consigneeDistrict}
                      onChange={(e) => {
                        setConsigneeDistrict(e.target.value);
                        if (e.target.value.trim()) setDestination(e.target.value.trim().toUpperCase());
                        setIsShipToTouched(true);
                      }}
                      placeholder=""
                      style={{ width: '100%', fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.5rem' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 75px', gap: '0.42rem' }}>
                    <div>
                      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                        State:
                      </label>
                      <input
                        type="text"
                        className="calc-input"
                        value={consigneeState}
                        onChange={(e) => {
                          setConsigneeState(e.target.value);
                          if (!consigneeDistrict && e.target.value.trim()) setDestination(e.target.value.trim().toUpperCase());
                          setIsShipToTouched(true);
                        }}
                        placeholder=""
                        style={{ width: '100%', fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.5rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.12rem' }}>
                        Code:
                      </label>
                      <input
                        type="text"
                        className="calc-input font-mono"
                        value={consigneeStateCode}
                        onChange={(e) => {
                          setConsigneeStateCode(e.target.value);
                          setIsShipToTouched(true);
                        }}
                        placeholder=""
                        style={{ width: '100%', textAlign: 'center', fontSize: '0.78rem', height: '29px', minHeight: '29px', padding: '0.22rem 0.35rem' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div style={{ marginTop: '0.65rem', paddingTop: '0.45rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                  <CheckCircle size={13} /> Auto-synced
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    persistCurrentCustomer();
                    setEditModalTarget(null);
                  }}
                  style={{ padding: '0.35rem 0.95rem', fontSize: '0.8rem', fontWeight: 800, backgroundColor: '#15803d', height: '30px' }}
                >
                  ✓ Save &amp; Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Printable Official Proforma Invoice (Rendered strictly when user prints) */}
      <div className="sheet-print-container">
        <PrintableProformaInvoice
          businessSettings={businessSettings}
          voucherType={voucherType}
          invoiceNo={invoiceNo}
          eWayBillNo={eWayBillNo}
          invoiceDate={invoiceDate}
          paymentTerms={paymentTerms}
          buyerOrderNo={buyerOrderNo}
          buyerOrderDate={buyerOrderDate}
          destination={consigneeDistrict?.toUpperCase() || consigneeState?.toUpperCase() || destination?.toUpperCase() || 'KARNATAKA'}
          motorVehicleNo={motorVehicleNo}
          termsOfDelivery={termsOfDelivery}
          consigneeName={consigneeName || customerName || ''}
          consigneePhone={consigneePhone || customerPhone || ''}
          consigneeAddress={consigneeAddress || customerAddress || ''}
          consigneeGstin={consigneeGstin || customerGstin || ''}
          consigneeState={consigneeState || destination || 'Karnataka'}
          consigneeStateCode={consigneeStateCode || customerStateCode || '29'}
          buyerName={customerName || consigneeName || ''}
          buyerPhone={customerPhone || consigneePhone || ''}
          buyerAddress={customerAddress || consigneeAddress || ''}
          buyerGstin={customerGstin || consigneeGstin || ''}
          buyerState={customerState || destination || consigneeState || 'Karnataka'}
          buyerStateCode={customerStateCode || consigneeStateCode || '29'}
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
          gstTaxableBase={(customGstTaxableAmount > 0 && customGstTaxableAmount !== subtotalWithCharges) ? gstTaxableBase : undefined}
          gstAmount={gstAmount}
          finalGrandTotal={finalGrandTotal}
        />
      </div>
    </>
  );
};
