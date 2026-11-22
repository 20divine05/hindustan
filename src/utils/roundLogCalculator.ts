// Quarter Girth (Hoppus) Rule Calculator for Round Timber Logs
// Built for Hindustan Saw Mill & Wood Industries

export type RoundLogOutputUnit = 'CFT' | 'CBM';

export type RoundLogInputUnitType =
  | 'girth_in_length_ft'
  | 'girth_ft_length_ft'
  | 'girth_m_length_m'
  | 'girth_cm_length_cm';

export interface RoundLogItem {
  id: string;
  serialNumber: number;
  woodType?: string;
  girth: number | '';
  length: number | '';
  pieces: number | '';
  volume: number; // in outputUnit (CFT or CBM)
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
  outputUnit: RoundLogOutputUnit;
  totalAmount: number;
}

export const ROUND_LOG_INPUT_UNIT_OPTIONS: {
  id: RoundLogInputUnitType;
  label: string;
  girthUnit: string;
  lengthUnit: string;
  shortLabel: string;
  formulaDisplayCFT: string;
  formulaDisplayCBM: string;
}[] = [
  {
    id: 'girth_in_length_ft',
    label: 'Girth in inch × Length in ft',
    girthUnit: 'in',
    lengthUnit: 'ft',
    shortLabel: 'G (in) × L (ft)',
    formulaDisplayCFT: 'CFT = (G × G × L) ÷ 2304',
    formulaDisplayCBM: 'CBM = (G × G × L) ÷ 81364.9921'
  },
  {
    id: 'girth_ft_length_ft',
    label: 'Girth in ft × Length in ft',
    girthUnit: 'ft',
    lengthUnit: 'ft',
    shortLabel: 'G (ft) × L (ft)',
    formulaDisplayCFT: 'CFT = (G × G × L) ÷ 16',
    formulaDisplayCBM: 'CBM = (G × G × L) ÷ 565.0347'
  },
  {
    id: 'girth_m_length_m',
    label: 'Girth in meter × Length in meter',
    girthUnit: 'm',
    lengthUnit: 'm',
    shortLabel: 'G (m) × L (m)',
    formulaDisplayCFT: 'CFT = ((G × G × L) ÷ 16) × 35.3147',
    formulaDisplayCBM: 'CBM = (G × G × L) ÷ 16'
  },
  {
    id: 'girth_cm_length_cm',
    label: 'Girth in centimeter × Length in centimeter',
    girthUnit: 'cm',
    lengthUnit: 'cm',
    shortLabel: 'G (cm) × L (cm)',
    formulaDisplayCFT: 'CFT = (G × G × L) ÷ 453069.5455',
    formulaDisplayCBM: 'CBM = (G × G × L) ÷ 16000000'
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

/**
 * Calculates Quarter Girth (Hoppus) rule volume for round logs.
 *
 * Formulas applied:
 * 1. When Output Unit = CFT (Cubic Feet):
 *    - Girth in inch × Length in ft: CFT = (G * G * L) / 2304
 *    - Girth in ft × Length in ft: CFT = (G * G * L) / 16
 *    - Girth in meter × Length in meter: CFT = ((G * G * L) / 16) * 35.3147
 *    - Girth in centimeter × Length in centimeter: CFT = (G * G * L) / 453069.5455
 *
 * 2. When Output Unit = CBM (Cubic Meters):
 *    - Girth in inch × Length in ft: CBM = (G * G * L) / 81364.9921
 *    - Girth in ft × Length in ft: CBM = (G * G * L) / 565.0347
 *    - Girth in meter × Length in meter: CBM = (G * G * L) / 16
 *    - Girth in centimeter × Length in centimeter: CBM = (G * G * L) / 16000000
 */
export function calculateRoundLogRow(
  girth: number | '',
  length: number | '',
  pieces: number | '',
  outputUnit: RoundLogOutputUnit = 'CFT',
  inputUnit: RoundLogInputUnitType = 'girth_in_length_ft'
): { volume: number } {
  const g = typeof girth === 'number' ? girth : parseFloat(String(girth)) || 0;
  const l = typeof length === 'number' ? length : parseFloat(String(length)) || 0;
  const pRaw = typeof pieces === 'number' ? pieces : parseFloat(String(pieces)) || 0;
  const p = pRaw > 0 ? pRaw : 1;

  if (g <= 0 || l <= 0 || p <= 0) {
    return { volume: 0 };
  }

  let singleVolume = 0;

  if (outputUnit === 'CFT') {
    switch (inputUnit) {
      case 'girth_in_length_ft':
        singleVolume = (g * g * l) / 2304;
        break;
      case 'girth_ft_length_ft':
        singleVolume = (g * g * l) / 16;
        break;
      case 'girth_m_length_m':
        singleVolume = ((g * g * l) / 16) * 35.3147;
        break;
      case 'girth_cm_length_cm':
        singleVolume = (g * g * l) / 453069.5455;
        break;
    }
  } else {
    // CBM
    switch (inputUnit) {
      case 'girth_in_length_ft':
        singleVolume = (g * g * l) / 81364.9921;
        break;
      case 'girth_ft_length_ft':
        singleVolume = (g * g * l) / 565.0347;
        break;
      case 'girth_m_length_m':
        singleVolume = (g * g * l) / 16;
        break;
      case 'girth_cm_length_cm':
        singleVolume = (g * g * l) / 16000000;
        break;
    }
  }

  const totalVol = singleVolume * p;
  // Return with 4 decimal places for high precision
  return { volume: Math.round(totalVol * 10000) / 10000 };
}

export function calculateRoundLogTotals(
  items: RoundLogItem[],
  outputUnit: RoundLogOutputUnit = 'CFT'
): RoundLogTotals {
  let totalPieces = 0;
  let totalVolume = 0;
  let totalAmount = 0;

  for (const it of items) {
    const p = typeof it.pieces === 'number' ? it.pieces : 0;
    const vol = typeof it.volume === 'number' ? it.volume : 0;
    const amt = typeof it.amount === 'number' ? it.amount : 0;

    totalPieces += p;
    totalVolume += vol;
    totalAmount += amt;
  }

  return {
    totalEntries: items.length,
    totalPieces,
    totalVolume: Math.round(totalVolume * 1000) / 1000,
    outputUnit,
    totalAmount: Math.round(totalAmount * 100) / 100
  };
}
