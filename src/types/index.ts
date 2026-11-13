export interface MeasurementItem {
  id: string;
  serialNumber: number;
  lengthFeet: number | '';
  widthInches: number | '';
  thicknessInches: number | '';
  pieces: number | '';
  cft: number;
  sqft: number;
  rate?: number | '';
  rateUnit?: 'CFT' | 'SQFT';
  amount?: number;
  woodType?: string;
  remarks?: string;
}

export interface SheetTotals {
  totalEntries: number;
  totalPieces: number;
  totalCft: number;
  totalSqft: number;
  totalAmount?: number;
}

export interface AdditionalCharges {
  carpentry?: number;
  transportation?: number;
  planing?: number;
  planingRatePerCft?: number;
  sawing?: number;
  other?: number;
  otherLabel?: string;
}

export interface SheetDiscount {
  type: 'rupees' | 'percentage';
  value: number;
  amount?: number;
}

export interface MeasurementSheet {
  id: string;
  userId: string;
  sheetName: string;
  customerType?: 'b2b' | 'b2c';
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
  customerState?: string;
  customerStateCode?: string;
  projectName: string;
  referenceNumber: string;
  measurementDate: string;
  notes: string;
  items: MeasurementItem[];
  additionalCharges?: AdditionalCharges;
  discount?: SheetDiscount;
  customGstTaxableAmount?: number;
  gstPercent?: number;
  isConfirmed?: boolean;
  finalGrandTotal?: number;
  totalEntries: number;
  totalPieces: number;
  totalCft: number;
  totalSqft: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'user' | 'manager' | 'admin';
  companyName: string;
  createdAt?: string;
}

export interface BusinessSettings {
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  sqftFormulaType: 'standard_1face' | 'surface_area_2face';
  currencySymbol: string;
  ratePerCft?: number;
}
