/**
 * Timber & Wood Industry CFT and SQFT Calculation Utility
 *
 * Core Formulas:
 * 1. CFT (Cubic Feet):
 *    (Length in feet × Width in inches × Thickness in inches × Number of pieces) ÷ 144
 *
 * 2. SQFT (Square Feet):
 *    SQFT = CFT × 12
 *    (Equivalent to: (Length in feet × Width in inches × Thickness in inches × Pieces) ÷ 12)
 *
 * Precision Rules:
 * - Calculations maintain full IEEE-754 double precision without intermediate rounding.
 * - Displayed values are rounded to 3 decimal places for commercial accuracy.
 * - Grand totals are summed from raw unrounded values before display rounding.
 */

import type { MeasurementItem, SheetTotals } from '../types';

export type SqftConvention = 'standard_1face' | 'surface_area_2face';

export interface CalculationResult {
  cft: number;
  sqft: number;
  isValid: boolean;
  errors: string[];
}

/**
 * Validates individual dimension input
 */
export function isValidDimension(val: number | '' | undefined | null): boolean {
  if (val === '' || val === undefined || val === null) return false;
  const num = Number(val);
  return !isNaN(num) && isFinite(num) && num > 0;
}

/**
 * Validates piece count input
 */
export function isValidPieces(val: number | '' | undefined | null): boolean {
  if (val === '' || val === undefined || val === null) return false;
  const num = Number(val);
  return !isNaN(num) && isFinite(num) && num > 0;
}

/**
 * Calculates raw CFT without intermediate rounding
 * Formula: (Length_ft × Width_in × Thickness_in × Pieces) / 144
 */
export function calculateCFT(
  lengthFeet: number,
  widthInches: number,
  thicknessInches: number,
  pieces: number
): number {
  if (lengthFeet <= 0 || widthInches <= 0 || thicknessInches <= 0 || pieces <= 0) {
    return 0;
  }
  return (lengthFeet * widthInches * thicknessInches * pieces) / 144;
}

/**
 * Calculates raw SQFT
 * Formula: SQFT = CFT × 12
 */
export function calculateSQFT(
  cftOrLength: number,
  widthInches?: number,
  thicknessInches?: number,
  pieces?: number
): number {
  if (widthInches !== undefined && thicknessInches !== undefined && pieces !== undefined) {
    const cft = calculateCFT(cftOrLength, widthInches, thicknessInches, pieces);
    return cft * 12;
  }
  if (cftOrLength <= 0 || !isFinite(cftOrLength)) {
    return 0;
  }
  return cftOrLength * 12;
}

/**
 * Computes CFT and SQFT for a single measurement row with validation
 * Uses formula: CFT = (L × W × T × P) / 144 and SQFT = CFT × 12
 */
export function calculateRow(
  lengthFeet: number | '',
  widthInches: number | '',
  thicknessInches: number | '',
  pieces: number | '',
  _convention?: SqftConvention
): CalculationResult {
  const errors: string[] = [];

  const l = typeof lengthFeet === 'number' ? lengthFeet : 0;
  const w = typeof widthInches === 'number' ? widthInches : 0;
  const t = typeof thicknessInches === 'number' ? thicknessInches : 0;
  const p = typeof pieces === 'number' ? pieces : 0;

  if (lengthFeet !== '' && l <= 0) errors.push('Length must be greater than 0');
  if (widthInches !== '' && w <= 0) errors.push('Width must be greater than 0');
  if (thicknessInches !== '' && t <= 0) errors.push('Thickness must be greater than 0');
  if (pieces !== '' && p <= 0) errors.push('Pieces must be greater than 0');

  const isComplete = l > 0 && w > 0 && t > 0 && p > 0;

  if (!isComplete) {
    return {
      cft: 0,
      sqft: 0,
      isValid: false,
      errors
    };
  }

  const cft = calculateCFT(l, w, t, p);
  const sqft = cft * 12; // SQFT = CFT × 12

  return {
    cft,
    sqft,
    isValid: true,
    errors: []
  };
}

/**
 * Computes grand totals across all measurement rows.
 * Maintains exact unrounded sum.
 */
