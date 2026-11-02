import type { BusinessSettings, MeasurementSheet } from '../types';
import { formatValue } from './calculator';

export function exportSheetToCsv(sheet: MeasurementSheet, settings?: BusinessSettings): void {
  const companyName = settings?.companyName || 'Hindustan Saw Mill & Wood Industries (Since 1971)';
  const csvRows: string[] = [];

  // UTF-8 BOM for Microsoft Excel compatibility
  const BOM = '\uFEFF';

  // Company and Document Header Metadata
  csvRows.push(`"${companyName.replace(/"/g, '""')}"`);
  csvRows.push(`"TIMBER MEASUREMENT TALLY & CFT / SQFT REPORT"`);
  csvRows.push('');
  csvRows.push(`"Sheet Name:","${sheet.sheetName.replace(/"/g, '""')}"`);
  csvRows.push(`"Reference Number:","${sheet.referenceNumber.replace(/"/g, '""')}"`);
  csvRows.push(`"Customer Name:","${sheet.customerName.replace(/"/g, '""')}"`);
  csvRows.push(`"Project / Site:","${sheet.projectName.replace(/"/g, '""')}"`);
  csvRows.push(`"Measurement Date:","${sheet.measurementDate}"`);
  if (sheet.notes) {
    csvRows.push(`"Notes / Remarks:","${sheet.notes.replace(/"/g, '""')}"`);
  }
  csvRows.push('');

  // Table Column Headers
  csvRows.push([
    '"Sr No"',
    '"Wood Species / Item"',
    '"Length (Feet)"',
    '"Width (Inches)"',
    '"Thickness (Inches)"',
    '"Number of Pieces"',
    '"Total CFT"',
    '"Total SQFT"',
    '"Remarks"'
  ].join(','));

  // Data Rows
  sheet.items.forEach((item, index) => {
    const l = typeof item.lengthFeet === 'number' ? item.lengthFeet : 0;
    const w = typeof item.widthInches === 'number' ? item.widthInches : 0;
    const t = typeof item.thicknessInches === 'number' ? item.thicknessInches : 0;
    const p = typeof item.pieces === 'number' ? item.pieces : 0;

    csvRows.push([
      `"${index + 1}"`,
      `"${(item.woodType || 'Standard Sawn').replace(/"/g, '""')}"`,
      `"${l}"`,
      `"${w}"`,
      `"${t}"`,
      `"${p}"`,
      `"${formatValue(item.cft, 3)}"`,
      `"${formatValue(item.sqft, 3)}"`,
      `"${(item.remarks || '').replace(/"/g, '""')}"`
    ].join(','));
  });

  // Empty separator before grand totals
  csvRows.push('');

  // Grand Totals Summary Rows
  csvRows.push(`"SUMMARY TOTALS"`);
  csvRows.push(`"Total Measurement Entries:",${sheet.totalEntries}`);
  csvRows.push(`"Total Pieces Calculated:",${sheet.totalPieces}`);
  csvRows.push(`"Grand Total CFT (Cubic Feet):","${formatValue(sheet.totalCft, 3)}"`);
  csvRows.push(`"Grand Total SQFT (Square Feet):","${formatValue(sheet.totalSqft, 3)}"`);
  csvRows.push('');
  csvRows.push(`"Formulas Used:"`);
  csvRows.push(`"CFT = (Length_ft × Width_in × Thickness_in × Pieces) ÷ 144"`);
  csvRows.push(`"SQFT = CFT × 12"`);
  csvRows.push(`"Export Timestamp:","${new Date().toLocaleString()}"`);

  const csvContent = BOM + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safeFilename = (sheet.sheetName || 'timber_sheet')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const dateStr = sheet.measurementDate || new Date().toISOString().split('T')[0];

  link.setAttribute('href', url);
  link.setAttribute('download', `${safeFilename}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
