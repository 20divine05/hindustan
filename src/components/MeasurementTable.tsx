import React, { useState, useRef } from 'react';
import { Plus, Trash2, Copy, AlertCircle, CornerDownLeft, X, ArrowUpDown } from 'lucide-react';
import type { MeasurementItem } from '../types';
import { calculateRow, calculateTotals, formatValue, sortTimberEntries } from '../utils/calculator';
import { formatIndianCurrency } from '../utils/indianNumberWords';
import { generateId } from '../services/db';

export const WOOD_SPECIES_OPTIONS = [
  'Mahagony',
  'Teak Wood',
  'Sal Wood',
  'Honne',
  'Rosewood',
  'Pine Wood',
  'Neem Wood',
  'Acacia / Babool',
  'Silver Wood',
  'Jungle Wood',
  'Other (Custom...)'
];

interface MeasurementTableProps {
  items: MeasurementItem[];
  onChange: (items: MeasurementItem[]) => void;
  sqftConvention?: 'standard_1face' | 'surface_area_2face';
  defaultRate?: number;
}

export const MeasurementTable: React.FC<MeasurementTableProps> = ({
  items,
  onChange,
  sqftConvention = 'standard_1face',
  defaultRate = 1200
}) => {
  // Quick Add Input State
  const [quickLength, setQuickLength] = useState<string>('');
  const [quickWidth, setQuickWidth] = useState<string>('');
  const [quickThickness, setQuickThickness] = useState<string>('');
  const [quickPieces, setQuickPieces] = useState<string>('1');
  const [quickRate, setQuickRate] = useState<string>(defaultRate.toString());
  const [quickRateUnit, setQuickRateUnit] = useState<'CFT' | 'SQFT'>('CFT');
  const [quickRateCft, setQuickRateCft] = useState<string>(defaultRate.toString());
  const [quickRateSqft, setQuickRateSqft] = useState<string>('120');

  // Modal state for editing row when width >= 7
  const [widthModalRowIndex, setWidthModalRowIndex] = useState<number | null>(null);
  const [modalRateUnit, setModalRateUnit] = useState<'CFT' | 'SQFT'>('CFT');
  const [modalRateCft, setModalRateCft] = useState<string>(defaultRate.toString());
  const [modalRateSqft, setModalRateSqft] = useState<string>('120');

  const [selectedWoodOption, setSelectedWoodOption] = useState<string>('Mahagony');
  const [customWoodType, setCustomWoodType] = useState<string>('');
  const [quickError, setQuickError] = useState<string | null>(null);

  const lengthInputRef = useRef<HTMLInputElement>(null);

  // Live calculation for quick entry preview
  const lVal = parseFloat(quickLength) || 0;
  const wVal = parseFloat(quickWidth) || 0;
  const tVal = parseFloat(quickThickness) || 0;
  const pVal = parseFloat(quickPieces) || 0;
  const isQuickSqft = wVal >= 7 && quickRateUnit === 'SQFT';
  const liveCft = lVal > 0 && wVal > 0 && tVal > 0 && pVal > 0 ? (lVal * wVal * tVal * pVal) / 144 : 0;
  const liveSqft = liveCft * 12;
  const currentRateVal = isQuickSqft
    ? (parseFloat(quickRateSqft) || 120)
    : (parseFloat(quickRateCft) || parseFloat(quickRate) || defaultRate);
  const liveAmount = isQuickSqft ? (liveSqft * currentRateVal) : (liveCft * currentRateVal);

  // Real-time table totals
  const totals = calculateTotals(items, sqftConvention, defaultRate);

  // Handle in-place row editing
  const handleUpdateItem = (
    index: number,
    field: keyof MeasurementItem,
    rawValue: string
  ) => {
    const updated = [...items];
    const target = { ...updated[index] };

    if (field === 'woodType' || field === 'remarks') {
      target[field] = rawValue;
    } else {
      const parsed = rawValue === '' ? '' : parseFloat(rawValue);
      (target as any)[field] = isNaN(parsed as number) ? '' : parsed;

      // Recalculate row
      const calc = calculateRow(
        target.lengthFeet,
        target.widthInches,
        target.thicknessInches,
        target.pieces,
        sqftConvention
      );
      target.cft = calc.cft;
      target.sqft = calc.sqft;

      const wNum = typeof target.widthInches === 'number' ? target.widthInches : 0;
      if (field === 'widthInches' && wNum >= 7 && !target.rateUnit) {
        setModalRateUnit('SQFT');
        setModalRateSqft('120');
        setModalRateCft(typeof target.rate === 'number' && target.rate > 0 ? target.rate.toString() : defaultRate.toString());
        setWidthModalRowIndex(index);
      }

      const isSqft = wNum >= 7 && target.rateUnit === 'SQFT';
      const defaultRowRate = isSqft ? 120 : defaultRate;
      const rowRate = typeof target.rate === 'number' && target.rate > 0 ? target.rate : defaultRowRate;
      const multiplier = isSqft ? calc.sqft : calc.cft;
      target.amount = Math.round(multiplier * rowRate * 100) / 100;
    }

    updated[index] = target;
    onChange(updated);
  };

  // Duplicate an existing row
  const handleDuplicateRow = (index: number) => {
    const source = items[index];
    const duplicate: MeasurementItem = {
      ...source,
      id: generateId(),
      serialNumber: items.length + 1
    };

    const updated = [...items.slice(0, index + 1), duplicate, ...items.slice(index + 1)];
    const sorted = sortTimberEntries(updated);
    onChange(sorted);
  };

  // Delete a row
  const handleDeleteRow = (index: number) => {
    const updated = items.filter((_, idx) => idx !== index);
    const reindexed = updated.map((it, idx) => ({ ...it, serialNumber: idx + 1 }));
    onChange(reindexed);
  };

  // Add an empty row
  const handleAddEmptyRow = () => {
    const rateNum = parseFloat(quickRate);
    const defRate = !isNaN(rateNum) && rateNum > 0 ? rateNum : defaultRate;
    const newRow: MeasurementItem = {
      id: generateId(),
      serialNumber: items.length + 1,
      lengthFeet: '',
      widthInches: '',
      thicknessInches: '',
      pieces: 1,
      cft: 0,
      sqft: 0,
      rate: defRate,
      amount: 0,
      woodType: ''
    };
    onChange([...items, newRow]);
  };

  // Add row via Quick-Add Bar
  const handleQuickAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setQuickError(null);

    const l = parseFloat(quickLength);
    const w = parseFloat(quickWidth);
    const t = parseFloat(quickThickness);
    const p = parseFloat(quickPieces);

    if (isNaN(l) || l <= 0) {
      setQuickError('Length must be greater than 0 feet');
      return;
    }
    if (isNaN(w) || w <= 0) {
      setQuickError('Width must be greater than 0 inches');
      return;
    }
    if (isNaN(t) || t <= 0) {
      setQuickError('Thickness must be greater than 0 inches');
      return;
    }
    if (isNaN(p) || p <= 0) {
      setQuickError('Pieces count must be at least 1');
      return;
    }

    const isWide = w >= 7;
    let finalRateUnit: 'CFT' | 'SQFT' = 'CFT';
    let itemRate = defaultRate;

    if (isWide) {
      if (quickRateUnit === 'SQFT') {
        finalRateUnit = 'SQFT';
        const parsedSqftRate = parseFloat(quickRateSqft);
        itemRate = !isNaN(parsedSqftRate) && parsedSqftRate > 0 ? parsedSqftRate : 120;
      } else {
        finalRateUnit = 'CFT';
        const parsedCftRate = parseFloat(quickRateCft) || parseFloat(quickRate);
        itemRate = !isNaN(parsedCftRate) && parsedCftRate > 0 ? parsedCftRate : defaultRate;
      }
    } else {
      const parsedRate = parseFloat(quickRate);
      itemRate = !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : defaultRate;
    }

    const calc = calculateRow(l, w, t, p, sqftConvention);
    const multiplier = (isWide && finalRateUnit === 'SQFT') ? calc.sqft : calc.cft;
    const itemAmount = Math.round(multiplier * itemRate * 100) / 100;
    const finalWood = selectedWoodOption === 'Other (Custom...)' 
      ? (customWoodType.trim() || 'Custom Wood') 
      : selectedWoodOption;

    const newItem: MeasurementItem = {
      id: generateId(),
      serialNumber: items.length + 1,
      lengthFeet: l,
      widthInches: w,
      thicknessInches: t,
      pieces: p,
      cft: calc.cft,
      sqft: calc.sqft,
      rate: itemRate,
      rateUnit: finalRateUnit,
      amount: itemAmount,
      woodType: finalWood
    };

    const updated = sortTimberEntries([...items, newItem]);
    onChange(updated);

    // Keep thickness, width and rate for rapid consecutive tallying, clear length & pieces
    setQuickLength('');
    setQuickPieces('1');

    // Auto-refocus on length input for continuous fast entry
    setTimeout(() => {
      lengthInputRef.current?.focus();
    }, 50);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* 1. Quick Dimension Entry Form (Prominent at top for instant daily tallying) */}
      <form onSubmit={handleQuickAdd} className="quick-add-bar no-print">
        <div className="quick-add-header-title">
          <CornerDownLeft size={16} color="var(--primary-600)" />
          <span>Quick Dimension Entry:</span>
        </div>

        <div className="quick-add-dims">
          <div className="quick-dim-col">
            <label className="quick-dim-label">Length (ft)</label>
            <input
              ref={lengthInputRef}
              type="number"
              step="any"
              min="0"
              placeholder="e.g. 10"
              className="calc-input"
              value={quickLength}
              onChange={(e) => setQuickLength(e.target.value)}
              required
            />
          </div>
          <span className="quick-dim-mult">&times;</span>
          <div className="quick-dim-col">
            <label className="quick-dim-label">Width (in)</label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="e.g. 5"
              className="calc-input"
              value={quickWidth}
              onChange={(e) => setQuickWidth(e.target.value)}
              required
            />
          </div>
          <span className="quick-dim-mult">&times;</span>
          <div className="quick-dim-col">
            <label className="quick-dim-label">Thick (in)</label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="e.g. 3"
              className="calc-input"
              value={quickThickness}
              onChange={(e) => setQuickThickness(e.target.value)}
              required
            />
          </div>
          <span className="quick-dim-mult">&times;</span>
          <div className="quick-dim-col">
            <label className="quick-dim-label">Pieces</label>
            <input
              type="number"
              step="1"
              min="1"
              placeholder="1"
              className="calc-input"
              value={quickPieces}
              onChange={(e) => setQuickPieces(e.target.value)}
              required
            />
          </div>
          <span className="quick-dim-mult quick-dim-mult-rate">@</span>
          {wVal >= 7 ? (
            <div className="quick-dim-rate-block quick-dim-rate-split">
              <div className="quick-dim-col">
                <label className="quick-dim-label" style={{ color: quickRateUnit === 'SQFT' ? 'var(--primary-800)' : 'var(--text-muted)', fontWeight: 800 }}>
                  ₹ / SQFT {quickRateUnit === 'SQFT' && '●'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 120"
                  className="calc-input"
                  value={quickRateSqft}
                  onFocus={() => {
                    setQuickRateUnit('SQFT');
                  }}
                  onChange={(e) => {
                    setQuickRateSqft(e.target.value);
                    setQuickRateUnit('SQFT');
                    setQuickRateCft('');
                  }}
                  style={{
                    fontWeight: 700,
                    borderColor: quickRateUnit === 'SQFT' ? 'var(--primary-600)' : undefined,
                    backgroundColor: quickRateUnit === 'SQFT' ? 'var(--primary-50, #fcf9f2)' : undefined
                  }}
                  title="Width is ≥ 7in: Enter Rate in SQFT"
                />
              </div>
              <div className="quick-dim-col">
                <label className="quick-dim-label" style={{ color: quickRateUnit === 'CFT' ? 'var(--primary-800)' : 'var(--text-muted)', fontWeight: 800 }}>
                  ₹ / CFT {quickRateUnit === 'CFT' && '●'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 1200"
                  className="calc-input"
                  value={quickRateCft}
                  onFocus={() => {
                    setQuickRateUnit('CFT');
                  }}
                  onChange={(e) => {
                    setQuickRateCft(e.target.value);
                    setQuickRateUnit('CFT');
                    setQuickRateSqft('');
                  }}
                  style={{
                    fontWeight: 700,
                    borderColor: quickRateUnit === 'CFT' ? 'var(--primary-600)' : undefined,
                    backgroundColor: quickRateUnit === 'CFT' ? 'var(--primary-50, #fcf9f2)' : undefined
                  }}
                  title="Width is ≥ 7in: Enter Rate in CFT"
                />
              </div>
            </div>
          ) : (
            <div className="quick-dim-rate-block quick-dim-rate-single">
              <div className="quick-dim-col quick-dim-rate">
                <label className="quick-dim-label">Rate / CFT (₹)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 1200"
                  className="calc-input"
                  value={quickRate}
                  onChange={(e) => {
                    setQuickRate(e.target.value);
                    setQuickRateCft(e.target.value);
                  }}
                  style={{ fontWeight: 700, color: 'var(--primary-800)' }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="quick-add-row-bottom">
          <div className="quick-add-species" style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '160px', flex: 1 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Wood Species:
              </label>
              <select
                className="calc-input"
                value={selectedWoodOption}
                onChange={(e) => {
                  setSelectedWoodOption(e.target.value);
                }}
                style={{
                  fontWeight: 800,
                  color: 'var(--primary-800)',
                  fontSize: '0.88rem',
                  padding: '0.45rem 0.65rem',
                  cursor: 'pointer',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  border: '1.5px solid var(--primary-300, #c4a47c)'
                }}
              >
                {WOOD_SPECIES_OPTIONS.map((species) => (
                  <option key={species} value={species}>
                    🪵 {species}
                  </option>
                ))}
              </select>
            </div>

            {selectedWoodOption === 'Other (Custom...)' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '150px', flex: 1 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Custom Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Padauk, Mango..."
                  value={customWoodType}
                  onChange={(e) => {
                    setCustomWoodType(e.target.value);
                  }}
                  style={{ fontSize: '0.85rem', padding: '0.45rem 0.65rem', fontWeight: 700 }}
                  autoFocus
                />
              </div>
            )}
          </div>

          {liveCft > 0 && (
            <div
              className="quick-add-live-est"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                backgroundColor: 'var(--primary-50, #fcf9f2)',
                border: '1px solid var(--primary-200)',
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                fontSize: '0.8rem'
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>Estimated:</span>
              <strong style={{ color: 'var(--primary-800)' }}>
                {isQuickSqft ? `${formatValue(liveSqft, 2)} SQFT` : `${formatValue(liveCft, 3)} CFT`}
              </strong>
              {liveAmount > 0 && (
                <>
                  <span style={{ color: 'var(--text-subtle)' }}>&bull;</span>
                  <strong style={{ color: 'var(--primary-700)', fontFamily: 'var(--font-mono)' }}>
                    ₹ {formatIndianCurrency(liveAmount)}
                  </strong>
                </>
              )}
            </div>
          )}

          <div className="quick-add-actions">
            <button type="submit" className="btn btn-primary btn-sm" title="Add measurement row (Enter)">
              <Plus size={16} /> Add Row
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleAddEmptyRow}
              title="Add empty blank row"
            >
              Blank Row
            </button>
            {items.length > 1 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onChange(sortTimberEntries(items))}
                title="Sort all rows strictly by Wood Species & Standard Mill Dimensions"
              >
                <ArrowUpDown size={14} /> Sort Order
              </button>
            )}
          </div>
        </div>
      </form>

      {quickError && (
        <div style={{ fontSize: '0.82rem', color: 'var(--danger-400)', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.5rem' }}>
          <AlertCircle size={14} /> {quickError}
        </div>
      )}

      {/* 2. Desktop Full 11-Column Spreadsheet Table (Visible on Desktop / Tablets) */}
      <div className="table-responsive desktop-tally-table">
        <table className="calc-table">
          <thead>
            <tr>
              <th style={{ width: '45px', textAlign: 'center' }}>#</th>
              <th style={{ minWidth: '125px' }}>Wood Species / Type</th>
              <th style={{ minWidth: '95px', textAlign: 'right' }}>Length (Feet)</th>
              <th style={{ minWidth: '95px', textAlign: 'right' }}>Width (Inches)</th>
              <th style={{ minWidth: '95px', textAlign: 'right' }}>Thick (Inches)</th>
              <th style={{ minWidth: '85px', textAlign: 'right' }}>Pieces</th>
              <th style={{ minWidth: '105px', textAlign: 'right' }}>Total CFT</th>
              <th style={{ minWidth: '100px', textAlign: 'right' }}>Total SQFT</th>
              <th style={{ minWidth: '120px', textAlign: 'right' }}>Rate (₹)</th>
              <th style={{ minWidth: '120px', textAlign: 'right' }}>Amount (₹)</th>
              <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <AlertCircle size={36} color="var(--primary-600)" />
                    <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                      No measurement rows yet
                    </p>
                    <p style={{ fontSize: '0.88rem', margin: 0, maxWidth: '420px' }}>
                      Enter dimensions &amp; rate above and click &ldquo;Add Row&rdquo; to start recording timber measurements.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const l = typeof item.lengthFeet === 'number' ? item.lengthFeet : 0;
                const w = typeof item.widthInches === 'number' ? item.widthInches : 0;
                const t = typeof item.thicknessInches === 'number' ? item.thicknessInches : 0;
                const p = typeof item.pieces === 'number' ? item.pieces : 0;
                const isRowValid = l > 0 && w > 0 && t > 0 && p > 0;
                const isSqft = w >= 7 && item.rateUnit === 'SQFT';
                const defaultRowRate = isSqft ? 120 : defaultRate;
                const rowRate = typeof item.rate === 'number' && item.rate > 0 ? item.rate : (parseFloat(quickRate) || defaultRowRate);
                const multiplier = isSqft ? item.sqft : item.cft;
                const rowAmount = typeof item.amount === 'number' && item.amount > 0 ? item.amount : Math.round(multiplier * rowRate * 100) / 100;

                return (
                  <tr key={item.id} style={{ opacity: isRowValid ? 1 : 0.85 }}>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-subtle)' }}>
                      {item.serialNumber}
                    </td>

                    <td>
                      <input
                        type="text"
                        list="wood-options-list"
                        placeholder="e.g. Mahagony, Teak"
                        value={item.woodType || ''}
                        onChange={(e) => handleUpdateItem(index, 'woodType', e.target.value)}
                        style={{ minWidth: '120px', fontWeight: 600 }}
                      />
                    </td>

                    <td>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        className="calc-input"
                        value={item.lengthFeet}
                        onChange={(e) => handleUpdateItem(index, 'lengthFeet', e.target.value)}
                      />
                    </td>

                    <td>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        className="calc-input"
                        value={item.widthInches}
                        onChange={(e) => handleUpdateItem(index, 'widthInches', e.target.value)}
                      />
                    </td>

                    <td>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        className="calc-input"
                        value={item.thicknessInches}
                        onChange={(e) => handleUpdateItem(index, 'thicknessInches', e.target.value)}
                      />
                    </td>

                    <td>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="1"
                        className="calc-input"
                        value={item.pieces}
                        onChange={(e) => handleUpdateItem(index, 'pieces', e.target.value)}
                      />
                    </td>

                    <td className="col-numeric col-cft">
                      {formatValue(item.cft, 3)}
                    </td>

                    <td className="col-numeric col-sqft">
                      {formatValue(item.sqft, 3)}
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder={isSqft ? '120' : '1200'}
                          className="calc-input"
                          value={item.rate ?? ''}
                          onChange={(e) => handleUpdateItem(index, 'rate', e.target.value)}
                          style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary-800)', width: '75px' }}
                        />
                        {w >= 7 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setModalRateUnit(item.rateUnit === 'SQFT' ? 'SQFT' : 'CFT');
                              if (item.rateUnit === 'SQFT') {
                                setModalRateSqft(item.rate ? item.rate.toString() : '120');
                                setModalRateCft('');
                              } else {
                                setModalRateCft(item.rate ? item.rate.toString() : defaultRate.toString());
                                setModalRateSqft('');
                              }
                              setWidthModalRowIndex(index);
                            }}
                            title="Width is ≥ 7in: Click to switch Rate in CFT or SQFT"
                            style={{
                              border: '1px solid var(--primary-400)',
                              backgroundColor: item.rateUnit === 'SQFT' ? 'var(--primary-100)' : 'var(--bg-subtle)',
                              color: 'var(--primary-900)',
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              borderRadius: '4px',
                              padding: '2px 5px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {item.rateUnit === 'SQFT' ? 'SQFT' : 'CFT'} ⚡
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>CFT</span>
                        )}
                      </div>
                    </td>

                    <td className="col-numeric" style={{ fontWeight: 700, color: 'var(--primary-800)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                      ₹ {formatIndianCurrency(rowAmount)}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Duplicate row"
                          onClick={() => handleDuplicateRow(index)}
                          style={{ padding: '5px' }}
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Delete row"
                          onClick={() => handleDeleteRow(index)}
                          style={{ padding: '5px', color: 'var(--danger-400)' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {items.length > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: 'var(--bg-subtle, #faf6ee)', fontWeight: 800, borderTop: '2px solid var(--border-medium)' }}>
                <td colSpan={5} style={{ textAlign: 'right', padding: '0.65rem 0.75rem', color: 'var(--text-main)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                  Grand Totals:
                </td>
                <td style={{ textAlign: 'right', padding: '0.65rem 0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                  {totals.totalPieces} pcs
                </td>
                <td className="col-numeric col-cft" style={{ padding: '0.65rem 0.5rem', fontWeight: 800 }}>
                  {formatValue(totals.totalCft, 3)}
                </td>
                <td className="col-numeric col-sqft" style={{ padding: '0.65rem 0.5rem', fontWeight: 800 }}>
                  {formatValue(totals.totalSqft, 3)}
                </td>
                <td style={{ textAlign: 'right', padding: '0.65rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  Total Value:
                </td>
                <td className="col-numeric" style={{ padding: '0.65rem 0.5rem', color: 'var(--primary-800)', fontSize: '1rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  ₹ {formatIndianCurrency(totals.totalAmount || 0)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 3. Mobile Fixed Tally View (100% width, Zero Horizontal Scrolling for Phones) */}
      <div className="mobile-tally-view">
        {items.length === 0 ? (
          <div className="mobile-empty-tally" style={{ padding: '1.5rem 1rem', textAlign: 'center', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px', border: '1px dashed var(--border-medium)' }}>
            <AlertCircle size={28} color="var(--primary-600)" style={{ margin: '0 auto 0.4rem' }} />
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>No measurement lines yet</p>
            <p style={{ margin: '0.2rem 0 0.8rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Enter dimensions above or tap below to add a row:
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleAddEmptyRow}
              style={{ fontWeight: 800, padding: '0.5rem 1rem' }}
            >
              <Plus size={16} /> Add Measurement Row
            </button>
          </div>
        ) : (
          <div className="mobile-tally-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {items.map((item, index) => {
              const w = typeof item.widthInches === 'number' ? item.widthInches : 0;
              const isSqft = w >= 7 && item.rateUnit === 'SQFT';
              const defaultRowRate = isSqft ? 120 : defaultRate;
              const rowRate = typeof item.rate === 'number' && item.rate > 0 ? item.rate : (parseFloat(quickRate) || defaultRowRate);
              const multiplier = isSqft ? item.sqft : item.cft;
              const rowAmount = typeof item.amount === 'number' && item.amount > 0 ? item.amount : Math.round(multiplier * rowRate * 100) / 100;

              return (
                <div
                  key={item.id}
                  className="mobile-tally-item-card"
                  style={{
                    backgroundColor: 'var(--bg-card, #ffffff)',
                    border: '1.5px solid var(--border-medium, #c2b59b)',
                    borderRadius: '8px',
                    padding: '0.65rem 0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  {/* Row Top: Serial Number, Wood Species, and Delete/Duplicate buttons */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          backgroundColor: 'var(--primary-700)',
                          color: '#fff',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: '4px'
                        }}
                      >
                        #{item.serialNumber}
                      </span>
                      <select
                        value={item.woodType || selectedWoodOption || 'Mahagony'}
                        onChange={(e) => handleUpdateItem(index, 'woodType', e.target.value)}
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.4rem',
                          borderRadius: '4px',
                          border: '1px solid var(--border-medium)',
                          backgroundColor: 'var(--bg-subtle)',
                          color: 'var(--text-main)',
                          flex: 1,
                          minWidth: 0
                        }}
                      >
                        {WOOD_SPECIES_OPTIONS.map((sp) => (
                          <option key={sp} value={sp}>
                            {sp}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDuplicateRow(index)}
                        style={{ padding: '4px' }}
                        title="Duplicate row"
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDeleteRow(index)}
                        style={{ padding: '4px', color: 'var(--danger-400)' }}
                        title="Delete row"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Row Inputs: 4 Big Thumb-Friendly Number Inputs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr auto 1fr', alignItems: 'center', gap: '0.25rem' }}>
                    <div>
                      <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>
                        Length (ft)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="ft"
                        value={item.lengthFeet}
                        onChange={(e) => handleUpdateItem(index, 'lengthFeet', e.target.value)}
                        style={{ width: '100%', fontSize: '0.95rem', fontWeight: 800, textAlign: 'center', padding: '0.35rem 0.2rem' }}
                      />
                    </div>
                    <span style={{ fontWeight: 800, color: 'var(--text-muted)', marginTop: '0.8rem' }}>&times;</span>

                    <div>
                      <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>
                        Width (in)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="in"
                        value={item.widthInches}
                        onChange={(e) => handleUpdateItem(index, 'widthInches', e.target.value)}
                        style={{ width: '100%', fontSize: '0.95rem', fontWeight: 800, textAlign: 'center', padding: '0.35rem 0.2rem' }}
                      />
                    </div>
                    <span style={{ fontWeight: 800, color: 'var(--text-muted)', marginTop: '0.8rem' }}>&times;</span>

                    <div>
                      <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>
                        Thick (in)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="in"
                        value={item.thicknessInches}
                        onChange={(e) => handleUpdateItem(index, 'thicknessInches', e.target.value)}
                        style={{ width: '100%', fontSize: '0.95rem', fontWeight: 800, textAlign: 'center', padding: '0.35rem 0.2rem' }}
                      />
                    </div>
                    <span style={{ fontWeight: 800, color: 'var(--text-muted)', marginTop: '0.8rem' }}>&times;</span>

                    <div>
                      <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>
                        Pieces
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="pcs"
                        value={item.pieces}
                        onChange={(e) => handleUpdateItem(index, 'pieces', e.target.value)}
                        style={{ width: '100%', fontSize: '0.95rem', fontWeight: 800, textAlign: 'center', padding: '0.35rem 0.2rem' }}
                      />
                    </div>
                  </div>

                  {/* Row Bottom: Live Volume & Amount calculation */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-subtle, #faf6ee)', padding: '0.3rem 0.5rem', borderRadius: '4px', fontSize: '0.78rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      Rate: ₹
                      <input
                        type="number"
                        value={item.rate || ''}
                        onChange={(e) => handleUpdateItem(index, 'rate', e.target.value)}
                        placeholder={isSqft ? '120' : `${defaultRate}`}
                        style={{ width: '55px', fontSize: '0.78rem', fontWeight: 700, padding: '1px 3px', textAlign: 'right' }}
                      />
                      {w >= 7 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setModalRateUnit(item.rateUnit === 'SQFT' ? 'SQFT' : 'CFT');
                            if (item.rateUnit === 'SQFT') {
                              setModalRateSqft(item.rate ? item.rate.toString() : '120');
                              setModalRateCft('');
                            } else {
                              setModalRateCft(item.rate ? item.rate.toString() : defaultRate.toString());
                              setModalRateSqft('');
                            }
                            setWidthModalRowIndex(index);
                          }}
                          style={{
                            border: '1px solid var(--primary-400)',
                            backgroundColor: item.rateUnit === 'SQFT' ? 'var(--primary-100)' : 'var(--bg-subtle)',
                            color: 'var(--primary-900)',
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            borderRadius: '3px',
                            padding: '1px 4px',
                            cursor: 'pointer'
                          }}
                        >
                          {item.rateUnit === 'SQFT' ? 'SQFT' : 'CFT'} ⚡
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>CFT</span>
                      )}
                    </span>
                    <div>
                      <span style={{ fontWeight: 800, color: 'var(--primary-700)' }}>
                        {isSqft ? `${formatValue(item.sqft, 2)} SQFT` : `${formatValue(item.cft, 3)} CFT`}
                      </span>
                      <span style={{ margin: '0 0.35rem', color: 'var(--border-medium)' }}>|</span>
                      <strong style={{ color: 'var(--primary-800)', fontFamily: 'var(--font-mono)' }}>
                        ₹ {formatIndianCurrency(rowAmount)}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Mobile Actions: Add Another Row */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleAddEmptyRow}
                style={{ flex: 1, justifyContent: 'center', fontWeight: 700, padding: '0.6rem' }}
              >
                <Plus size={16} /> Add Another Row
              </button>
            </div>

            {/* Mobile Bottom Summary Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-subtle, #faf6ee)',
                borderTop: '2px solid var(--border-medium)',
                padding: '0.65rem 0.75rem',
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--primary-900)',
                borderRadius: '6px',
                marginTop: '0.5rem'
              }}
            >
              <span>Total: {totals.totalPieces} Pcs</span>
              <span>{formatValue(totals.totalCft, 3)} CFT</span>
              <span style={{ color: 'var(--primary-800)', fontFamily: 'var(--font-mono)' }}>
                ₹ {formatIndianCurrency(totals.totalAmount || 0)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Width >= 7 Dual Rate Popup Dialog */}
      {widthModalRowIndex !== null && items[widthModalRowIndex] && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(2px)'
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '1.25rem 1.5rem',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
              border: '1.5px solid var(--border-medium)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--primary-900)' }}>
                ⚡ Width is ≥ 7″ ({items[widthModalRowIndex].widthInches} Inches)
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setWidthModalRowIndex(null)}
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '1.1rem', lineHeight: 1.4 }}>
              Timber planks with width ≥ 7&quot; can be priced either in <strong>SQFT</strong> or in <strong>CFT</strong>. Enter only one:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
              {/* Option 1: Rate in SQFT */}
              <div
                onClick={() => setModalRateUnit('SQFT')}
                style={{
                  border: modalRateUnit === 'SQFT' ? '2px solid var(--primary-600, #a16207)' : '1.5px solid var(--border-medium)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  backgroundColor: modalRateUnit === 'SQFT' ? 'var(--primary-50, #fcf9f2)' : 'var(--bg-subtle, #f9fafb)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-main)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="modalRateUnit"
                      checked={modalRateUnit === 'SQFT'}
                      onChange={() => setModalRateUnit('SQFT')}
                      style={{ marginRight: '6px' }}
                    />
                    Rate in SQFT (₹ / SQFT)
                  </label>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'var(--primary-200)', color: 'var(--primary-900)', padding: '2px 6px', borderRadius: '4px' }}>
                    Plank SQFT
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 120"
                    className="calc-input"
                    value={modalRateSqft}
                    onFocus={() => setModalRateUnit('SQFT')}
                    onChange={(e) => {
                      setModalRateSqft(e.target.value);
                      setModalRateUnit('SQFT');
                      setModalRateCft('');
                    }}
                    style={{ fontWeight: 700, fontSize: '1rem' }}
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Row Volume: <strong>{items[widthModalRowIndex].sqft.toFixed(2)} SQFT</strong>
                </div>
              </div>

              {/* Option 2: Rate in CFT */}
              <div
                onClick={() => setModalRateUnit('CFT')}
                style={{
                  border: modalRateUnit === 'CFT' ? '2px solid var(--primary-600, #a16207)' : '1.5px solid var(--border-medium)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  backgroundColor: modalRateUnit === 'CFT' ? 'var(--primary-50, #fcf9f2)' : 'var(--bg-subtle, #f9fafb)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-main)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="modalRateUnit"
                      checked={modalRateUnit === 'CFT'}
                      onChange={() => setModalRateUnit('CFT')}
                      style={{ marginRight: '6px' }}
                    />
                    Rate in CFT (₹ / CFT)
                  </label>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'var(--border-medium)', color: 'var(--text-main)', padding: '2px 6px', borderRadius: '4px' }}>
                    Standard CFT
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 1200"
                    className="calc-input"
                    value={modalRateCft}
                    onFocus={() => setModalRateUnit('CFT')}
                    onChange={(e) => {
                      setModalRateCft(e.target.value);
                      setModalRateUnit('CFT');
                      setModalRateSqft('');
                    }}
                    style={{ fontWeight: 700, fontSize: '1rem' }}
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Row Volume: <strong>{items[widthModalRowIndex].cft.toFixed(4)} CFT</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setWidthModalRowIndex(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const updated = [...items];
                  const target = { ...updated[widthModalRowIndex] };
                  const isSqft = modalRateUnit === 'SQFT';
                  target.rateUnit = modalRateUnit;
                  const rateVal = isSqft ? (parseFloat(modalRateSqft) || 120) : (parseFloat(modalRateCft) || defaultRate);
                  target.rate = rateVal;
                  const multiplier = isSqft ? target.sqft : target.cft;
                  target.amount = Math.round(multiplier * rateVal * 100) / 100;
                  updated[widthModalRowIndex] = target;
                  onChange(updated);
                  setWidthModalRowIndex(null);
                }}
                style={{ fontWeight: 800 }}
              >
                Apply Rate ({modalRateUnit})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Wood Species Datalist */}
      <datalist id="wood-options-list">
        {WOOD_SPECIES_OPTIONS.filter((s) => !s.includes('Other')).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
};
