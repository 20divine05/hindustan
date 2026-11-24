// Quarter Girth (Hoppus) Rule Calculator for Round Timber Logs
// Built for Hindustan Saw Mill & Wood Industries

import type {
  RoundLogOutputUnit,
  RoundLogInputUnitType,
  RoundLogItem,
  RoundLogTotals,
  GirthSlabType
} from '../types';

export {
  type RoundLogOutputUnit,
  type RoundLogInputUnitType,
  type RoundLogItem,
  type RoundLogTotals,
  type GirthSlabType
};

export interface GirthSlabInfo {
  id: GirthSlabType;
  label: string; // 'Upto 23"', 'Above 24"', 'Above 36"', 'Above 48"', 'Above 60"'
  shortLabel: string;
  minGirthIn: number;
  maxGirthIn: number;
}

export const GIRTH_SLAB_LIST: GirthSlabInfo[] = [
  { id: 'upto_23', label: 'Upto 23"', shortLabel: '<=23"', minGirthIn: 0, maxGirthIn: 23 },
  { id: 'above_24', label: 'Above 24"', shortLabel: '24"-35"', minGirthIn: 24, maxGirthIn: 35.99 },
  { id: 'above_36', label: 'Above 36"', shortLabel: '36"-47"', minGirthIn: 36, maxGirthIn: 47.99 },
  { id: 'above_48', label: 'Above 48"', shortLabel: '48"-59"', minGirthIn: 48, maxGirthIn: 59.99 },
  { id: 'above_60', label: 'Above 60"', shortLabel: '>=60"', minGirthIn: 60, maxGirthIn: Infinity }
];

/**
 * Categorizes normalized girth in inches (G_in) into the 5 standard timber girth slabs:
 * 1. Upto 23"  (G_in <= 23)
 * 2. Above 24" (G_in > 23 && G_in < 36)
 * 3. Above 36" (G_in >= 36 && G_in < 48)
 * 4. Above 48" (G_in >= 48 && G_in < 60)
 * 5. Above 60" (G_in >= 60)
 */
export function getGirthSlab(girthInches: number): GirthSlabInfo {
  if (girthInches <= 23) {
    return GIRTH_SLAB_LIST[0]; // Upto 23"
  } else if (girthInches < 36) {
    return GIRTH_SLAB_LIST[1]; // Above 24" (> 23 && < 36)
  } else if (girthInches < 48) {
    return GIRTH_SLAB_LIST[2]; // Above 36" (>= 36 && < 48)
  } else if (girthInches < 60) {
    return GIRTH_SLAB_LIST[3]; // Above 48" (>= 48 && < 60)
  } else {
    return GIRTH_SLAB_LIST[4]; // Above 60" (>= 60)
  }
}

export const ROUND_LOG_INPUT_UNIT_OPTIONS: {
  id: RoundLogInputUnitType;
  label: string;
  pillLabel: string;
  girthUnit: string;
  lengthUnit: string;
  shortLabel: string;
  formulaDisplayCFT: string;
  formulaDisplayCBM: string;
}[] = [
  {
    id: 'girth_in_length_ft',
    label: 'Girth in inch × Length in ft',
    pillLabel: 'in × ft',
    girthUnit: 'in',
    lengthUnit: 'ft',
    shortLabel: 'G (in) × L (ft)',
    formulaDisplayCFT: 'CFT = ((G × G × L) ÷ 2304) × Pcs',
    formulaDisplayCBM: 'CBM = ((G × G × L) ÷ 81364.9921) × Pcs'
  },
  {
    id: 'girth_ft_length_ft',
    label: 'Girth in ft × Length in ft',
    pillLabel: 'ft × ft',
    girthUnit: 'ft',
    lengthUnit: 'ft',
    shortLabel: 'G (ft, in) × L (ft)',
    formulaDisplayCFT: 'CFT = ((G_total_ft² × L) ÷ 16) × Pcs',
    formulaDisplayCBM: 'CBM = ((G_total_ft² × L) ÷ 565.0347) × Pcs'
  },
  {
    id: 'girth_m_length_m',
    label: 'Girth in meter × Length in meter',
    pillLabel: 'm × m',
    girthUnit: 'm',
    lengthUnit: 'm',
    shortLabel: 'G (m) × L (m)',
    formulaDisplayCFT: 'CFT = (((G × G × L) ÷ 16) × 35.3147) × Pcs',
    formulaDisplayCBM: 'CBM = ((G × G × L) ÷ 16) × Pcs'
  },
  {
    id: 'girth_cm_length_cm',
    label: 'Girth in centimeter × Length in centimeter',
    pillLabel: 'cm × cm',
    girthUnit: 'cm',
    lengthUnit: 'cm',
    shortLabel: 'G (cm) × L (cm)',
    formulaDisplayCFT: 'CFT = ((G × G × L) ÷ 453069.5455) × Pcs',
    formulaDisplayCBM: 'CBM = ((G × G × L) ÷ 16000000) × Pcs'
  }
];

