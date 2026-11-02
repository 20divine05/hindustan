function calculateCFT(lengthFeet, widthInches, thicknessInches, pieces) {
  if (lengthFeet <= 0 || widthInches <= 0 || thicknessInches <= 0 || pieces <= 0) {
    return 0;
  }
  return (lengthFeet * widthInches * thicknessInches * pieces) / 144;
}

function calculateSQFT(cft) {
  if (cft <= 0 || !isFinite(cft)) {
    return 0;
  }
  return cft * 12;
}

function calculateTotals(items) {
  let totalPieces = 0;
  let totalCft = 0;
  let totalSqft = 0;
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
      totalSqft += calculateSQFT(rowCft);
    }
  }

  return {
    totalEntries: validEntries,
    totalPieces,
    totalCft,
    totalSqft
  };
}

function formatValue(value, decimals = 3) {
  if (isNaN(value) || !isFinite(value) || value === 0) {
    return (0).toFixed(decimals);
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function assertApprox(actual, expected, tolerance = 0.0001, label = '') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`FAIL [${label}]: expected ${expected}, got ${actual}`);
  }
  console.log(`✓ PASS: ${label} = ${actual}`);
}

function assertEquals(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(`FAIL [${label}]: expected ${expected}, got ${actual}`);
  }
  console.log(`✓ PASS: ${label} = ${actual}`);
}

console.log('=== Running Timber Calculation Verification Tests (SQFT = CFT * 12) ===\n');

// Test 1: Standard Example 1 (10ft x 4in x 3in x 10 pcs)
const cft1 = calculateCFT(10, 4, 3, 10);
assertApprox(cft1, 8.333333, 0.0001, 'Example 1 CFT (10ft x 4in x 3in x 10 pcs)');
assertEquals(formatValue(cft1, 3), '8.333', 'Example 1 Formatted CFT');

const sqft1 = calculateSQFT(cft1);
assertApprox(sqft1, 100.0, 0.0001, 'Example 1 SQFT (CFT * 12)');
assertEquals(formatValue(sqft1, 3), '100.000', 'Example 1 Formatted SQFT');

// Test 2: Standard Example 2 (12ft x 6in x 2in x 8 pcs)
const cft2 = calculateCFT(12, 6, 2, 8);
assertApprox(cft2, 8.0, 0.0001, 'Example 2 CFT (12ft x 6in x 2in x 8 pcs)');
assertEquals(formatValue(cft2, 3), '8.000', 'Example 2 Formatted CFT');

const sqft2 = calculateSQFT(cft2);
assertApprox(sqft2, 96.0, 0.0001, 'Example 2 SQFT (CFT * 12)');
assertEquals(formatValue(sqft2, 3), '96.000', 'Example 2 Formatted SQFT');

// Test 3: Decimal Dimensions (8.5ft x 5.25in x 1.75in x 24 pcs)
const cft3 = calculateCFT(8.5, 5.25, 1.75, 24);
assertApprox(cft3, 13.015625, 0.000001, 'Example 3 Decimal CFT');
assertEquals(formatValue(cft3, 3), '13.016', 'Example 3 Formatted CFT');

const sqft3 = calculateSQFT(cft3);
assertApprox(sqft3, 156.1875, 0.000001, 'Example 3 Decimal SQFT (CFT * 12)');
assertEquals(formatValue(sqft3, 3), '156.188', 'Example 3 Formatted SQFT');

// Test 4: Invalid and Boundary Inputs
const cftInvalid = calculateCFT(-10, 4, 3, 10);
assertEquals(cftInvalid, 0, 'Negative length returns 0 CFT');
assertEquals(calculateSQFT(cftInvalid), 0, 'Zero CFT returns 0 SQFT');

// Test 5: Grand Totals (Unrounded sum precision)
const items = [
  { id: '1', serialNumber: 1, lengthFeet: 10, widthInches: 4, thicknessInches: 3, pieces: 10 },
  { id: '2', serialNumber: 2, lengthFeet: 12, widthInches: 6, thicknessInches: 2, pieces: 8 },
  { id: '3', serialNumber: 3, lengthFeet: 8.5, widthInches: 5.25, thicknessInches: 1.75, pieces: 24 }
];

const totals = calculateTotals(items);
assertEquals(totals.totalEntries, 3, 'Total Entries');
assertEquals(totals.totalPieces, 42, 'Total Pieces');
assertApprox(totals.totalCft, 29.348958, 0.0001, 'Grand Total Raw CFT');
assertEquals(formatValue(totals.totalCft, 3), '29.349', 'Grand Total Formatted CFT');
assertApprox(totals.totalSqft, 352.1875, 0.0001, 'Grand Total Raw SQFT (Total CFT * 12)');
assertEquals(formatValue(totals.totalSqft, 3), '352.188', 'Grand Total Formatted SQFT');

console.log('\n=== All Timber Calculation Tests Passed Successfully! (SQFT = CFT * 12) ===');