export function calculateTotals(
  items: MeasurementItem[],
  _convention?: SqftConvention
): SheetTotals {
  let totalPieces = 0;
  let totalCft = 0;
  let totalSqft = 0;
  let totalAmount = 0;
  let validEntries = 0;

  for (const item of items) {
    const l = typeof item.lengthFeet === 'number' ? item.lengthFeet : 0;
    const w = typeof item.widthInches === 'number' ? item.widthInches : 0;
    const t = typeof item.thicknessInches === 'number' ? item.thicknessInches : 0;
    const p = typeof item.pieces === 'number' ? item.pieces : 0;

    if (l > 0 && w > 0 && t > 0 && p > 0) {
      validEntries++;
      totalPieces += p;
      const rowCft = calculateCFT(l, w, t, p);
      totalCft += rowCft;
      totalSqft += rowCft * 12; // SQFT = CFT × 12
      const rateNum = typeof item.rate === 'number' ? item.rate : 0;
      const amt = typeof item.amount === 'number' ? item.amount : Math.round(rowCft * rateNum * 100) / 100;
      totalAmount += amt;
    }
  }

  return {
    totalEntries: validEntries,
    totalPieces,
    totalCft,
    totalSqft,
    totalAmount
  };
}

/**
 * Formats a number to 3 decimal places for display,
 * handling edge-cases like floating point precision cleanly.
 */
export function formatValue(value: number, decimals: number = 3): string {
  if (isNaN(value) || !isFinite(value) || value === 0) {
    return (0).toFixed(decimals);
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Formats a number for integer or clean decimal display without trailing zeroes
 */
export function formatCompact(value: number): string {
  if (Number.isInteger(value)) {
    return value.toLocaleString('en-US');
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

/**
 * Sorts timber entries according to standard mill order:
 * 1. Width (IN) - Ascending: Smallest width to largest width.
 * 2. Length (FT) - Descending: Longest to shortest within each width.
 * 3. Grouping: Keeps all entries with the same width together.
 * Preserves all existing calculations, rates, quantities, and properties.
 */
export function sortTimberEntries(items: MeasurementItem[]): MeasurementItem[] {
  return [...items].sort((a, b) => {
    const wA = typeof a.widthInches === 'number' ? a.widthInches : 0;
    const wB = typeof b.widthInches === 'number' ? b.widthInches : 0;
    // 1. Width ascending
    if (wA !== wB) {
      return wA - wB;
    }
    // 2. Length descending within same width group
    const lA = typeof a.lengthFeet === 'number' ? a.lengthFeet : 0;
    const lB = typeof b.lengthFeet === 'number' ? b.lengthFeet : 0;
    if (lA !== lB) {
      return lB - lA;
    }
    // 3. Thickness descending
    const tA = typeof a.thicknessInches === 'number' ? a.thicknessInches : 0;
    const tB = typeof b.thicknessInches === 'number' ? b.thicknessInches : 0;
    if (tA !== tB) {
      return tB - tA;
    }
    return 0;
  }).map((it, idx) => ({
    ...it,
    serialNumber: idx + 1
  }));
}

export interface TimberWidthGroup {
  widthInches: number;
  items: MeasurementItem[];
  totalPieces: number;
  totalCft: number;
  totalAmount: number;
}

/**
 * Groups sorted timber entries by Width (IN) for clean display
 */
export function groupTimberByWidth(items: MeasurementItem[]): TimberWidthGroup[] {
  const sorted = sortTimberEntries(items);
  const groupsMap = new Map<number, MeasurementItem[]>();

  for (const it of sorted) {
    const w = typeof it.widthInches === 'number' ? it.widthInches : 0;
    const list = groupsMap.get(w) || [];
    list.push(it);
    groupsMap.set(w, list);
  }

  const result: TimberWidthGroup[] = [];
  groupsMap.forEach((groupItems, widthInches) => {
    const totalPieces = groupItems.reduce((acc, it) => acc + (typeof it.pieces === 'number' ? it.pieces : 0), 0);
    const totalCft = groupItems.reduce((acc, it) => acc + (it.cft || 0), 0);
    const totalAmount = groupItems.reduce((acc, it) => acc + (it.amount || 0), 0);
    result.push({
      widthInches,
      items: groupItems,
      totalPieces,
      totalCft,
      totalAmount
    });
  });

  return result;
}
