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

import type { MeasurementItem, SheetTotals, TeakGrade } from '../types';

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
 * Resolves sheet width from explicit widthInches or boardSize (e.g. "8 × 24").
 */
export function resolveSheetWidth(
  isPlywood: boolean,
  widthInches?: number | '',
  boardSize?: string
): number {
  if (typeof widthInches === 'number' && widthInches > 0) {
    return widthInches;
  }
  if (boardSize) {
    const match = boardSize.match(/8\s*[xX×*]\s*(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return isPlywood ? 4 : 12;
}

/**
 * Computes canonical SQFT for sheet products:
 * - Plywood: 8ft × 4ft = 32 SQFT per piece
 * - Readywood: 8ft × (widthInches / 12) ft per piece (converts inch width to ft and multiplies by 8 ft)
 */
export function calculateSheetSqft(
  isPlywood: boolean,
  pieces: number,
  widthInches?: number | '',
  boardSize?: string
): number {
  if (!pieces || isNaN(pieces) || pieces <= 0) return 0;
  if (isPlywood) return 32 * pieces;
  const sheetW = resolveSheetWidth(false, widthInches, boardSize);
  return Math.round(((8 * sheetW) / 12) * pieces * 10000) / 10000;
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

export function resolveSheetRateUnit(rateUnit?: string, per?: string): 'SQFT' | 'PCS' {
  return rateUnit === 'PCS' || per === 'PCS' ? 'PCS' : 'SQFT';
}

export function calculateSheetAmount(
  isPlywood: boolean,
  pieces: number,
  rate: number,
  rateUnit?: string,
  widthInches?: number | '',
  boardSize?: string
): { sqft: number; rateUnit: 'SQFT' | 'PCS'; amount: number } {
  const unit = resolveSheetRateUnit(rateUnit);
  const sqft = calculateSheetSqft(isPlywood, pieces, widthInches, boardSize);
  const mult = unit === 'PCS' ? pieces : sqft;
  const amount = rate > 0 ? Math.round(mult * rate * 100) / 100 : 0;
  return { sqft, rateUnit: unit, amount };
}

/**
 * Computes grand totals across all measurement rows.
 * Maintains exact unrounded sum.
 */
export function calculateTotals(
  items: MeasurementItem[],
  _convention?: SqftConvention,
  defaultRate: number = 1200
): SheetTotals {
  let totalPieces = 0;
  let totalCft = 0;
  let totalSqft = 0;
  let totalAmount = 0;
  let validEntries = 0;

  for (const item of items) {
    if (item.itemCategory === 'plywood' || item.itemCategory === 'ready_board' || (item.woodType && (item.woodType.toUpperCase().includes('PLYWOOD') || item.woodType.toUpperCase().includes('READY')))) {
      const p = typeof item.pieces === 'number' ? item.pieces : parseFloat(String(item.pieces)) || 0;
      if (p > 0) {
        validEntries++;
        totalPieces += p;
        const isPly = Boolean(item.itemCategory === 'plywood' || (item.woodType && item.woodType.toUpperCase().includes('PLYWOOD')));
        const r = typeof item.rate === 'number' && item.rate > 0 ? item.rate : 0;
        const sheetCalc = calculateSheetAmount(isPly, p, r, item.rateUnit, item.widthInches, item.boardSize);
        totalSqft += sheetCalc.sqft;
        // Do NOT compute or add CFT for Plywood or Ready Board (cft = 0)
        const amt = sheetCalc.amount > 0 ? sheetCalc.amount : (typeof item.amount === 'number' ? item.amount : 0);
        totalAmount += amt;
      }
      continue;
    }

    const l = typeof item.lengthFeet === 'number' ? item.lengthFeet : 0;
    const w = typeof item.widthInches === 'number' ? item.widthInches : 0;
    const t = typeof item.thicknessInches === 'number' ? item.thicknessInches : 0;
    const p = typeof item.pieces === 'number' ? item.pieces : 0;

    if (l > 0 && w > 0 && t > 0 && p > 0) {
      validEntries++;
      totalPieces += p;
      const rowCft = calculateCFT(l, w, t, p);
      const rowSqft = rowCft * 12; // SQFT = CFT × 12
      totalCft += rowCft;
      totalSqft += rowSqft;

      const isSqftBilled = w >= 7 && item.rateUnit !== 'CFT';
      const multiplier = isSqftBilled ? (item.sqft || rowSqft) : rowCft;
      const defaultRowRate = isSqftBilled ? 120 : defaultRate;
      const rateNum = typeof item.rate === 'number' && item.rate > 0 ? item.rate : defaultRowRate;
      const amt = typeof item.amount === 'number' && item.amount > 0 ? item.amount : Math.round(multiplier * rateNum * 100) / 100;
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
 * Normalizes teak grade to '1st', 'M', or '2nd'
 */
export function normalizeTeakGrade(grade?: string): TeakGrade {
  if (!grade) return '1st';
  const clean = grade.trim().toLowerCase();
  if (clean.includes('medium') || clean === 'm') return 'M';
  if (clean.includes('2nd') || clean.includes('second') || clean === '2') return '2nd';
  if (clean.includes('1st') || clean.includes('first') || clean === '1') return '1st';
  return '1st';
}

/**
 * Returns clean Wood Section Heading for Proforma Invoice and sorting:
 * - TEAK WOOD (1st), TEAK WOOD (M), TEAK WOOD (2nd)
 * - PLYWOODS(30KG), PLYWOODS(34KG)
 * - READYBOARDS(30KG), READYBOARDS(34KG)
 * - Other wood species (SILVER WOOD, MAHOGANY, PINE, NEEM, JUNGLE, etc.)
 */
export function getCutLogItemSectionHeading(it: {
  woodType?: string;
  itemCategory?: 'timber' | 'plywood' | 'ready_board';
  teakGrade?: string;
  brand?: string;
  description?: string;
}): string {
  const woodUpper = (it.woodType || '').toUpperCase();
  const descUpper = (it.description || '').toUpperCase();
  const isExplicitSheetWood = woodUpper.includes('PLYWOOD') || woodUpper.includes('READY');
  const isPlywood = (it.itemCategory === 'plywood' || woodUpper.includes('PLYWOOD') || descUpper.includes('PLYWOOD')) && it.itemCategory !== 'timber';
  const isReady = (it.itemCategory === 'ready_board' || woodUpper.includes('READY') || descUpper.includes('READY')) && it.itemCategory !== 'timber';

  if (isPlywood && (isExplicitSheetWood || !it.woodType || it.woodType.toUpperCase() === 'PLYWOOD' || it.woodType.toUpperCase() === 'PLYWOODS')) {
    if (woodUpper.includes('34') || descUpper.includes('34')) return 'PLYWOODS(34KG)';
    return 'PLYWOODS(30KG)';
  }
  if (isReady && (isExplicitSheetWood || !it.woodType || it.woodType.toUpperCase() === 'READY BOARD' || it.woodType.toUpperCase() === 'READYWOOD' || it.woodType.toUpperCase() === 'READYBOARDS')) {
    if (woodUpper.includes('34') || descUpper.includes('34')) return 'READYBOARDS(34KG)';
    return 'READYBOARDS(30KG)';
  }

  const wt = (it.woodType || 'SILVER WOOD').trim().toUpperCase();
  if (wt.includes('TEAK') || descUpper.includes('TEAK')) {
    const rawGrade = it.teakGrade || descUpper.match(/TEAK WOOD\s*\(([^)]+)\)/)?.[1] || wt.match(/\(([^)]+)\)/)?.[1];
    const grade = normalizeTeakGrade(rawGrade);
    return `TEAK WOOD (${grade})`;
  }
  return wt;
}

/**
 * Returns formatted Description of Goods:
 * - Plywood: 8 × 4 (Red Tag) / 8 × 4 (Mine Gold) / 8 × 4 (Magnus)
 * - Ready Board: 8 × 9 (Red Tag) / 8 × 12 (Mine Gold) / 8 × 24 (Magnus) etc.
 * - Timber: Length × Width × Thick
 */
export function getCutLogItemDescription(it: {
  itemCategory?: 'timber' | 'plywood' | 'ready_board';
  woodType?: string;
  brand?: string;
  boardSize?: string;
  lengthFeet?: number | '';
  widthInches?: number | '';
  thicknessInches?: number | '';
  description?: string;
}): string {
  const descUpper = (it.description || '').toUpperCase();
  const woodUpper = (it.woodType || '').toUpperCase();
  const isExplicitSheetWood = woodUpper.includes('PLYWOOD') || woodUpper.includes('READY');
  const isPlywood = (it.itemCategory === 'plywood' || woodUpper.includes('PLYWOOD') || descUpper.includes('PLYWOOD')) && it.itemCategory !== 'timber' && (isExplicitSheetWood || !it.woodType || it.woodType.toUpperCase() === 'PLYWOOD');
  const isReady = (it.itemCategory === 'ready_board' || woodUpper.includes('READY') || descUpper.includes('READY')) && it.itemCategory !== 'timber' && (isExplicitSheetWood || !it.woodType || it.woodType.toUpperCase() === 'READY BOARD' || it.woodType.toUpperCase() === 'READYWOOD');

  if (isPlywood) {
    let b = it.brand;
    if (!b && it.description) {
      const match = it.description.match(/\(([^)]+)\)/);
      if (match) b = match[1];
    }
    const brandName = b || 'Red Tag';
    return `8 × 4 (${brandName})`;
  }
  if (isReady) {
    let b = it.brand;
    if (!b && it.description) {
      const match = it.description.match(/\(([^)]+)\)/);
      if (match) b = match[1];
    }
    const brandName = b || 'Mine Gold';
    let size = it.boardSize;
    if (!size) {
      let w = it.widthInches && Number(it.widthInches) > 0 ? it.widthInches : 0;
      if (!w && it.description) {
        const match = it.description.match(/8\s*[xX×*]\s*(\d+)/);
        if (match) w = parseInt(match[1], 10);
      }
      size = `8 × ${w || 12}`;
    }
    const cleanSize = size.replace(/\s*[*xX×]\s*/, ' × ');
    return `${cleanSize} (${brandName})`;
  }
  if (it.description) {
    if (it.description.includes('(') && it.description.includes(')')) {
      return it.description;
    }
    const match = it.description.match(/^([\d.]+)[X|x*]([\d.]+)(?:[X|x*]([\d.]+))?/);
    if (match) {
      if (!match[3] || match[3] === '0' || parseFloat(match[3]) === 0) {
        return `${match[1]} × ${match[2]}`;
      }
      return `${match[1]} × ${match[2]} × ${match[3]}`;
    }
    return it.description;
  }
  if (it.lengthFeet && it.widthInches) {
    if (it.thicknessInches && Number(it.thicknessInches) > 0) {
      return `${it.lengthFeet} × ${it.widthInches} × ${it.thicknessInches}`;
    }
    return `${it.lengthFeet} × ${it.widthInches}`;
  }
  return it.description || '';
}

/**
 * Sorts timber entries according to standard mill order:
 * 1. Wood Species Grouping: Keeps all entries of the same wood species together,
 *    preserving the initial sequence in which each wood species was introduced in the sheet.
 * 2. Width (IN) - Ascending: Smallest width to largest width within each wood species.
 * 3. Thickness (IN) - Descending: Thickest to thinnest within each width group.
 * 4. Length (FT) - Ascending: Shortest to longest within each thickness group.
 * 5. Serial Number: Sequential 1, 2, 3... across the entire sheet.
 * Preserves all existing calculations, rates, quantities, and properties.
 */
export function sortTimberEntries(items: MeasurementItem[]): MeasurementItem[] {
  if (!items || items.length === 0) return [];

  // Separate valid dimension items from completely blank/draft rows
  const validItems: MeasurementItem[] = [];
  const blankItems: MeasurementItem[] = [];

  for (const it of items) {
    const itDesc = (it.remarks || '').toUpperCase();
    const itWood = (it.woodType || '').toUpperCase();
    const isExplicitSheetWood = itWood.includes('PLYWOOD') || itWood.includes('READY');
    const isPlywood = (it.itemCategory === 'plywood' || itWood.includes('PLYWOOD') || itDesc.includes('PLYWOOD')) && it.itemCategory !== 'timber';
    const isReady = (it.itemCategory === 'ready_board' || itWood.includes('READY') || itDesc.includes('READY')) && it.itemCategory !== 'timber';
    const isSheet = (isPlywood || isReady) && (isExplicitSheetWood || !it.woodType || it.woodType === 'Plywood' || it.woodType === 'Ready Board');

    if (isSheet) {
      const p = typeof it.pieces === 'number' ? it.pieces : parseFloat(String(it.pieces));
      if (!isNaN(p) && p > 0) {
        const sheetW = resolveSheetWidth(isPlywood, it.widthInches, it.boardSize);
        const sqft = calculateSheetSqft(isPlywood, p, sheetW, it.boardSize);
        const resolvedSheetWood = isPlywood
          ? (itWood.includes('34') ? 'Plywoods(34kg)' : 'Plywoods(30kg)')
          : (itWood.includes('34') ? 'ReadyBoards(34kg)' : 'ReadyBoards(30kg)');
        validItems.push({
          ...it,
          itemCategory: isPlywood ? 'plywood' : 'ready_board',
          brand: it.brand || (isPlywood ? 'Red Tag' : 'Mine Gold'),
          woodType: resolvedSheetWood,
          widthInches: sheetW,
          cft: 0,
          sqft,
          rateUnit: resolveSheetRateUnit(it.rateUnit)
        });
        continue;
      }
    }

    const l = typeof it.lengthFeet === 'number' ? it.lengthFeet : parseFloat(String(it.lengthFeet));
    const w = typeof it.widthInches === 'number' ? it.widthInches : parseFloat(String(it.widthInches));
    if (!isNaN(l) && l > 0 && !isNaN(w) && w > 0) {
      // Ensure width >= 7 defaults directly to SQFT if rateUnit is not explicitly set to CFT
      const isWide = w >= 7;
      const resolvedUnit = isWide ? (it.rateUnit === 'CFT' ? 'CFT' : 'SQFT') : 'CFT';
      const defaultRateVal = resolvedUnit === 'SQFT' ? 120 : 1200;
      const resolvedRate = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRateVal;

      validItems.push({
        ...it,
        rateUnit: resolvedUnit,
        rate: resolvedRate
      });
    } else {
      blankItems.push(it);
    }
  }

  // Preserve the initial order of wood species as they first appeared
  const woodOrder: string[] = [];
  const woodMap = new Map<string, MeasurementItem[]>();

  for (const it of validItems) {
    const woodKey = getCutLogItemSectionHeading(it);
    if (!woodMap.has(woodKey)) {
      woodOrder.push(woodKey);
      woodMap.set(woodKey, []);
    }
    woodMap.get(woodKey)!.push(it);
  }

  // Consolidate identical measurements within each wood group, then sort
  const sortedValid: MeasurementItem[] = [];
  for (const woodKey of woodOrder) {
    const groupItems = woodMap.get(woodKey) || [];

    // Combine rows with exact same dimensions and Rate + RateUnit
    const consolidatedMap = new Map<string, MeasurementItem>();
    const consolidatedList: MeasurementItem[] = [];

    for (const it of groupItems) {
      const isSheet = (it.itemCategory === 'plywood' || it.itemCategory === 'ready_board' || it.woodType?.toLowerCase().includes('plywood') || it.woodType?.toLowerCase().includes('ready')) && it.itemCategory !== 'timber';
      const l = typeof it.lengthFeet === 'number' ? it.lengthFeet : parseFloat(String(it.lengthFeet)) || 0;
      const w = typeof it.widthInches === 'number' ? it.widthInches : parseFloat(String(it.widthInches)) || 0;
      const t = typeof it.thicknessInches === 'number' ? it.thicknessInches : parseFloat(String(it.thicknessInches)) || 0;
      const p = typeof it.pieces === 'number' ? it.pieces : parseFloat(String(it.pieces)) || 1;
      const isWide = w >= 7;
      const sheetUnit = isSheet ? resolveSheetRateUnit(it.rateUnit) : null;
      const unit = isSheet ? sheetUnit! : (isWide ? (it.rateUnit === 'CFT' ? 'CFT' : 'SQFT') : 'CFT');
      const defaultRateVal = unit === 'SQFT' || unit === 'PCS' ? (isSheet ? 0 : 120) : 1200;
      const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRateVal;

      if (isSheet) {
        const isPly = Boolean(it.itemCategory === 'plywood' || (it.woodType && it.woodType.toLowerCase().includes('plywood')));
        const sheetW = resolveSheetWidth(isPly, it.widthInches, it.boardSize);
        const boardKey = isPly ? '8x4' : (it.boardSize || `${l}x${sheetW}`);
        const brandKey = it.brand || (isPly ? 'Red Tag' : 'Mine Gold');
        const resolvedUnit = sheetUnit || 'SQFT';
        const key = `sheet_${it.itemCategory}_${boardKey}_${brandKey}_${r}_${resolvedUnit}`;

        if (consolidatedMap.has(key)) {
          const existing = consolidatedMap.get(key)!;
          const oldPieces = typeof existing.pieces === 'number' ? existing.pieces : parseFloat(String(existing.pieces)) || 0;
          const newPieces = oldPieces + p;
          const calcSheet = calculateSheetAmount(isPly, newPieces, r, resolvedUnit, sheetW, it.boardSize);

          existing.pieces = newPieces;
          existing.sqft = calcSheet.sqft;
          existing.cft = 0;
          existing.rateUnit = calcSheet.rateUnit;
          existing.amount = calcSheet.amount;
          existing.brand = it.brand || existing.brand;
        } else {
          const calcSheet = calculateSheetAmount(isPly, p, r, resolvedUnit, sheetW, it.boardSize);
          const clone: MeasurementItem = {
            ...it,
            brand: it.brand || brandKey,
            boardSize: it.boardSize || (it.itemCategory === 'ready_board' ? `8 × ${sheetW || 12}` : undefined),
            cft: 0,
            sqft: calcSheet.sqft,
            rate: r,
            rateUnit: calcSheet.rateUnit,
            amount: calcSheet.amount
          };
          consolidatedMap.set(key, clone);
          consolidatedList.push(clone);
        }
        continue;
      }

      const calc = calculateRow(l, w, t, p);
      const isSqft = w >= 7 && unit !== 'CFT';
      const mult = isSqft ? calc.sqft : calc.cft;
      const computedAmount = Math.round(mult * r * 100) / 100;

      const key = `${l}_${w}_${t}_${r}_${unit}`;

      if (consolidatedMap.has(key)) {
        const existing = consolidatedMap.get(key)!;
        const oldPieces = typeof existing.pieces === 'number' ? existing.pieces : parseFloat(String(existing.pieces)) || 0;
        const addPieces = p;
        const newPieces = oldPieces + addPieces;

        const newCalc = calculateRow(l, w, t, newPieces);
        const newMult = isSqft ? newCalc.sqft : newCalc.cft;
        const newAmount = Math.round(newMult * r * 100) / 100;

        existing.pieces = newPieces;
        existing.cft = newCalc.cft;
        existing.sqft = newCalc.sqft;
        existing.amount = newAmount;
      } else {
        const clone: MeasurementItem = {
          ...it,
          cft: calc.cft,
          sqft: calc.sqft,
          rate: r,
          rateUnit: unit,
          amount: (typeof it.amount === 'number' && it.amount > 0) ? it.amount : computedAmount
        };
        consolidatedMap.set(key, clone);
        consolidatedList.push(clone);
      }
    }

    consolidatedList.sort((a, b) => {
      const isSheetA = a.itemCategory === 'plywood' || a.itemCategory === 'ready_board';
      const isSheetB = b.itemCategory === 'plywood' || b.itemCategory === 'ready_board';
      if (isSheetA || isSheetB) {
        const wA = typeof a.widthInches === 'number' ? a.widthInches : parseFloat(String(a.widthInches)) || 0;
        const wB = typeof b.widthInches === 'number' ? b.widthInches : parseFloat(String(b.widthInches)) || 0;
        if (wA !== wB) return wA - wB;

        const brandA = a.brand || '';
        const brandB = b.brand || '';
        if (brandA !== brandB) return brandA.localeCompare(brandB);

        const rA = typeof a.rate === 'number' ? a.rate : 0;
        const rB = typeof b.rate === 'number' ? b.rate : 0;
        if (rA !== rB) return rA - rB;

        const pA = typeof a.pieces === 'number' ? a.pieces : parseFloat(String(a.pieces)) || 0;
        const pB = typeof b.pieces === 'number' ? b.pieces : parseFloat(String(b.pieces)) || 0;
        return pB - pA;
      }

      const wA = typeof a.widthInches === 'number' ? a.widthInches : parseFloat(String(a.widthInches)) || 0;
      const wB = typeof b.widthInches === 'number' ? b.widthInches : parseFloat(String(b.widthInches)) || 0;
      if (wA !== wB) return wA - wB;

      const tA = typeof a.thicknessInches === 'number' ? a.thicknessInches : parseFloat(String(a.thicknessInches)) || 0;
      const tB = typeof b.thicknessInches === 'number' ? b.thicknessInches : parseFloat(String(b.thicknessInches)) || 0;
      if (tA !== tB) return tB - tA;

      const lA = typeof a.lengthFeet === 'number' ? a.lengthFeet : parseFloat(String(a.lengthFeet)) || 0;
      const lB = typeof b.lengthFeet === 'number' ? b.lengthFeet : parseFloat(String(b.lengthFeet)) || 0;
      if (lA !== lB) return lA - lB;

      const rA = typeof a.rate === 'number' ? a.rate : 0;
      const rB = typeof b.rate === 'number' ? b.rate : 0;
      if (rA !== rB) return rA - rB;

      const pA = typeof a.pieces === 'number' ? a.pieces : parseFloat(String(a.pieces)) || 0;
      const pB = typeof b.pieces === 'number' ? b.pieces : parseFloat(String(b.pieces)) || 0;
      if (pA !== pB) return pB - pA;

      return 0;
    });
    sortedValid.push(...consolidatedList);
  }

  // Combine sorted items with any trailing blank rows and re-index sequentially
  return [...sortedValid, ...blankItems].map((it, idx) => ({
    ...it,
    serialNumber: idx + 1
  }));
}

export interface TimberWoodGroup {
  woodType: string;
  items: MeasurementItem[];
  totalPieces: number;
  totalCft: number;
  totalAmount: number;
}

/**
 * Groups sorted timber entries by Wood Species for clear display & order review
 */
export function groupTimberByWood(items: MeasurementItem[], defaultRate = 1200): TimberWoodGroup[] {
  const sorted = sortTimberEntries(items);
  const groupsMap = new Map<string, MeasurementItem[]>();
  const woodOrder: string[] = [];

  for (const it of sorted) {
    const wood = getCutLogItemSectionHeading(it);
    if (!groupsMap.has(wood)) {
      woodOrder.push(wood);
      groupsMap.set(wood, []);
    }
    groupsMap.get(wood)!.push(it);
  }

  return woodOrder.map((wood) => {
    const groupItems = groupsMap.get(wood) || [];
    const isSheet = wood.includes('PLYWOOD') || wood.includes('READY');
    const totalPieces = groupItems.reduce((acc, it) => acc + (typeof it.pieces === 'number' ? it.pieces : 0), 0);
    // Plywood and Ready Board have 0 CFT
    const totalCft = isSheet ? 0 : groupItems.reduce((acc, it) => acc + (it.cft || 0), 0);
    const totalAmount = groupItems.reduce((acc, it) => {
      if (typeof it.amount === 'number' && it.amount > 0) {
        return acc + it.amount;
      }
      if (isSheet) {
        const p = typeof it.pieces === 'number' ? it.pieces : (parseFloat(String(it.pieces)) || 0);
        const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : 0;
        const isPly = Boolean(it.itemCategory === 'plywood' || (it.woodType && it.woodType.toLowerCase().includes('plywood')));
        return acc + calculateSheetAmount(isPly, p, r, it.rateUnit, it.widthInches, it.boardSize).amount;
      }
      if (it.rateUnit === 'PCS') {
        const p = typeof it.pieces === 'number' ? it.pieces : (parseFloat(String(it.pieces)) || 0);
        const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : 0;
        return acc + Math.round(p * r * 100) / 100;
      }
      const isSqft = (typeof it.widthInches === 'number' ? it.widthInches : 0) >= 7 && it.rateUnit !== 'CFT';
      const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : (isSqft ? 120 : defaultRate);
      const mult = isSqft ? (it.sqft || 0) : (it.cft || 0);
      return acc + Math.round(mult * r * 100) / 100;
    }, 0);
    return {
      woodType: wood,
      items: groupItems,
      totalPieces,
      totalCft,
      totalAmount
    };
  });
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
export function groupTimberByWidth(items: MeasurementItem[], defaultRate = 1200): TimberWidthGroup[] {
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
    const totalAmount = groupItems.reduce((acc, it) => {
      if (typeof it.amount === 'number' && it.amount > 0) {
        return acc + it.amount;
      }
      const isSqft = widthInches >= 7 && it.rateUnit !== 'CFT';
      const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : (isSqft ? 120 : defaultRate);
      const mult = isSqft ? (it.sqft || 0) : (it.cft || 0);
      return acc + Math.round(mult * r * 100) / 100;
    }, 0);
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
