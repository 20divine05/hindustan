import React from 'react';
import { Tag, Plus, CheckCircle2 } from 'lucide-react';
import type {
  RoundLogItem,
  RoundLogOutputUnit,
  RoundLogInputUnitType,
  GirthSlabType
} from '../types';
import {
  groupRoundLogsBySpeciesAndSlab
} from '../utils/roundLogCalculator';
import { formatValue } from '../utils/calculator';
import { formatIndianCurrency } from '../utils/indianNumberWords';

interface RoundLogSlabPricingProps {
  items: RoundLogItem[];
  outputUnit: RoundLogOutputUnit;
  inputUnit: RoundLogInputUnitType;
  slabRates: Record<string, number>;
  onSlabRateChange: (woodType: string, slabId: GirthSlabType, rate: number) => void;
  customerName?: string;
  onNewSheet?: () => void;
}

export const RoundLogSlabPricing: React.FC<RoundLogSlabPricingProps> = ({
  items,
  outputUnit,
  inputUnit,
  slabRates,
  onSlabRateChange,
  customerName,
  onNewSheet
}) => {
  const { speciesGroups, overallTotals } = groupRoundLogsBySpeciesAndSlab(
    items,
    outputUnit,
    inputUnit,
    slabRates
  );

  return (
    <div className="measurement-tally-root" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Top Header & Live Summary Badge with ₹ Amount */}
      <div className="calc-step2-top-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem', flexWrap: 'wrap', gap: '0.4rem' }}>
        <div className="calc-step2-title-block mobile-hide">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="badge" style={{ backgroundColor: 'var(--primary-800)', color: '#fff', fontSize: '0.74rem', padding: '0.2rem 0.45rem', fontWeight: 800 }}>
              Stage 3
            </span>
            <h3 style={{ fontSize: '1.15rem', margin: 0, color: 'var(--text-main)', fontWeight: 800 }}>
              Girth Slab-Based Rate &amp; Pricing
            </h3>
          </div>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Customer: <strong>{customerName || 'Direct Cash Buyer'}</strong> &bull; Set rate per girth slab (₹/{outputUnit})
          </p>
        </div>

        <div className="calc-step2-actions-block" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', justifyContent: 'space-between' }}>
          <span className="badge calc-step2-total-badge" style={{ backgroundColor: 'var(--primary-100)', color: 'var(--primary-800)', border: '1px solid var(--primary-200)', fontSize: '0.74rem', padding: '0.22rem 0.5rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
            <span className="mobile-hide">{customerName ? `${customerName} • ` : ''}</span>
            TOTAL: {formatValue(overallTotals.totalVolume, 4)} {outputUnit} &bull; ₹ {formatIndianCurrency(overallTotals.totalAmount || 0)}
          </span>

          {onNewSheet && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onNewSheet}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.74rem', fontWeight: 700, padding: '0.22rem 0.55rem', whiteSpace: 'nowrap' }}
            >
              <Plus size={13} color="var(--primary-600)" />
              <span className="mobile-hide">New Sheet</span>
              <span className="mobile-show">New</span>
            </button>
          )}
        </div>
      </div>

      {/* Pricing instruction banner (Desktop only) */}
      <div className="mobile-hide" style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-subtle, #f1f5f9)',
        border: '1px solid var(--border-medium)',
        borderRadius: '8px',
        padding: '0.45rem 0.65rem',
        gap: '0.4rem'
      }}>
        <Tag size={15} color="var(--primary-700)" />
        <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>
          Enter the selling rate (<strong>₹ / {outputUnit}</strong>) for each active girth slab. Subtotals and grand totals update live.
        </span>
      </div>

      {/* Pricing Cards by Wood Species */}
      {speciesGroups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-medium)' }}>
          <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
            No logs available for pricing
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Please return to Round Log Entry to add logs.
          </p>
        </div>
      ) : (
        speciesGroups.map((sp) => (
          <div
            key={sp.woodType}
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '8px',
              border: '1.5px solid var(--border-medium)',
              overflow: 'hidden',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
            }}
          >
            {/* Wood Species Header */}
            <div
              style={{
                backgroundColor: 'var(--primary-50, #fcf7ee)',
                borderBottom: '1px solid var(--border-medium)',
                padding: '0.55rem 0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.35rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span style={{ backgroundColor: 'var(--primary-800)', color: '#fff', fontSize: '0.82rem', fontWeight: 800, padding: '0.22rem 0.6rem', borderRadius: '4px' }}>
                  🪵 {sp.woodType}
                </span>
                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {sp.totalPieces} Pcs &bull; {formatValue(sp.totalVolume, 4)} {outputUnit}
                </span>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--primary-800)', fontFamily: 'var(--font-mono)' }}>
                Subtotal: ₹ {formatIndianCurrency(sp.totalAmount)}
              </div>
            </div>

            {/* Active Slab Pricing Table (Desktop Spreadsheet View) */}
            <div className="mobile-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="calc-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', fontSize: '0.76rem', borderBottom: '1px solid var(--border-medium)' }}>
                    <th style={{ minWidth: '120px', padding: '0.45rem 0.65rem', textAlign: 'left' }}>
                      Girth Slab
                    </th>
                    <th style={{ textAlign: 'center', width: '70px', padding: '0.45rem 0.4rem' }}>
                      Pieces
                    </th>
                    <th style={{ textAlign: 'right', width: '120px', padding: '0.45rem 0.5rem' }}>
                      Volume ({outputUnit})
                    </th>
                    <th style={{ textAlign: 'center', width: '150px', padding: '0.45rem 0.5rem' }}>
                      Rate (₹ / {outputUnit})
                    </th>
                    <th style={{ textAlign: 'right', width: '150px', padding: '0.45rem 0.65rem' }}>
                      Subtotal (₹)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sp.activeSlabs.map((slab) => {
                    const rateKey = `${sp.woodType}__${slab.slabId}`;
                    const currentRate = slabRates[rateKey] !== undefined ? slabRates[rateKey] : (slab.rate || '');

                    return (
                      <tr key={slab.slabId} style={{ borderBottom: '1px solid var(--border-light)', fontSize: '0.84rem' }}>
                        {/* Slab Name */}
                        <td style={{ padding: '0.45rem 0.65rem' }}>
                          <span style={{ fontWeight: 800, color: 'var(--primary-900)', fontSize: '0.86rem' }}>
                            {slab.slabLabel}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                            {slab.items.length} logs classified
                          </span>
                        </td>

                        {/* Pieces */}
                        <td style={{ textAlign: 'center', fontWeight: 800, padding: '0.45rem 0.4rem' }}>
                          {slab.pieces} Pcs
                        </td>

                        {/* Volume */}
                        <td className="col-numeric" style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontWeight: 800, color: 'var(--primary-800)' }}>
                          {formatValue(slab.volume, 4)} {outputUnit}
                        </td>

                        {/* Rate Input Box */}
                        <td style={{ textAlign: 'center', padding: '0.35rem 0.5rem' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '8px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                              ₹
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              placeholder="Enter rate"
                              className="calc-input"
                              value={currentRate === 0 && slabRates[rateKey] === undefined ? '' : currentRate}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                onSlabRateChange(sp.woodType, slab.slabId, isNaN(val) ? 0 : val);
                              }}
                              style={{
                                width: '110px',
                                paddingLeft: '1.35rem',
                                paddingRight: '0.4rem',
                                textAlign: 'right',
                                fontWeight: 800,
                                fontSize: '0.88rem',
                                borderColor: currentRate && Number(currentRate) > 0 ? 'var(--primary-500)' : 'var(--border-medium)',
                                backgroundColor: currentRate && Number(currentRate) > 0 ? '#ffffff' : '#fffbeb'
                              }}
                            />
                          </div>
                        </td>

                        {/* Auto-Calculated Subtotal */}
                        <td className="col-numeric" style={{ textAlign: 'right', padding: '0.45rem 0.65rem', fontWeight: 900, color: 'var(--primary-900)', fontSize: '0.92rem' }}>
                          ₹ {formatIndianCurrency(slab.subtotal || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr style={{ backgroundColor: 'var(--bg-subtle, #f1f5f9)', fontWeight: 800, borderTop: '2px solid var(--border-medium)', fontSize: '0.84rem' }}>
                    <td colSpan={2} style={{ textAlign: 'right', padding: '0.5rem 0.65rem', textTransform: 'uppercase', color: 'var(--text-main)' }}>
                      Total {sp.woodType}:
                    </td>
                    <td className="col-numeric" style={{ textAlign: 'right', padding: '0.5rem 0.5rem', color: 'var(--primary-800)' }}>
                      {formatValue(sp.totalVolume, 4)} {outputUnit}
                    </td>
                    <td></td>
                    <td className="col-numeric" style={{ textAlign: 'right', padding: '0.5rem 0.65rem', color: 'var(--primary-800)', fontSize: '0.95rem', fontWeight: 900 }}>
                      ₹ {formatIndianCurrency(sp.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile View: 100% Screen Fit, Zero Horizontal Scroll, Compact Slab Pricing Rows */}
            <div className="mobile-show" style={{ width: '100%', padding: '0.3rem 0.45rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sp.activeSlabs.map((slab) => {
                const rateKey = `${sp.woodType}__${slab.slabId}`;
                const currentRate = slabRates[rateKey] !== undefined ? slabRates[rateKey] : (slab.rate || '');

                return (
                  <div
                    key={slab.slabId}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '6px',
                      padding: '0.35rem 0.55rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.4rem',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                    }}
                  >
                    {/* Slab Name & Volume */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--primary-900)' }}>
                          {slab.slabLabel}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          ({slab.pieces} Pcs)
                        </span>
                      </div>
                      <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--primary-800)', fontFamily: 'var(--font-mono)' }}>
                        {formatValue(slab.volume, 4)} {outputUnit}
                      </span>
                    </div>

                    {/* Rate Input & Subtotal */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          ₹
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          placeholder="Rate"
                          className="calc-input"
                          value={currentRate === 0 && slabRates[rateKey] === undefined ? '' : currentRate}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onSlabRateChange(sp.woodType, slab.slabId, isNaN(val) ? 0 : val);
                          }}
                          style={{
                            width: '80px',
                            height: '28px',
                            paddingLeft: '1.1rem',
                            paddingRight: '0.3rem',
                            textAlign: 'right',
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            borderColor: currentRate && Number(currentRate) > 0 ? 'var(--primary-500)' : 'var(--border-medium)',
                            backgroundColor: currentRate && Number(currentRate) > 0 ? '#ffffff' : '#fffbeb'
                          }}
                        />
                      </div>

                      <div style={{ minWidth: '78px', textAlign: 'right', lineHeight: 1.15 }}>
                        <span style={{ fontSize: '0.84rem', fontWeight: 900, color: 'var(--primary-900)', fontFamily: 'var(--font-mono)', display: 'block' }}>
                          ₹ {formatIndianCurrency(slab.subtotal || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Mobile Species Subtotal */}
              <div
                style={{
                  backgroundColor: 'var(--bg-subtle, #f8fafc)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '6px',
                  padding: '0.3rem 0.55rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '0.1rem'
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase' }}>
                  Total {sp.woodType}:
                </span>
                <span style={{ fontSize: '0.86rem', fontWeight: 900, color: 'var(--primary-900)', fontFamily: 'var(--font-mono)' }}>
                  ₹ {formatIndianCurrency(sp.totalAmount)}
                </span>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Grand Summary Card (Desktop) */}
      <div
        className="mobile-hide"
        style={{
          backgroundColor: 'var(--primary-50, #f8f6f0)',
          border: '2px solid var(--primary-400)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
          boxShadow: '0 2px 5px rgba(0,0,0,0.06)'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <CheckCircle2 size={16} color="var(--primary-700)" />
            <strong style={{ fontSize: '0.94rem', color: 'var(--primary-900)', textTransform: 'uppercase' }}>
              Grand Total Round Wood Amount:
            </strong>
          </div>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Total: {overallTotals.totalPieces} Pcs &bull; {formatValue(overallTotals.totalVolume, 4)} {outputUnit}
          </p>
        </div>

        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--primary-900)', fontFamily: 'var(--font-mono)' }}>
          ₹ {formatIndianCurrency(overallTotals.totalAmount || 0)}
        </div>
      </div>

      {/* Grand Summary Strip (Mobile - compact zero-scroll) */}
      <div
        className="mobile-show"
        style={{
          backgroundColor: 'var(--primary-100, #fef3c7)',
          border: '1.5px solid var(--primary-400)',
          borderRadius: '6px',
          padding: '0.35rem 0.65rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <CheckCircle2 size={13} color="var(--primary-800)" />
          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--primary-900)', textTransform: 'uppercase' }}>
            Total Wood Amount:
          </span>
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--primary-900)', fontFamily: 'var(--font-mono)' }}>
          ₹ {formatIndianCurrency(overallTotals.totalAmount || 0)}
        </div>
      </div>
    </div>
  );
};