export function getRoundLogUnitConfig(inputUnit: RoundLogInputUnitType) {
  const found = ROUND_LOG_INPUT_UNIT_OPTIONS.find(opt => opt.id === inputUnit);
  return found || ROUND_LOG_INPUT_UNIT_OPTIONS[0];
}

export function getRoundLogUnitFormulaDescription(
  outputUnit: RoundLogOutputUnit,
  inputUnit: RoundLogInputUnitType
): string {
  const config = getRoundLogUnitConfig(inputUnit);
  return outputUnit === 'CFT' ? config.formulaDisplayCFT : config.formulaDisplayCBM;
}

export interface NormalizedRoundLogCalc {
  girthInches: number; // G_in
  girthFtInStr: string; // e.g. "5' 10\""
  cft: number; // total CFT volume for all pieces
  cbm: number; // total CBM volume for all pieces
  volume: number; // in outputUnit
  slab: GirthSlabInfo;
  pieces: number;
}

/**
 * Computes normalized dimensions, girth in inches, ft|in string, CFT, CBM, and girth slab
 * based on the exact user-specified formulas.
 */
export function computeRoundLogDimensions(params: {
  girth: number; // primary numeric value or feet part
  girthInPart?: number; // inch part when inputUnit is girth_ft_length_ft
  length: number;
  pieces: number;
  inputUnit: RoundLogInputUnitType;
  outputUnit: RoundLogOutputUnit;
}): NormalizedRoundLogCalc {
  const { girth, girthInPart = 0, length, pieces, inputUnit, outputUnit } = params;
  const p = pieces > 0 ? pieces : 1;
  const l = length > 0 ? length : 0;

  let gIn = 0;
  let gFtInStr = '';
  let cft = 0;
  let cbm = 0;

  switch (inputUnit) {
    case 'girth_ft_length_ft': {
      const gFt = girth > 0 ? girth : 0;
      const gInP = girthInPart > 0 ? girthInPart : 0;
      gIn = Math.round(((gFt * 12) + gInP) * 100) / 100;
      gFtInStr = `${gFt}' ${gInP}"`;
      const gTotalFt = gFt + (gInP / 12);
      cft = ((gTotalFt * gTotalFt * l) / 16) * p;
      cbm = ((gTotalFt * gTotalFt * l) / 565.0347) * p;
      break;
    }
    case 'girth_in_length_ft': {
      gIn = girth > 0 ? girth : 0;
      const ft = Math.floor(gIn / 12);
      const remIn = Math.round((gIn % 12) * 10) / 10;
      gFtInStr = `${ft}' ${remIn}"`;
      cft = ((gIn * gIn * l) / 2304) * p;
      cbm = ((gIn * gIn * l) / 81364.9921) * p;
      break;
    }
    case 'girth_m_length_m': {
      const gM = girth > 0 ? girth : 0;
      gIn = Math.round(gM * 39.3701 * 100) / 100;
      const ft = Math.floor(gIn / 12);
      const remIn = Math.round((gIn % 12) * 10) / 10;
      gFtInStr = `${ft}' ${remIn}"`;
      cbm = ((gM * gM * l) / 16) * p;
      cft = (((gM * gM * l) / 16) * 35.3147) * p;
      break;
    }
    case 'girth_cm_length_cm': {
      const gCm = girth > 0 ? girth : 0;
      gIn = Math.round((gCm / 2.54) * 100) / 100;
      const ft = Math.floor(gIn / 12);
      const remIn = Math.round((gIn % 12) * 10) / 10;
      gFtInStr = `${ft}' ${remIn}"`;
      cbm = ((gCm * gCm * l) / 16000000) * p;
      cft = ((gCm * gCm * l) / 453069.5455) * p;
      break;
    }
  }

  const roundedCft = Math.round(cft * 10000) / 10000;
  const roundedCbm = Math.round(cbm * 10000) / 10000;
  const volume = outputUnit === 'CFT' ? roundedCft : roundedCbm;
  const slab = getGirthSlab(gIn);

  return {
    girthInches: gIn,
    girthFtInStr: gFtInStr,
    cft: roundedCft,
    cbm: roundedCbm,
    volume,
    slab,
    pieces: p
  };
}

