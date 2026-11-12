import React, { useState, useRef } from 'react';
import { Plus, Trash2, Copy, AlertCircle, CornerDownLeft, X } from 'lucide-react';
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
  const isQuickSqft = wVal >= 7 && quickRateUnit !== 'CFT';
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
      if (field === 'widthInches') {
        if (wNum >= 7 && target.rateUnit !== 'CFT') {
          target.rateUnit = 'SQFT';
          if (!target.rate || target.rate === defaultRate) {
            target.rate = 120;
          }
        } else if (wNum > 0 && wNum < 7) {
          target.rateUnit = 'CFT';
          if (target.rate === 120) {
            target.rate = defaultRate;
          }
        }
      }

      const isSqft = wNum >= 7 && target.rateUnit !== 'CFT';
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
      if (quickRateUnit === 'CFT') {
        finalRateUnit = 'CFT';
        const parsedCftRate = parseFloat(quickRateCft) || parseFloat(quickRate);
        itemRate = !isNaN(parsedCftRate) && parsedCftRate > 0 ? parsedCftRate : defaultRate;
      } else {
        // Width >= 7 directly defaults to SQFT
        finalRateUnit = 'SQFT';
        const parsedSqftRate = parseFloat(quickRateSqft);
        itemRate = !isNaN(parsedSqftRate) && parsedSqftRate > 0 ? parsedSqftRate : 120;
      }
    } else {
      finalRateUnit = 'CFT';
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
            <label className="quick-dim-label">
              <span className="dim-label-desktop">Length (ft)</span>
              <span className="dim-label-mobile">Length</span>
            </label>
            <input
              ref={lengthInputRef}
              type="number"
              step="any"
              min="0"
              placeholder=""
              className="calc-input"
              value={quickLength}
              onChange={(e) => setQuickLength(e.target.value)}
              required
            />
          </div>

          <div className="quick-dim-col">
            <label className="quick-dim-label">
              <span className="dim-label-desktop">Width (in)</span>
              <span className="dim-label-mobile">Width</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder=""
              className="calc-input"
              value={quickWidth}
              onChange={(e) => {
                const val = e.target.value;
                setQuickWidth(val);
                const w = parseFloat(val);
                if (!isNaN(w) && w >= 7) {
                  setQuickRateUnit('SQFT');
                } else if (!isNaN(w) && w > 0 && w < 7) {
                  setQuickRateUnit('CFT');
                }
              }}
              required
            />
          </div>

          <div className="quick-dim-col">
            <label className="quick-dim-label">
              <span className="dim-label-desktop">Thick (in)</span>
              <span className="dim-label-mobile">Thick</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder=""
              className="calc-input"
              value={quickThickness}
              onChange={(e) => setQuickThickness(e.target.value)}
              required
            />
          </div>

          <div className="quick-dim-col">
            <label className="quick-dim-label">
              <span className="dim-label-desktop">Pieces</span>
              <span className="dim-label-mobile">Pieces</span>
            </label>
            <input
              type="number"
              step="1"
              min="1"
              placeholder=""
              className="calc-input"
              value={quickPieces}
              onChange={(e) => setQuickPieces(e.target.value)}
              required
            />
          </div>

          <div className="quick-dim-col quick-dim-col-rate">
            <label className="quick-dim-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
              <span className="dim-label-desktop">
                {wVal >= 7 ? `Rate (${quickRateUnit})` : 'Rate (₹)'}
              </span>
              <span className="dim-label-mobile">
                {wVal >= 7 ? `${quickRateUnit}` : 'Rate'}
              </span>
              {wVal >= 7 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setQuickRateUnit(prev => (prev === 'SQFT' ? 'CFT' : 'SQFT'));
                  }}
                  className="rate-unit-toggle-btn"
                  title="Switch between SQFT and CFT rate"
                  style={{
                    fontSize: '0.65rem',
                    padding: '0 3px',
                    borderRadius: '3px',
                    border: '1px solid var(--primary-400)',
                    background: 'var(--primary-100)',
                    color: 'var(--primary-800)',
                    cursor: 'pointer',
                    fontWeight: 700,
                    lineHeight: '1.2'
                  }}
                >
                  ⇄
                </button>
              )}
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder=""
              className="calc-input"
              value={wVal >= 7 ? (quickRateUnit === 'SQFT' ? quickRateSqft : (quickRateCft || quickRate)) : quickRate}
              onChange={(e) => {
                const val = e.target.value;
                if (wVal >= 7) {
                  if (quickRateUnit === 'SQFT') {
                    setQuickRateSqft(val);
                  } else {
                    setQuickRateCft(val);
                    setQuickRate(val);
                  }
                } else {
                  setQuickRate(val);
                  setQuickRateCft(val);
                }
              }}
              style={{ fontWeight: 700, color: 'var(--primary-800)', textAlign: 'center' }}
            />
          </div>
        </div>

        <div className="quick-add-row-bottom">
          <div className="quick-add-species">
            <select
              className="calc-input"
              value={selectedWoodOption}
              onChange={(e) => {
                setSelectedWoodOption(e.target.value);
              }}
              style={{
                fontWeight: 800,
                color: 'var(--primary-800)',
                fontSize: '0.85rem',
                padding: '0.4rem 0.45rem',
                cursor: 'pointer',
                backgroundColor: 'var(--bg-surface, #ffffff)',
                border: '1.5px solid var(--primary-300, #c4a47c)',
                width: '100%',
                height: '38px',
                borderRadius: '6px'
              }}
            >
              {WOOD_SPECIES_OPTIONS.map((species) => (
                <option key={species} value={species}>
                  🪵 {species}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-sm quick-add-btn"
            title="Add measurement row (Enter)"
            style={{
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.25rem',
              fontWeight: 800,
              fontSize: '0.82rem',
              whiteSpace: 'nowrap'
            }}
          >
            <Plus size={15} /> <span>Add Row</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm quick-blank-btn"
            onClick={handleAddEmptyRow}
            title="Add empty blank row"
            style={{
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.82rem',
              whiteSpace: 'nowrap'
            }}
          >
            <span>Blank Row</span>
          </button>
        </div>

        {selectedWoodOption === 'Other (Custom...)' && (
          <div style={{ marginTop: '0.35rem' }}>
            <input
              type="text"
              placeholder=""
              value={customWoodType}
              onChange={(e) => setCustomWoodType(e.target.value)}
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem', fontWeight: 700, width: '100%' }}
              autoFocus
            />
          </div>
        )}

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
              padding: '0.3rem 0.6rem',
              fontSize: '0.78rem',
              marginTop: '0.3rem'
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
      </form>

      {quickError && (
        <div style={{ fontSize: '0.82rem', color: 'var(--danger-400)', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.5rem' }}>
          <AlertCircle size={14} /> {quickError}
        </div>
      )}

      {/* 2. Unified Spreadsheet Table (Fits 100% Mobile & Desktop without Scroll) */}
      <div className="tally-table-container">
        <table className="calc-table">
          <thead>
            <tr>
              <th style={{ width: '36px', textAlign: 'center' }}>#</th>
              <th className="col-hide-mobile" style={{ minWidth: '115px' }}>Wood Species</th>
              <th style={{ textAlign: 'center' }}>L (ft)</th>
              <th style={{ textAlign: 'center' }}>W (in)</th>
              <th style={{ textAlign: 'center' }}>T (in)</th>
              <th style={{ textAlign: 'center' }}>Pcs</th>
              <th style={{ textAlign: 'right' }}>
                <span className="mobile-hide">Total CFT</span>
                <span className="mobile-show">CFT / SQFT</span>
              </th>
              <th className="col-hide-mobile" style={{ textAlign: 'right' }}>Total SQFT</th>
              <th className="col-hide-mobile" style={{ textAlign: 'right' }}>Rate (₹)</th>
              <th style={{ textAlign: 'right' }}>Amount (₹)</th>
              <th style={{ width: '32px', textAlign: 'center' }}>
                <span className="mobile-hide">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                      No measurement rows yet
                    </p>
                    <p style={{ fontSize: '0.78rem', margin: 0, maxWidth: '380px' }}>
                      Enter dimensions above &amp; click <strong>+ Add Row</strong> to start recording measurements.
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
                const isSqft = w >= 7 && item.rateUnit !== 'CFT';
                const defaultRowRate = isSqft ? 120 : defaultRate;
                const rowRate = typeof item.rate === 'number' && item.rate > 0 ? item.rate : (parseFloat(quickRate) || defaultRowRate);
                const multiplier = isSqft ? item.sqft : item.cft;
                const rowAmount = typeof item.amount === 'number' && item.amount > 0 ? item.amount : Math.round(multiplier * rowRate * 100) / 100;

                return (
                  <tr key={item.id} style={{ opacity: isRowValid ? 1 : 0.85 }}>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary-700)', padding: '0.25rem 0.15rem' }}>
                      #{item.serialNumber}
                      {item.woodType && (
                        <div className="mobile-show" style={{ fontSize: '0.56rem', color: 'var(--text-muted)', fontWeight: 700, lineHeight: 1, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '36px' }}>
                          {item.woodType}
                        </div>
                      )}
                    </td>

                    <td className="col-hide-mobile">
                      <select
                        value={item.woodType || selectedWoodOption || 'Mahagony'}
                        onChange={(e) => handleUpdateItem(index, 'woodType', e.target.value)}
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.35rem',
                          borderRadius: '4px',
                          border: '1px solid var(--border-medium)',
                          backgroundColor: 'var(--bg-subtle)',
                          color: 'var(--text-main)',
                          width: '100%',
                          minWidth: '100px'
                        }}
                      >
                        {WOOD_SPECIES_OPTIONS.map((sp) => (
                          <option key={sp} value={sp}>
                            {sp}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={{ textAlign: 'center', padding: '0.25rem 0.15rem' }}>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0"
                        className="calc-input tally-cell-input"
                        value={item.lengthFeet}
                        onChange={(e) => handleUpdateItem(index, 'lengthFeet', e.target.value)}
                      />
                    </td>

                    <td style={{ textAlign: 'center', padding: '0.25rem 0.15rem' }}>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0"
                        className="calc-input tally-cell-input"
                        value={item.widthInches}
                        onChange={(e) => handleUpdateItem(index, 'widthInches', e.target.value)}
                      />
                    </td>

                    <td style={{ textAlign: 'center', padding: '0.25rem 0.15rem' }}>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0"
                        className="calc-input tally-cell-input"
                        value={item.thicknessInches}
                        onChange={(e) => handleUpdateItem(index, 'thicknessInches', e.target.value)}
                      />
                    </td>

                    <td style={{ textAlign: 'center', padding: '0.25rem 0.15rem' }}>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="1"
                        className="calc-input tally-cell-input"
                        value={item.pieces}
                        onChange={(e) => handleUpdateItem(index, 'pieces', e.target.value)}
                      />
                    </td>

                    <td className="col-numeric col-cft" style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.25rem 0.15rem', whiteSpace: 'nowrap' }}>
                      <span className="mobile-hide">{formatValue(item.cft, 3)}</span>
                      <span className="mobile-show">
                        {isSqft ? `${formatValue(item.sqft, 2)} SQFT` : `${formatValue(item.cft, 3)} CFT`}
                      </span>
                    </td>

                    <td className="col-numeric col-sqft col-hide-mobile" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      {formatValue(item.sqft, 2)}
                    </td>

                    <td className="col-hide-mobile">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder={isSqft ? '120' : `${defaultRate}`}
                          className="calc-input"
                          value={(item.rate as any) === '' ? '' : (typeof item.rate === 'number' && item.rate > 0 ? item.rate : defaultRowRate)}
                          onChange={(e) => handleUpdateItem(index, 'rate', e.target.value)}
                          onBlur={() => {
                            if ((item.rate as any) === '' || item.rate === undefined || item.rate === null) {
                              handleUpdateItem(index, 'rate', defaultRowRate.toString());
                            }
                          }}
                          style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-800)', width: '60px' }}
                        />
                        {w >= 7 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setModalRateUnit(item.rateUnit === 'CFT' ? 'CFT' : 'SQFT');
                              if (item.rateUnit === 'CFT') {
                                setModalRateCft(item.rate ? item.rate.toString() : defaultRate.toString());
                                setModalRateSqft('120');
                              } else {
                                setModalRateSqft(item.rate ? item.rate.toString() : '120');
                                setModalRateCft(defaultRate.toString());
                              }
                              setWidthModalRowIndex(index);
                            }}
                            title="Width is ≥ 7in: Click to switch Rate in CFT or SQFT"
                            style={{
                              border: '1px solid var(--primary-400)',
                              backgroundColor: item.rateUnit === 'CFT' ? 'var(--bg-subtle)' : 'var(--primary-100)',
                              color: 'var(--primary-900)',
                              fontSize: '0.62rem',
                              fontWeight: 800,
                              borderRadius: '3px',
                              padding: '1px 3px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {item.rateUnit === 'CFT' ? 'CFT' : 'SQFT'}⚡
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700 }}>CFT</span>
                        )}
                      </div>
                    </td>

                    <td className="col-numeric" style={{ fontWeight: 800, color: 'var(--primary-800)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', padding: '0.25rem 0.15rem' }}>
                      ₹ {formatIndianCurrency(rowAmount)}
                    </td>

                    <td style={{ textAlign: 'center', padding: '0.2rem 0.1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.15rem' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm col-hide-mobile"
                          title="Duplicate row"
                          onClick={() => handleDuplicateRow(index)}
                          style={{ padding: '3px' }}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Delete row"
                          onClick={() => handleDeleteRow(index)}
                          style={{ padding: '3px', color: 'var(--danger-400)' }}
                        >
                          <Trash2 size={13} />
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
                <td colSpan={4} style={{ textAlign: 'right', padding: '0.4rem 0.35rem', color: 'var(--text-main)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                  Total:
                </td>
                <td style={{ textAlign: 'center', padding: '0.4rem 0.15rem', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.78rem' }}>
                  {totals.totalPieces} pcs
                </td>
                <td className="col-numeric col-cft" style={{ padding: '0.4rem 0.2rem', fontWeight: 800, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {formatValue(totals.totalCft, 3)}
                </td>
                <td className="col-numeric col-sqft col-hide-mobile" style={{ padding: '0.5rem 0.4rem', fontWeight: 800, fontSize: '0.88rem' }}>
                  {formatValue(totals.totalSqft, 2)}
                </td>
                <td className="col-hide-mobile" style={{ textAlign: 'right', padding: '0.5rem 0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Total:
                </td>
                <td className="col-numeric" style={{ padding: '0.4rem 0.2rem', color: 'var(--primary-800)', fontSize: '0.84rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
                  ₹ {formatIndianCurrency(totals.totalAmount || 0)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Add Row Button below Table */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleAddEmptyRow}
          style={{ flex: 1, justifyContent: 'center', fontWeight: 700, padding: '0.5rem' }}
        >
          <Plus size={15} /> Add Another Row
        </button>
      </div>

      {/* Summary Bar */}
      {items.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-subtle, #faf6ee)',
            border: '1.5px solid var(--border-medium)',
            padding: '0.45rem 0.75rem',
            fontSize: '0.82rem',
            fontWeight: 800,
            color: 'var(--primary-900)',
            borderRadius: '6px',
            marginTop: '0.4rem'
          }}
        >
          <span>Total: {totals.totalPieces} Pcs</span>
          <span>{formatValue(totals.totalCft, 3)} CFT</span>
          <span style={{ color: 'var(--primary-800)', fontFamily: 'var(--font-mono)' }}>
            ₹ {formatIndianCurrency(totals.totalAmount || 0)}
          </span>
        </div>
      )}

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
                    placeholder="120"
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
                    placeholder="1200"
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
