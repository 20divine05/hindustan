export type WoodSpeciesCutLog =
  | 'Silver Wood'
  | 'Teak Wood'
  | 'Mahogany'
  | 'Mahagony'
  | 'Pine'
  | 'Neem'
  | 'Jungle'
  | 'Plywood(30)'
  | 'Plywood(34)'
  | 'Readywood(30)'
  | 'Readywood(34)'
  | 'Plywood'
  | 'Ready Board'
  | 'Other (Custom...)';

export type TeakGrade = '1st' | 'M' | '2nd' | '1st Teak' | 'Medium Teak' | '2nd Teak';
export type SheetBrand = 'Red Tag' | 'Mine Gold' | 'Magnus';
export type ReadyBoardSize = '8 × 9' | '8 × 12' | '8 × 18' | '8 × 24' | '8 × 48';

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
  rateUnit?: 'CFT' | 'SQFT' | 'PCS';
  amount?: number;
  woodType?: string;
  remarks?: string;
  itemCategory?: 'timber' | 'plywood' | 'ready_board';
  brand?: SheetBrand | string;
  boardSize?: ReadyBoardSize | string;
  teakGrade?: TeakGrade;
}

export type LogType = 'cut' | 'round';
export type RoundLogOutputUnit = 'CFT' | 'CBM';
export type RoundLogInputUnitType =
  | 'girth_in_length_ft'
  | 'girth_ft_length_ft'
  | 'girth_m_length_m'
  | 'girth_cm_length_cm';

export type GirthSlabType =
  | 'upto_23'
  | 'above_24'
  | 'above_36'
  | 'above_48'
  | 'above_60';

export interface RoundLogItem {
  id: string;
  serialNumber: number;
  woodType?: string;
  girth: number | '';
  girthFt?: number | '';
  girthInPart?: number | '';
  girthInches?: number;
  girthFtInStr?: string;
  length: number | '';
  pieces: number | '';
  volume: number; // in outputUnit (CFT or CBM)
  cft?: number;
  cbm?: number;
  slabId?: GirthSlabType;
  slabLabel?: string;
  outputUnit: RoundLogOutputUnit;
  inputUnit: RoundLogInputUnitType;
  rate?: number | '';
  amount?: number;
  remarks?: string;
}

export interface RoundLogTotals {
  totalEntries: number;
  totalPieces: number;
  totalVolume: number;
  totalCft?: number;
  totalCbm?: number;
  outputUnit: RoundLogOutputUnit;
  totalAmount: number;
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
  voucherType?: 'sales' | 'purchase';
  customerType?: 'b2b' | 'b2c';
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
  customerState?: string;
  customerStateCode?: string;
  destination?: string;
  consigneeName?: string;
  consigneePhone?: string;
  consigneeAddress?: string;
  consigneeGstin?: string;
  consigneeDistrict?: string;
  consigneeState?: string;
  consigneeStateCode?: string;
  motorVehicleNo?: string;
  termsOfDelivery?: string;
  paymentTerms?: string;
  buyerOrderNo?: string;
  buyerOrderDate?: string;
  projectName: string;
  referenceNumber: string;
  measurementDate: string;
  notes: string;
  logType?: LogType;
  roundLogOutputUnit?: RoundLogOutputUnit;
  roundLogInputUnit?: RoundLogInputUnitType;
  roundLogItems?: RoundLogItem[];
  roundLogSlabRates?: Record<string, number>;
  items: MeasurementItem[];
  additionalCharges?: AdditionalCharges;
  discount?: SheetDiscount;
  customGstTaxableAmount?: number;
  gstPercent?: number;
  isConfirmed?: boolean;
  finalGrandTotal?: number;
  proformaExportData?: Record<string, any>;
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

export type VisitorStatus = 'pending' | 'approved' | 'blocked';

export interface AppVisitor {
  id: string;
  deviceId: string;
  ipAddress: string;
  city?: string;
  region?: string;
  country?: string;
  isp?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  userAgent?: string;
  status: VisitorStatus;
  label?: string;
  firstSeen: string;
  lastSeen: string;
  createdAt: string;
  updatedAt: string;
}