/**
 * Calculates Quarter Girth (Hoppus) rule volume for round logs.
 * Preserves backwards compatibility for direct row recalculations.
 */
export function calculateRoundLogRow(
  girth: number | '',
  length: number | '',
  pieces: number | '',
  outputUnit: RoundLogOutputUnit = 'CFT',
  inputUnit: RoundLogInputUnitType = 'girth_in_length_ft',
  girthInPart: number | '' = 0
): { volume: number; cft: number; cbm: number; girthInches: number; girthFtInStr: string; slab: GirthSlabInfo } {
  const g = typeof girth === 'number' ? girth : parseFloat(String(girth)) || 0;
  const gInP = typeof girthInPart === 'number' ? girthInPart : parseFloat(String(girthInPart)) || 0;
  const l = typeof length === 'number' ? length : parseFloat(String(length)) || 0;
  const pRaw = typeof pieces === 'number' ? pieces : parseFloat(String(pieces)) || 0;
  const p = pRaw > 0 ? pRaw : 1;

  if (g <= 0 || l <= 0 || p <= 0) {
    return {
      volume: 0,
      cft: 0,
      cbm: 0,
      girthInches: 0,
      girthFtInStr: '0\' 0"',
      slab: GIRTH_SLAB_LIST[0]
    };
  }

  const computed = computeRoundLogDimensions({
    girth: g,
    girthInPart: gInP,
    length: l,
    pieces: p,
    inputUnit,
    outputUnit
  });

  return {
    volume: computed.volume,
    cft: computed.cft,
    cbm: computed.cbm,
    girthInches: computed.girthInches,
    girthFtInStr: computed.girthFtInStr,
    slab: computed.slab
  };
}

export function calculateRoundLogTotals(
  items: RoundLogItem[],
  outputUnit: RoundLogOutputUnit = 'CFT'
): RoundLogTotals {
  let totalPieces = 0;
  let totalVolume = 0;
  let totalCft = 0;
  let totalCbm = 0;
  let totalAmount = 0;

  for (const it of items) {
    const p = typeof it.pieces === 'number' ? it.pieces : 0;
    const vol = typeof it.volume === 'number' ? it.volume : 0;
    const cft = typeof it.cft === 'number' ? it.cft : (it.outputUnit === 'CFT' ? vol : vol * 35.3147);
    const cbm = typeof it.cbm === 'number' ? it.cbm : (it.outputUnit === 'CBM' ? vol : vol / 35.3147);
    const amt = typeof it.amount === 'number' ? it.amount : 0;

    totalPieces += p;
    totalVolume += vol;
    totalCft += cft;
    totalCbm += cbm;
    totalAmount += amt;
  }

  return {
    totalEntries: items.length,
    totalPieces,
    totalVolume: Math.round(totalVolume * 10000) / 10000,
    totalCft: Math.round(totalCft * 10000) / 10000,
    totalCbm: Math.round(totalCbm * 10000) / 10000,
    outputUnit,
    totalAmount: Math.round(totalAmount * 100) / 100
  };
}

export interface SpeciesSlabBreakdown {
  slabId: GirthSlabType;
  slabLabel: string;
  pieces: number;
  cft: number;
  cbm: number;
  volume: number;
  items: RoundLogItem[];
  rate?: number;
  subtotal: number;
}

