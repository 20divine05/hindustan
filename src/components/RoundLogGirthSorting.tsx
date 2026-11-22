import React from 'react';
import { Layers, Plus } from 'lucide-react';
import type { RoundLogItem, RoundLogOutputUnit, RoundLogInputUnitType } from '../types';
import {
  calculateRoundLogTotals,
  groupRoundLogsBySpeciesAndSlab,
  GIRTH_SLAB_LIST,
  getRoundLogUnitConfig
} from '../utils/roundLogCalculator';
import { formatValue } from '../utils/calculator';

interface RoundLogGirthSortingProps {
  items: RoundLogItem[];
  outputUnit: RoundLogOutputUnit;
  inputUnit: RoundLogInputUnitType;
  customerName?: string;
  onNewSheet?: () => void;
}

export const RoundLogGirthSorting: React.FC<RoundLogGirthSortingProps> = ({
  items,
  outputUnit,
  inputUnit,
  customerName,
  onNewSheet
}) => {
  const totals = calculateRoundLogTotals(items, outputUnit);
  const { speciesGroups, overallTotals } = groupRoundLogsBySpeciesAndSlab(
    items,
    outputUnit,
    inputUnit,
    {}
  );
  const unitConfig = getRoundLogUnitConfig(inputUnit);

  return (
    <div className="measurement-tally-root" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Top Header & Summary */}
      <div className="calc-step2-top-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem', flexWrap: 'wrap', gap: '0.4rem' }}>
        <div className="calc-step2-title-block mobile-hide">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="badge" style={{ backgroundColor: 'var(--primary-800)', color: '#fff', fontSize: '0.74rem', padding: '0.2rem 0.45rem', fontWeight: 800 }}>
              Stage 2
            </span>
            <h3 style={{ fontSize: '1.15rem', margin: 0, color: 'var(--text-main)', fontWeight: 800 }}>
              Girth Classification &amp; Slab Sorting
            </h3>
          </div>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Customer: <strong>{customerName || 'Direct Cash Buyer'}</strong> &bull; Hoppus 5-Slab Breakdown ({outputUnit})
          </p>
        </div>

        <div className="calc-step2-actions-block" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', justifyContent: 'space-between' }}>
          <span className="badge calc-step2-total-badge" style={{ backgroundColor: 'var(--primary-100)', color: 'var(--primary-800)', border: '1px solid var(--primary-200)', fontSize: '0.74rem', padding: '0.22rem 0.5rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
            <span className="mobile-hide">{customerName ? `${customerName} • ` : ''}</span>
            TOTAL: {formatValue(totals.totalVolume, 4)} {outputUnit} &bull; {totals.totalPieces} PCS
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

      {/* Info Pill / Slab Definition Banner (Desktop only - hidden on mobile to eliminate vertical scrolling) */}
      <div className="mobile-hide" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-subtle, #f1f5f9)',
        border: '1px solid var(--border-medium)',
        borderRadius: '8px',
        padding: '0.45rem 0.65rem',
        flexWrap: 'wrap',
        gap: '0.4rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <Layers size={15} color="var(--primary-700)" />
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)' }}>
            Timber Girth Slabs:
          </span>
          {GIRTH_SLAB_LIST.map((s) => (
            <span
              key={s.id}
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.12rem 0.4rem',
                borderRadius: '4px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-main)'
              }}
            >
              {s.label} ({s.minGirthIn === 0 ? `≤${s.maxGirthIn}"` : s.maxGirthIn === Infinity ? `≥${s.minGirthIn}"` : `${s.minGirthIn}"-${s.maxGirthIn}"`})
            </span>
          ))}
        </div>
      </div>

      {/* Sawmill Girth Sheet Tables by Wood Species */}
      {speciesGroups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-medium)' }}>
          <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
            No round logs to sort
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
              border: '1px solid var(--border-medium)',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            {/* Species Header */}
            <div
              style={{
                backgroundColor: 'var(--primary-50, #fcf7ee)',
                borderBottom: '1.5px solid var(--border-medium)',
                padding: '0.5rem 0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.35rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ backgroundColor: 'var(--primary-800)', color: '#fff', fontSize: '0.8rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px' }}>
                  🪵 {sp.woodType}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {sp.totalPieces} {sp.totalPieces === 1 ? 'Log' : 'Logs'} &bull; {formatValue(sp.totalVolume, 4)} {outputUnit}
                </span>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {sp.activeSlabs.length} Active Slab{sp.activeSlabs.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Sawmill Sheet Table (Desktop Spreadsheet View) */}
            <div className="mobile-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="calc-table" style={{ width: '100%', minWidth: '780px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', fontSize: '0.74rem', borderBottom: '1px solid var(--border-medium)' }}>
                    <th style={{ width: '55px', textAlign: 'center', padding: '0.4rem 0.2rem' }}>Log No.</th>
                    <th style={{ textAlign: 'center', width: '60px', padding: '0.4rem 0.2rem' }}>Length</th>
                    <th style={{ textAlign: 'center', width: '75px', padding: '0.4rem 0.2rem' }}>Girth (ft | in)</th>
                    <th style={{ textAlign: 'center', width: '70px', padding: '0.4rem 0.2rem' }}>Girth (in)</th>
                    <th style={{ textAlign: 'center', width: '40px', padding: '0.4rem 0.2rem' }}>PCS</th>
                    <th style={{ textAlign: 'right', width: '68px', padding: '0.4rem 0.3rem' }}>CFT</th>
                    <th style={{ textAlign: 'right', width: '68px', padding: '0.4rem 0.3rem' }}>CBM</th>
                    {GIRTH_SLAB_LIST.map((slab) => (
                      <th
                        key={slab.id}
                        style={{
                          textAlign: 'right',
                          width: '78px',
                          padding: '0.4rem 0.3rem',
                          backgroundColor: 'rgba(245, 158, 11, 0.08)',
                          color: 'var(--primary-900)',
                          fontWeight: 800
                        }}
                      >
                        {slab.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sp.items.map((it) => {
                    const l = typeof it.length === 'number' ? it.length : 0;
                    const cftVal = typeof it.cft === 'number' ? it.cft : (outputUnit === 'CFT' ? it.volume : it.volume * 35.3147);
                    const cbmVal = typeof it.cbm === 'number' ? it.cbm : (outputUnit === 'CBM' ? it.volume : it.volume / 35.3147);
                    const activeVol = outputUnit === 'CFT' ? cftVal : cbmVal;

                    return (
                      <tr key={it.id} style={{ borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem' }}>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary-700)', padding: '0.3rem 0.2rem' }}>
                          Log {it.serialNumber}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, padding: '0.3rem 0.2rem' }}>
                          {l} {unitConfig.lengthUnit}
                        </td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--text-main)', padding: '0.3rem 0.2rem' }}>
                          {it.girthFtInStr || (it.girthFt !== undefined ? `${it.girthFt}' ${it.girthInPart || 0}"` : `${it.girth}"`)}
                        </td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-muted)', padding: '0.3rem 0.2rem' }}>
                          {it.girthInches !== undefined ? `${formatValue(it.girthInches, 1)}"` : `${it.girth}"`}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 800, padding: '0.3rem 0.2rem' }}>
                          1
                        </td>
                        <td className="col-numeric" style={{ textAlign: 'right', padding: '0.3rem 0.3rem', fontWeight: outputUnit === 'CFT' ? 800 : 500 }}>
                          {formatValue(cftVal, 4)}
                        </td>
                        <td className="col-numeric" style={{ textAlign: 'right', padding: '0.3rem 0.3rem', fontWeight: outputUnit === 'CBM' ? 800 : 500 }}>
                          {formatValue(cbmVal, 4)}
                        </td>

                        {/* 5 Slab Columns: active billing volume placed in matching slab column, '-' in others */}
                        {GIRTH_SLAB_LIST.map((slab) => {
                          const isMatch = it.slabId === slab.id;
                          return (
                            <td
                              key={slab.id}
                              className="col-numeric"
                              style={{
                                textAlign: 'right',
                                padding: '0.3rem 0.3rem',
                                fontWeight: isMatch ? 800 : 400,
                                color: isMatch ? 'var(--primary-900)' : 'var(--text-muted)',
                                backgroundColor: isMatch ? 'rgba(245, 158, 11, 0.12)' : 'transparent'
                              }}
                            >
                              {isMatch ? formatValue(activeVol, 4) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>

                {/* Species Subtotal Footer */}
                <tfoot>
                  <tr style={{ backgroundColor: 'var(--bg-subtle, #f1f5f9)', borderTop: '2px solid var(--border-medium)', fontWeight: 800, fontSize: '0.8rem' }}>
                    <td colSpan={4} style={{ textAlign: 'right', padding: '0.45rem 0.4rem', textTransform: 'uppercase', color: 'var(--text-main)' }}>
                      Subtotal ({sp.woodType}):
                    </td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.2rem', fontFamily: 'var(--font-mono)' }}>
                      {sp.totalPieces}
                    </td>
                    <td className="col-numeric" style={{ textAlign: 'right', padding: '0.45rem 0.3rem' }}>
                      {formatValue(sp.totalCft, 4)}
                    </td>
                    <td className="col-numeric" style={{ textAlign: 'right', padding: '0.45rem 0.3rem' }}>
                      {formatValue(sp.totalCbm, 4)}
                    </td>

                    {/* Slab subtotals for this wood species */}
                    {GIRTH_SLAB_LIST.map((slab) => {
                      const slabData = sp.slabs[slab.id];
                      return (
                        <td
                          key={slab.id}
                          className="col-numeric"
                          style={{
                            textAlign: 'right',
                            padding: '0.45rem 0.3rem',
                            fontWeight: 800,
                            color: slabData.volume > 0 ? 'var(--primary-900)' : 'var(--text-muted)',
                            backgroundColor: 'rgba(245, 158, 11, 0.14)'
                          }}
                        >
                          {slabData.volume > 0 ? (
                            <div>
                              <div>{formatValue(slabData.volume, 4)}</div>
                              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>({slabData.pieces} pcs)</div>
                            </div>
                          ) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile View: Clean Girth Slab Boxes - ONLY shows boxes with entries */}
            <div className="mobile-show" style={{ width: '100%', padding: '0.4rem 0.45rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {sp.activeSlabs.map((s) => {
                const slabDef = GIRTH_SLAB_LIST.find((g) => g.id === s.slabId);
                const rangeStr = slabDef
                  ? (slabDef.minGirthIn === 0 ? `≤${slabDef.maxGirthIn}"` : slabDef.maxGirthIn === Infinity ? `≥${slabDef.minGirthIn}"` : `${slabDef.minGirthIn}"-${slabDef.maxGirthIn}"`)
                  : '';

                return (
                  <div
                    key={s.slabId}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1.5px solid var(--primary-300)',
                      borderRadius: '8px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Slab Box Header */}
                    <div
                      style={{
                        backgroundColor: 'var(--primary-100, #fef3c7)',
                        borderBottom: '1px solid var(--primary-200)',
                        padding: '0.35rem 0.55rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span
                          style={{
                            backgroundColor: 'var(--primary-800)',
                            color: '#ffffff',
                            fontWeight: 900,
                            fontSize: '0.76rem',
                            padding: '0.12rem 0.45rem',
                            borderRadius: '4px'
                          }}
                        >
                          {s.slabLabel}
                        </span>
                        {rangeStr && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--primary-900)', fontWeight: 700 }}>
                            ({rangeStr})
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 900, color: 'var(--primary-900)', fontFamily: 'var(--font-mono)' }}>
                          {formatValue(s.volume, 4)} {outputUnit}
                        </span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                          ({s.pieces} {s.pieces === 1 ? 'Log' : 'Logs'})
                        </span>
                      </div>
                    </div>

                    {/* Logs inside this Slab Box */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {s.items.map((it, idx) => {
                        const l = typeof it.length === 'number' ? it.length : 0;
                        const cftVal = typeof it.cft === 'number' ? it.cft : (outputUnit === 'CFT' ? it.volume : it.volume * 35.3147);
                        const cbmVal = typeof it.cbm === 'number' ? it.cbm : (outputUnit === 'CBM' ? it.volume : it.volume / 35.3147);
                        const activeVol = outputUnit === 'CFT' ? cftVal : cbmVal;
                        const gStr = it.girthFtInStr || (it.girthFt !== undefined ? `${it.girthFt}' ${it.girthInPart || 0}"` : `${it.girth}"`);
                        const inStr = it.girthInches !== undefined ? `${formatValue(it.girthInches, 1)}"` : '';

                        return (
                          <div
                            key={it.id}
                            style={{
                              padding: '0.35rem 0.55rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              borderBottom: idx < s.items.length - 1 ? '1px solid var(--border-light)' : 'none',
                              backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.6)'
                            }}
                          >
                            <div style={{ minWidth: '50px' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--primary-700)', fontFamily: 'var(--font-mono)' }}>
                                Log {it.serialNumber}
                              </span>
                            </div>

                            <div style={{ flex: 1, textAlign: 'center', padding: '0 0.3rem' }}>
                              <span style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                {l} {unitConfig.lengthUnit} × {gStr}
                              </span>
                              {inStr && (
                                <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginLeft: '0.2rem', fontWeight: 700 }}>
                                  ({inStr})
                                </span>
                              )}
                            </div>

                            <div style={{ textAlign: 'right', minWidth: '65px' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 900, color: 'var(--primary-800)', fontFamily: 'var(--font-mono)' }}>
                                {formatValue(activeVol, 4)}
                              </span>
                              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginLeft: '0.15rem' }}>
                                {outputUnit}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Overall Grand Summary Sawmill Footer across ALL wood species */}
      {speciesGroups.length > 1 && (
        <div
          style={{
            backgroundColor: 'var(--primary-100)',
            border: '2px solid var(--primary-300)',
            borderRadius: '8px',
            padding: '0.75rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.35rem' }}>
            <strong style={{ fontSize: '0.92rem', color: 'var(--primary-900)', textTransform: 'uppercase' }}>
              Overall Grand Totals (All Species):
            </strong>
            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--primary-800)' }}>
              {overallTotals.totalPieces} Pieces &bull; {formatValue(overallTotals.totalVolume, 4)} {outputUnit}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.4rem' }}>
            {GIRTH_SLAB_LIST.map((slab) => {
              const s = overallTotals.slabs[slab.id];
              return (
                <div
                  key={slab.id}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '6px',
                    padding: '0.4rem 0.55rem',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--primary-800)' }}>
                    {slab.label}
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '0.1rem' }}>
                    {formatValue(s.volume, 4)} {outputUnit}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                    {s.pieces} Pcs
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
