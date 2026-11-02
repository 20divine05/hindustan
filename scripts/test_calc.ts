import { calculateCFT, calculateSQFT, calculateRow, calculateTotals, formatValue } from '../src/utils/calculator';
import type { MeasurementItem } from '../src/types';

function assertApprox(actual: number, expected: number, tolerance = 0.0001, label = '') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`FAIL [${label}]: expected ${expected}, got ${actual}`);
  }
  console.log(`✓ PASS: ${label} = ${actual}`);
}

function assertEquals(actual: any, expected: any, label = '') {
  if (actual !== expected) {
    throw new Error(`FAIL [${label}]: expected ${expected}, got ${actual}`);
  }
  console.log(`✓ PASS: ${label} = ${actual}`);
}

console.log('=== Running Timber Calculation Verification Tests ===\n');

// Test 1: Standard Example 1 (10ft x 4in x 3in x 10 pcs)
const cft1 = calculateCFT(10, 4, 3, 10);
assertApprox(cft1, 8.333333, 0.0001, 'Example 1 CFT (10ft x 4in x 3in x 10 pcs)');
assertEquals(formatValue(cft1, 3), '8.333', 'Example 1 Formatted CFT');

const sqft1 = calculateSQFT(10, 4, 10);
assertApprox(sqft1, 33.333333, 0.0001, 'Example 1 SQFT');
assertEquals(formatValue(sqft1, 3), '33.333', 'Example 1 Formatted SQFT');

// Test 2: Standard Example 2 (12ft x 6in x 2in x 8 pcs)
const cft2 = calculateCFT(12, 6, 2, 8);
assertApprox(cft2, 8.0, 0.0001, 'Example 2 CFT (12ft x 6in x 2in x 8 pcs)');
assertEquals(formatValue(cft2, 3), '8.000', 'Example 2 Formatted CFT');

const sqft2 = calculateSQFT(12, 6, 8);
assertApprox(sqft2, 48.0, 0.0001, 'Example 2 SQFT');
assertEquals(formatValue(sqft2, 3), '48.000', 'Example 2 Formatted SQFT');

// Test 3: Decimal Dimensions (8.5ft x 5.25in x 1.75in x 24 pcs)
const cft3 = calculateCFT(8.5, 5.25, 1.75, 24);
assertApprox(cft3, 13.015625, 0.000001, 'Example 3 Decimal CFT');
assertEquals(formatValue(cft3, 3), '13.016', 'Example 3 Formatted CFT');

const sqft3 = calculateSQFT(8.5, 5.25, 24);
assertApprox(sqft3, 89.25, 0.000001, 'Example 3 Decimal SQFT');
assertEquals(formatValue(sqft3, 3), '89.250', 'Example 3 Formatted SQFT');

// Test 4: Invalid and Boundary Inputs
const cftInvalid = calculateCFT(-10, 4, 3, 10);
assertEquals(cftInvalid, 0, 'Negative length returns 0 CFT');

const rowCalcEmpty = calculateRow('', 4, 3, 10);
assertEquals(rowCalcEmpty.isValid, false, 'Incomplete row is invalid');
assertEquals(rowCalcEmpty.cft, 0, 'Incomplete row returns 0 CFT');

// Test 5: Grand Totals (Unrounded sum precision)
const items: MeasurementItem[] = [
  { id: '1', serialNumber: 1, lengthFeet: 10, widthInches: 4, thicknessInches: 3, pieces: 10, cft: cft1, sqft: sqft1 },
  { id: '2', serialNumber: 2, lengthFeet: 12, widthInches: 6, thicknessInches: 2, pieces: 8, cft: cft2, sqft: sqft2 },
  { id: '3', serialNumber: 3, lengthFeet: 8.5, widthInches: 5.25, thicknessInches: 1.75, pieces: 24, cft: cft3, sqft: sqft3 }
];

const totals = calculateTotals(items);
assertEquals(totals.totalEntries, 3, 'Total Entries');
assertEquals(totals.totalPieces, 42, 'Total Pieces');
assertApprox(totals.totalCft, 29.348958, 0.0001, 'Grand Total Raw CFT');
assertEquals(formatValue(totals.totalCft, 3), '29.349', 'Grand Total Formatted CFT');
assertApprox(totals.totalSqft, 170.583333, 0.0001, 'Grand Total Raw SQFT');
assertEquals(formatValue(totals.totalSqft, 3), '170.583', 'Grand Total Formatted SQFT');

console.log('\n=== All Timber Calculation Tests Passed Successfully! ===');