export interface SpeciesRoundGroup {
  woodType: string;
  items: RoundLogItem[];
  totalPieces: number;
  totalCft: number;
  totalCbm: number;
  totalVolume: number;
  totalAmount: number;
  slabs: Record<GirthSlabType, SpeciesSlabBreakdown>;
  activeSlabs: SpeciesSlabBreakdown[];
}

export interface OverallSlabTotals {
  totalPieces: number;
  totalCft: number;
  totalCbm: number;
  totalVolume: number;
  totalAmount: number;
  slabs: Record<GirthSlabType, { pieces: number; cft: number; cbm: number; volume: number }>;
}

/**
 * Groups round logs by wood species and decomposes each species into the 5 standard girth slabs.
 */
export function groupRoundLogsBySpeciesAndSlab(
  items: RoundLogItem[],
  outputUnit: RoundLogOutputUnit = 'CFT',
  inputUnit: RoundLogInputUnitType = 'girth_in_length_ft',
  slabRates: Record<string, number> = {}
): {
  speciesGroups: SpeciesRoundGroup[];
  overallTotals: OverallSlabTotals;
} {
  const speciesMap = new Map<string, RoundLogItem[]>();

  for (const it of items) {
    const wt = (it.woodType || 'ROUND LOG').trim().toUpperCase();
    if (!speciesMap.has(wt)) {
      speciesMap.set(wt, []);
    }
    speciesMap.get(wt)!.push(it);
  }

  const overallTotals: OverallSlabTotals = {
    totalPieces: 0,
    totalCft: 0,
    totalCbm: 0,
    totalVolume: 0,
    totalAmount: 0,
    slabs: {
      upto_23: { pieces: 0, cft: 0, cbm: 0, volume: 0 },
      above_24: { pieces: 0, cft: 0, cbm: 0, volume: 0 },
      above_36: { pieces: 0, cft: 0, cbm: 0, volume: 0 },
      above_48: { pieces: 0, cft: 0, cbm: 0, volume: 0 },
      above_60: { pieces: 0, cft: 0, cbm: 0, volume: 0 }
    }
  };

  const speciesGroups: SpeciesRoundGroup[] = [];

  speciesMap.forEach((spItems, woodType) => {
    const slabs: Record<GirthSlabType, SpeciesSlabBreakdown> = {
      upto_23: { slabId: 'upto_23', slabLabel: 'Upto 23"', pieces: 0, cft: 0, cbm: 0, volume: 0, items: [], subtotal: 0 },
      above_24: { slabId: 'above_24', slabLabel: 'Above 24"', pieces: 0, cft: 0, cbm: 0, volume: 0, items: [], subtotal: 0 },
      above_36: { slabId: 'above_36', slabLabel: 'Above 36"', pieces: 0, cft: 0, cbm: 0, volume: 0, items: [], subtotal: 0 },
      above_48: { slabId: 'above_48', slabLabel: 'Above 48"', pieces: 0, cft: 0, cbm: 0, volume: 0, items: [], subtotal: 0 },
      above_60: { slabId: 'above_60', slabLabel: 'Above 60"', pieces: 0, cft: 0, cbm: 0, volume: 0, items: [], subtotal: 0 }
    };

    let spTotalPieces = 0;
    let spTotalCft = 0;
    let spTotalCbm = 0;
    let spTotalVolume = 0;
    let spTotalAmount = 0;

    for (const it of spItems) {
      // Ensure row has normalized dimensions and slab
      const g = typeof it.girth === 'number' ? it.girth : 0;
      const gInP = typeof it.girthInPart === 'number' ? it.girthInPart : 0;
      const l = typeof it.length === 'number' ? it.length : 0;
      const p = typeof it.pieces === 'number' && it.pieces > 0 ? it.pieces : 1;

      let cftVal = typeof it.cft === 'number' && it.cft > 0 ? it.cft : 0;
      let cbmVal = typeof it.cbm === 'number' && it.cbm > 0 ? it.cbm : 0;
      let slabIdVal = it.slabId;

      if (!slabIdVal || (cftVal === 0 && cbmVal === 0)) {
        const computed = computeRoundLogDimensions({
          girth: g,
          girthInPart: gInP,
          length: l,
          pieces: p,
          inputUnit: it.inputUnit || inputUnit,
          outputUnit: it.outputUnit || outputUnit
        });
        cftVal = computed.cft;
        cbmVal = computed.cbm;
        slabIdVal = computed.slab.id;
        it.cft = computed.cft;
        it.cbm = computed.cbm;
        it.girthInches = computed.girthInches;
        it.girthFtInStr = computed.girthFtInStr;
        it.slabId = computed.slab.id;
        it.slabLabel = computed.slab.label;
        it.volume = computed.volume;
      }

      const activeVol = outputUnit === 'CFT' ? cftVal : cbmVal;
      const targetSlab = slabs[slabIdVal];
      targetSlab.pieces += p;
      targetSlab.cft += cftVal;
      targetSlab.cbm += cbmVal;
      targetSlab.volume += activeVol;
      targetSlab.items.push(it);

      spTotalPieces += p;
      spTotalCft += cftVal;
      spTotalCbm += cbmVal;
      spTotalVolume += activeVol;

      // Slab key rate
      const rateKey = `${woodType}__${slabIdVal}`;
      const slabRate = slabRates[rateKey] ?? (typeof it.rate === 'number' ? it.rate : 0);
      const rowAmt = slabRate > 0 ? Math.round(activeVol * slabRate * 100) / 100 : (it.amount || 0);
      spTotalAmount += rowAmt;

      // Overall slab accumulation
      overallTotals.slabs[slabIdVal].pieces += p;
      overallTotals.slabs[slabIdVal].cft += cftVal;
      overallTotals.slabs[slabIdVal].cbm += cbmVal;
      overallTotals.slabs[slabIdVal].volume += activeVol;
    }

    // Assign rates and subtotals per slab
    const activeSlabs: SpeciesSlabBreakdown[] = [];
    GIRTH_SLAB_LIST.forEach((slabDef) => {
      const s = slabs[slabDef.id];
      s.cft = Math.round(s.cft * 10000) / 10000;
      s.cbm = Math.round(s.cbm * 10000) / 10000;
      s.volume = Math.round(s.volume * 10000) / 10000;

      const rateKey = `${woodType}__${slabDef.id}`;
      const slabRate = slabRates[rateKey];
      if (slabRate !== undefined) {
        s.rate = slabRate;
      } else if (s.items.length > 0 && typeof s.items[0].rate === 'number' && s.items[0].rate > 0) {
        s.rate = s.items[0].rate;
      }
      s.subtotal = s.rate && s.rate > 0 ? Math.round(s.volume * s.rate * 100) / 100 : 0;

      if (s.items.length > 0) {
        activeSlabs.push(s);
      }
    });

    overallTotals.totalPieces += spTotalPieces;
    overallTotals.totalCft += spTotalCft;
    overallTotals.totalCbm += spTotalCbm;
    overallTotals.totalVolume += spTotalVolume;
    overallTotals.totalAmount += spTotalAmount;

    speciesGroups.push({
      woodType,
      items: spItems,
      totalPieces: spTotalPieces,
      totalCft: Math.round(spTotalCft * 10000) / 10000,
      totalCbm: Math.round(spTotalCbm * 10000) / 10000,
      totalVolume: Math.round(spTotalVolume * 10000) / 10000,
      totalAmount: Math.round(spTotalAmount * 100) / 100,
      slabs,
      activeSlabs
    });
  });

  overallTotals.totalCft = Math.round(overallTotals.totalCft * 10000) / 10000;
  overallTotals.totalCbm = Math.round(overallTotals.totalCbm * 10000) / 10000;
  overallTotals.totalVolume = Math.round(overallTotals.totalVolume * 10000) / 10000;
  overallTotals.totalAmount = Math.round(overallTotals.totalAmount * 100) / 100;

  GIRTH_SLAB_LIST.forEach((slabDef) => {
    const s = overallTotals.slabs[slabDef.id];
    s.cft = Math.round(s.cft * 10000) / 10000;
    s.cbm = Math.round(s.cbm * 10000) / 10000;
    s.volume = Math.round(s.volume * 10000) / 10000;
  });

  return { speciesGroups, overallTotals };
}

