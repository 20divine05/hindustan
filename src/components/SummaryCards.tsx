import React from 'react';
import { Layers, Box, Maximize2, Hash } from 'lucide-react';
import type { SheetTotals } from '../types';
import { formatCompact, formatValue } from '../utils/calculator';

interface SummaryCardsProps {
  totals: SheetTotals;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ totals }) => {
  return (
    <div className="summary-grid">
      {/* 1. Total Measurement Entries */}
      <div className="summary-card">
        <div className="summary-label">
          <Hash size={16} color="var(--primary-400)" />
          <span>Total Entries</span>
        </div>
        <div className="summary-value">
          {formatCompact(totals.totalEntries)}
          <span className="summary-unit" style={{ color: 'var(--text-subtle)' }}>lines</span>
        </div>
      </div>

      {/* 2. Total Pieces */}
      <div className="summary-card">
        <div className="summary-label">
          <Layers size={16} color="var(--amber-400)" />
          <span>Total Pieces</span>
        </div>
        <div className="summary-value">
          {formatCompact(totals.totalPieces)}
          <span className="summary-unit">pcs</span>
        </div>
      </div>

      {/* 3. Grand Total CFT */}
      <div className="summary-card highlight-cft">
        <div className="summary-label">
          <Box size={16} color="var(--primary-600)" />
          <span>Grand Total CFT</span>
        </div>
        <div className="summary-value" style={{ color: 'var(--primary-700)' }}>
          {formatValue(totals.totalCft, 3)}
          <span className="summary-unit" style={{ color: 'var(--primary-600)' }}>CFT</span>
        </div>
      </div>

      {/* 4. Grand Total SQFT */}
      <div className="summary-card highlight">
        <div className="summary-label">
          <Maximize2 size={16} color="var(--amber-400)" />
          <span>Grand Total SQFT</span>
        </div>
        <div className="summary-value" style={{ color: '#f59e0b' }}>
          {formatValue(totals.totalSqft, 3)}
          <span className="summary-unit">SQFT</span>
        </div>
      </div>
    </div>
  );
};