export interface RoundLogSlabSpeciesGroup {
  woodType: string;
  items: RoundLogItem[];
  totalPieces: number;
  totalVolume: number;
  totalCft: number;
  totalCbm: number;
  rate: number;
  subtotal: number;
}

export interface RoundLogSlabSection {
  slabId: GirthSlabType;
  slabTitle: string; // 'UPTO 23"', 'ABOVE 24"', 'ABOVE 36"', 'ABOVE 48"', 'ABOVE 60"'
  slabRangeLabel: string;
  speciesGroups: RoundLogSlabSpeciesGroup[];
  totalPieces: number;
  totalVolume: number;
  totalCft: number;
  totalCbm: number;
  totalAmount: number;
}

/**
 * Groups round logs vertically by Girth Slab first (in ascending order of girth:
 * Upto 23", Above 24", Above 36", Above 48", Above 60"), and by Wood Species inside each Girth Slab section.
 * Only includes sections that have at least 1 log.
 */
export function groupRoundLogsBySlabFirst(
  items: RoundLogItem[],
  outputUnit: RoundLogOutputUnit = 'CFT',
  inputUnit: RoundLogInputUnitType = 'girth_in_length_ft',
  slabRates: Record<string, number> = {}
): {
  slabSections: RoundLogSlabSection[];
  overallTotals: {
    totalPieces: number;
    totalVolume: number;
    totalCft: number;
    totalCbm: number;
    totalAmount: number;
  };
} {
  const SLAB_DEFS: Array<{ id: GirthSlabType; title: string; rangeLabel: string }> = [
    { id: 'upto_23', title: 'UPTO 23"', rangeLabel: 'G_in ≤ 23"' },
    { id: 'above_24', title: 'ABOVE 24"', rangeLabel: '23" < G_in < 36"' },
    { id: 'above_36', title: 'ABOVE 36"', rangeLabel: '36" ≤ G_in < 48"' },
    { id: 'above_48', title: 'ABOVE 48"', rangeLabel: '48" ≤ G_in < 60"' },
    { id: 'above_60', title: 'ABOVE 60"', rangeLabel: 'G_in ≥ 60"' },
  ];

  // Ensure all items have normalized slabId, volume, cft, cbm
  const normalizedItems = (items || []).map((it) => {
    const g = typeof it.girth === 'number' ? it.girth : 0;
    const gInP = typeof it.girthInPart === 'number' ? it.girthInPart : 0;
    const l = typeof it.length === 'number' ? it.length : 0;
    const p = typeof it.pieces === 'number' && it.pieces > 0 ? it.pieces : 1;
    const itemInputUnit = it.inputUnit || inputUnit;

    let slabId = it.slabId;
    let cft = typeof it.cft === 'number' && it.cft > 0 ? it.cft : 0;
    let cbm = typeof it.cbm === 'number' && it.cbm > 0 ? it.cbm : 0;
    let gInches = it.girthInches;
    let gFtInStr = it.girthFtInStr;

    if (!slabId || (cft === 0 && cbm === 0)) {
      const comp = computeRoundLogDimensions({
        girth: g,
        girthInPart: gInP,
        length: l,
        pieces: p,
        inputUnit: itemInputUnit,
        outputUnit
      });
      slabId = comp.slab.id;
      cft = comp.cft;
      cbm = comp.cbm;
      gInches = comp.girthInches;
      gFtInStr = comp.girthFtInStr;
    }

    return {
      ...it,
      slabId,
      cft,
      cbm,
      volume: outputUnit === 'CFT' ? cft : cbm,
      girthInches: gInches,
      gFtInStr: gFtInStr
    };
  });

  const slabSections: RoundLogSlabSection[] = [];
  const overallTotals = {
    totalPieces: 0,
    totalVolume: 0,
    totalCft: 0,
    totalCbm: 0,
    totalAmount: 0
  };

  for (const slabDef of SLAB_DEFS) {
    const slabItems = normalizedItems.filter((it) => it.slabId === slabDef.id);
    if (slabItems.length === 0) continue; // Only render sections that contain at least 1 log

    const speciesMap = new Map<string, RoundLogItem[]>();
    for (const it of slabItems) {
      const wt = (it.woodType || 'ROUND LOG').trim().toUpperCase();
      if (!speciesMap.has(wt)) {
        speciesMap.set(wt, []);
      }
      speciesMap.get(wt)!.push(it);
    }

    const speciesGroups: RoundLogSlabSpeciesGroup[] = [];
    let slabPieces = 0;
    let slabVolume = 0;
    let slabCft = 0;
    let slabCbm = 0;
    let slabAmount = 0;

    speciesMap.forEach((spItems, woodType) => {
      // Find matching slab rate: check woodType__slabId with case-insensitivity
      const exactKey = `${woodType}__${slabDef.id}`;
      let rate = slabRates[exactKey];
      if (rate === undefined) {
        const foundKey = Object.keys(slabRates).find(
          (k) => k.trim().toUpperCase() === exactKey.trim().toUpperCase()
        );
        if (foundKey) {
          rate = slabRates[foundKey];
        }
      }
      if (rate === undefined && spItems.length > 0 && typeof spItems[0].rate === 'number' && spItems[0].rate > 0) {
        rate = spItems[0].rate;
      }
      const finalRate = rate && rate > 0 ? rate : 0;

      let spPieces = 0;
      let spCft = 0;
      let spCbm = 0;
      let spVolume = 0;
      let spAmount = 0;

      for (const it of spItems) {
        const p = typeof it.pieces === 'number' && it.pieces > 0 ? it.pieces : 1;
        const itCft = typeof it.cft === 'number' ? it.cft : 0;
        const itCbm = typeof it.cbm === 'number' ? it.cbm : 0;
        const activeVol = outputUnit === 'CFT' ? itCft : itCbm;
        const itRate = finalRate > 0 ? finalRate : (typeof it.rate === 'number' ? it.rate : 0);
        const itAmount = it.amount && it.amount > 0 ? it.amount : (itRate > 0 ? Math.round(activeVol * itRate * 100) / 100 : 0);

        it.rate = itRate;
        it.amount = itAmount;

        spPieces += p;
        spCft += itCft;
        spCbm += itCbm;
        spVolume += activeVol;
        spAmount += itAmount;
      }

      const spSubtotal = finalRate > 0 ? Math.round(spVolume * finalRate * 100) / 100 : Math.round(spAmount * 100) / 100;

      speciesGroups.push({
        woodType,
        items: spItems,
        totalPieces: spPieces,
        totalVolume: Math.round(spVolume * 10000) / 10000,
        totalCft: Math.round(spCft * 10000) / 10000,
        totalCbm: Math.round(spCbm * 10000) / 10000,
        rate: finalRate,
        subtotal: spSubtotal
      });

      slabPieces += spPieces;
      slabVolume += spVolume;
      slabCft += spCft;
      slabCbm += spCbm;
      slabAmount += spSubtotal;
    });

    slabSections.push({
      slabId: slabDef.id,
      slabTitle: slabDef.title,
      slabRangeLabel: slabDef.rangeLabel,
      speciesGroups,
      totalPieces: slabPieces,
      totalVolume: Math.round(slabVolume * 10000) / 10000,
      totalCft: Math.round(slabCft * 10000) / 10000,
      totalCbm: Math.round(slabCbm * 10000) / 10000,
      totalAmount: Math.round(slabAmount * 100) / 100
    });

    overallTotals.totalPieces += slabPieces;
    overallTotals.totalVolume += slabVolume;
    overallTotals.totalCft += slabCft;
    overallTotals.totalCbm += slabCbm;
    overallTotals.totalAmount += slabAmount;
  }

  overallTotals.totalVolume = Math.round(overallTotals.totalVolume * 10000) / 10000;
  overallTotals.totalCft = Math.round(overallTotals.totalCft * 10000) / 10000;
  overallTotals.totalCbm = Math.round(overallTotals.totalCbm * 10000) / 10000;
  overallTotals.totalAmount = Math.round(overallTotals.totalAmount * 100) / 100;

  return { slabSections, overallTotals };
}
