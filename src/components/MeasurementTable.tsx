import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Copy, AlertCircle, CornerDownLeft, X, Pencil } from 'lucide-react';
import type { MeasurementItem } from '../types';
import { calculateRow, calculateTotals, formatValue } from '../utils/calculator';
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
  const [quickPieces, setQuickPieces] = useState<string>('');
  const [quickRate, setQuickRate] = useState<string>('');
  const [quickRateUnit, setQuickRateUnit] = useState<'CFT' | 'SQFT'>('CFT');
  const [quickRateCft, setQuickRateCft] = useState<string>('');
  const [quickRateSqft, setQuickRateSqft] = useState<string>('');

  // Modal state for editing price / rate of a row
  const [editPriceRowIndex, setEditPriceRowIndex] = useState<number | null>(null);
  const [priceModalUnit, setPriceModalUnit] = useState<'CFT' | 'SQFT'>('CFT');
  const [priceModalRate, setPriceModalRate] = useState<string>('');
  const [priceModalAmount, setPriceModalAmount] = useState<string>('');

  useEffect(() => {
    if (editPriceRowIndex !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [editPriceRowIndex]);

  const [selectedWoodOption, setSelectedWoodOption] = useState<string>('Mahagony');
  const [customWoodType, setCustomWoodType] = useState<string>('');
  const [quickError, setQuickError] = useState<string | null>(null);

  const lengthInputRef = useRef<HTMLInputElement>(null);
  const listBottomRef = useRef<HTMLDivElement>(null);

  // Mobile virtual keyboard & calcy elevation tracking
  const [isCalcyFocused, setIsCalcyFocused] = useState<boolean>(false);
  const [calcyKeyboardOffset, setCalcyKeyboardOffset] = useState<number>(0);
  const calcyRef = useRef<HTMLFormElement>(null);
  const focusTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const updateViewport = () => {
      const windowH = window.innerHeight;
      const visualH = vv.height;
      const diff = windowH - visualH;
      // On mobile when keyboard opens, diff is typically >= 80px
      if (diff > 80) {
        setCalcyKeyboardOffset(diff);
        document.documentElement.style.setProperty('--calcy-keyboard-offset', `${Math.round(diff)}px`);
      } else {
        setCalcyKeyboardOffset(0);
        document.documentElement.style.setProperty('--calcy-keyboard-offset', '0px');
      }
    };

    vv.addEventListener('resize', updateViewport);
    vv.addEventListener('scroll', updateViewport);
    return () => {
      vv.removeEventListener('resize', updateViewport);
      vv.removeEventListener('scroll', updateViewport);
    };
  }, []);

  const handleCalcyFocus = () => {
    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    setIsCalcyFocused(true);
  };

  const handleCalcyBlur = (e: React.FocusEvent) => {
    if (calcyRef.current && calcyRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
    focusTimeoutRef.current = setTimeout(() => {
      setIsCalcyFocused(false);
    }, 180);
  };

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

  // Open price editing modal for any row
  const handleOpenPriceModal = (index: number) => {
    const item = items[index];
    if (!item) return;
    const w = typeof item.widthInches === 'number' ? item.widthInches : 0;
    const isSqft = w >= 7 && item.rateUnit !== 'CFT';
    const currentUnit = isSqft ? 'SQFT' : (item.rateUnit || 'CFT');
    const defaultRowRate = isSqft ? 120 : defaultRate;
    const currentRate = typeof item.rate === 'number' && item.rate > 0 ? item.rate : defaultRowRate;
    const multiplier = currentUnit === 'SQFT' ? item.sqft : item.cft;
    const currentAmount = typeof item.amount === 'number' && item.amount > 0 ? item.amount : Math.round(multiplier * currentRate * 100) / 100;

    setPriceModalUnit(currentUnit);
    setPriceModalRate(currentRate.toString());
    setPriceModalAmount(currentAmount.toFixed(2));
    setEditPriceRowIndex(index);
  };

  const handlePriceModalRateChange = (newRateStr: string) => {
    setPriceModalRate(newRateStr);
    if (editPriceRowIndex === null) return;
    const item = items[editPriceRowIndex];
    if (!item) return;
    const r = parseFloat(newRateStr);
    if (!isNaN(r)) {
      const mult = priceModalUnit === 'SQFT' ? item.sqft : item.cft;
      setPriceModalAmount((Math.round(mult * r * 100) / 100).toFixed(2));
    }
  };

  const handlePriceModalAmountChange = (newAmtStr: string) => {
    setPriceModalAmount(newAmtStr);
    if (editPriceRowIndex === null) return;
    const item = items[editPriceRowIndex];
    if (!item) return;
    const amt = parseFloat(newAmtStr);
    if (!isNaN(amt)) {
      const mult = priceModalUnit === 'SQFT' ? item.sqft : item.cft;
      if (mult > 0) {
        setPriceModalRate((Math.round((amt / mult) * 100) / 100).toString());
      }
    }
  };

  const handlePriceModalUnitChange = (newUnit: 'CFT' | 'SQFT') => {
    setPriceModalUnit(newUnit);
    if (editPriceRowIndex === null) return;
    const item = items[editPriceRowIndex];
    if (!item) return;
    const mult = newUnit === 'SQFT' ? item.sqft : item.cft;
    let suggestedRate = parseFloat(priceModalRate);
    if (newUnit === 'SQFT' && (!suggestedRate || suggestedRate === defaultRate)) {
      suggestedRate = 120;
    } else if (newUnit === 'CFT' && (!suggestedRate || suggestedRate === 120)) {
      suggestedRate = defaultRate;
    }
    setPriceModalRate(suggestedRate.toString());
    setPriceModalAmount((Math.round(mult * suggestedRate * 100) / 100).toFixed(2));
  };

  const handleSavePriceModal = () => {
    if (editPriceRowIndex === null) return;
    const updated = [...items];
    const target = { ...updated[editPriceRowIndex] };
    const r = parseFloat(priceModalRate) || 0;
    const amt = parseFloat(priceModalAmount) || 0;
    target.rateUnit = priceModalUnit;
    target.rate = r;
    target.amount = amt > 0 ? amt : Math.round((priceModalUnit === 'SQFT' ? target.sqft : target.cft) * r * 100) / 100;
    updated[editPriceRowIndex] = target;
    onChange(updated);
    setEditPriceRowIndex(null);
  };

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
        if (wNum >= 7) {
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
    const reindexed = updated.map((it, idx) => ({ ...it, serialNumber: idx + 1 }));
    onChange(reindexed);
  };

  // Delete a row
  const handleDeleteRow = (index: number) => {
    const updated = items.filter((_, idx) => idx !== index);
    const reindexed = updated.map((it, idx) => ({ ...it, serialNumber: idx + 1 }));
    onChange(reindexed);
  };


  // Add row via Quick-Add Bar
  const handleQuickAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setQuickError(null);

    const l = parseFloat(quickLength);
    const w = parseFloat(quickWidth);
    const t = parseFloat(quickThickness);
    const pRaw = parseFloat(quickPieces);
    const p = !isNaN(pRaw) && pRaw > 0 ? pRaw : 1;

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
        const parsedSqftRate = parseFloat(quickRateSqft) || parseFloat(quickRate);
        itemRate = !isNaN(parsedSqftRate) && parsedSqftRate > 0 ? parsedSqftRate : 120;
      }
    } else {
      finalRateUnit = 'CFT';
      const parsedRate = parseFloat(quickRate) || parseFloat(quickRateCft);
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

    // Add row sequentially one-by-one preserving exact entry order
    const updated = [...items, newItem];
    const reindexed = updated.map((it, idx) => ({ ...it, serialNumber: idx + 1 }));
    onChange(reindexed);

    // Keep thickness, width and rate for rapid consecutive tallying, clear length & pieces
    setQuickLength('');
    setQuickPieces('');

    // Smoothly scroll the newly added calculation into plain view right above the calcy
    setTimeout(() => {
      listBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);

    // Auto-refocus on length input for continuous fast entry
    setTimeout(() => {
      lengthInputRef.current?.focus();
    }, 120);
  };

  return (
    <div className="measurement-tally-root" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* 1. Quick Dimension Entry Form / Calcy (Below calculation in phone view; above on desktop) */}
      <div
        className={`quick-add-bar-wrapper ${isCalcyFocused ? 'calcy-is-elevated' : ''}`}
        style={{ minHeight: isCalcyFocused ? '105px' : 'auto' }}
      >
        <form
          ref={calcyRef}
          onSubmit={handleQuickAdd}
          onFocusCapture={handleCalcyFocus}
          onBlurCapture={handleCalcyBlur}
          className={`quick-add-bar no-print ${isCalcyFocused ? 'is-elevated-keyboard' : ''}`}
          style={isCalcyFocused && calcyKeyboardOffset > 0 ? { bottom: `${calcyKeyboardOffset}px` } : undefined}
        >
          {/* Header shown when elevated above keyboard in phone view */}
          {isCalcyFocused && (
            <div className="calcy-elevation-header">
              <span className="calcy-elevation-title">
                <CornerDownLeft size={13} color="var(--primary-600)" /> Quick Dimension Entry
              </span>
              <button
                type="button"
                className="calcy-elevation-dismiss"
                onClick={() => {
                  setIsCalcyFocused(false);
                  (document.activeElement as HTMLElement)?.blur();
                }}
              >
                Done ✕
              </button>
            </div>
          )}

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
                padding: '0.4rem 1.4rem 0.4rem 0.45rem',
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
                  🪵{species}
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
              fontSize: '0.84rem',
              whiteSpace: 'nowrap'
            }}
          >
            <Plus size={15} /> <span>Add Row</span>
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
      </div>

      {quickError && (
        <div style={{ fontSize: '0.82rem', color: 'var(--danger-400)', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.5rem' }}>
          <AlertCircle size={14} /> {quickError}
        </div>
      )}

      {/* 2. Desktop Spreadsheet Table View */}
      <div className="mobile-hide desktop-table-container">
        <div className="tally-table-container">
        <table className="calc-table">
          <thead>
            <tr>
              <th style={{ width: '24px', textAlign: 'center', padding: '0.35rem 0.05rem' }}>#</th>
              <th className="col-hide-mobile" style={{ minWidth: '115px' }}>Wood Species</th>
              <th style={{ textAlign: 'center', width: '34px', padding: '0.35rem 0.05rem' }}>
                <span className="mobile-hide">L (ft)</span>
                <span className="mobile-show">L</span>
              </th>
              <th style={{ textAlign: 'center', width: '34px', padding: '0.35rem 0.05rem' }}>
                <span className="mobile-hide">W (in)</span>
                <span className="mobile-show">W</span>
              </th>
              <th style={{ textAlign: 'center', width: '34px', padding: '0.35rem 0.05rem' }}>
                <span className="mobile-hide">T (in)</span>
                <span className="mobile-show">T</span>
              </th>
              <th style={{ textAlign: 'center', width: '28px', padding: '0.35rem 0.05rem' }}>
                <span className="mobile-hide">Pcs</span>
                <span className="mobile-show">P</span>
              </th>
              <th style={{ textAlign: 'center', width: '44px', padding: '0.35rem 0.05rem' }}>
                <span className="mobile-hide">Rate (₹)</span>
                <span className="mobile-show">Rate</span>
              </th>
              <th style={{ textAlign: 'right', padding: '0.35rem 0.15rem' }}>
                <span className="mobile-hide">Total CFT</span>
                <span className="mobile-show">CFT / Amount</span>
              </th>
              <th className="col-hide-mobile" style={{ textAlign: 'right' }}>Total SQFT</th>
              <th className="col-hide-mobile" style={{ textAlign: 'right' }}>Amount (₹)</th>
              <th style={{ width: '24px', textAlign: 'center', padding: '0.35rem 0.05rem' }}>
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
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary-700)', padding: '0.25rem 0.1rem' }}>
                      #{item.serialNumber}
                      {item.woodType && (
                        <div className="mobile-show" style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 700, lineHeight: 1, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '32px' }}>
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

                    <td style={{ textAlign: 'center', padding: '0.25rem 0.1rem' }}>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder=""
                        className="calc-input tally-cell-input"
                        value={item.lengthFeet}
                        onChange={(e) => handleUpdateItem(index, 'lengthFeet', e.target.value)}
                      />
                    </td>

                    <td style={{ textAlign: 'center', padding: '0.25rem 0.1rem' }}>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder=""
                        className="calc-input tally-cell-input"
                        value={item.widthInches}
                        onChange={(e) => handleUpdateItem(index, 'widthInches', e.target.value)}
                      />
                    </td>

                    <td style={{ textAlign: 'center', padding: '0.25rem 0.1rem' }}>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder=""
                        className="calc-input tally-cell-input"
                        value={item.thicknessInches}
                        onChange={(e) => handleUpdateItem(index, 'thicknessInches', e.target.value)}
                      />
                    </td>

                    <td style={{ textAlign: 'center', padding: '0.25rem 0.05rem' }}>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        placeholder=""
                        className="calc-input tally-cell-input"
                        value={item.pieces}
                        onChange={(e) => handleUpdateItem(index, 'pieces', e.target.value)}
                      />
                    </td>

                    {/* Price Box Column (Editable Rate input on both Mobile & Desktop) */}
                    <td style={{ textAlign: 'center', padding: '0.25rem 0.05rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder=""
                          className="calc-input tally-cell-input"
                          value={(item.rate as any) === '' ? '' : (typeof item.rate === 'number' && item.rate > 0 ? item.rate : defaultRowRate)}
                          onChange={(e) => handleUpdateItem(index, 'rate', e.target.value)}
                          onBlur={() => {
                            if ((item.rate as any) === '' || item.rate === undefined || item.rate === null) {
                              handleUpdateItem(index, 'rate', defaultRowRate.toString());
                            }
                          }}
                          style={{
                            width: '42px',
                            padding: '0.2rem 0.05rem',
                            fontWeight: 800,
                            textAlign: 'center',
                            color: 'var(--primary-900)'
                          }}
                        />
                        {w >= 7 && (
                          <button
                            type="button"
                            onClick={() => handleOpenPriceModal(index)}
                            title="Width ≥ 7in: Switch between CFT & SQFT rate"
                            style={{
                              border: '1px solid var(--primary-400)',
                              backgroundColor: item.rateUnit === 'CFT' ? 'var(--bg-subtle)' : 'var(--primary-100)',
                              color: 'var(--primary-900)',
                              fontSize: '0.55rem',
                              fontWeight: 800,
                              borderRadius: '3px',
                              padding: '1px 2px',
                              cursor: 'pointer',
                              lineHeight: 1
                            }}
                          >
                            ⚡
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Volume & Amount stacked on Mobile (Separate CFT on Desktop) */}
                    <td className="col-numeric col-cft" style={{ textAlign: 'right', padding: '0.25rem 0.15rem', whiteSpace: 'nowrap' }}>
                      <span className="mobile-hide" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                        {formatValue(item.cft, 3)}
                      </span>
                      <div className="mobile-show" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--primary-700)' }}>
                          {isSqft ? `${formatValue(item.sqft, 2)} SQFT` : `${formatValue(item.cft, 3)} CFT`}
                        </span>
                        <strong style={{ fontSize: '0.76rem', fontWeight: 900, color: 'var(--primary-800)', fontFamily: 'var(--font-mono)' }}>
                          ₹ {formatIndianCurrency(rowAmount)}
                        </strong>
                      </div>
                    </td>

                    {/* Total SQFT (Desktop only) */}
                    <td className="col-numeric col-sqft col-hide-mobile" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      {formatValue(item.sqft, 2)}
                    </td>

                    {/* Amount (Desktop only) */}
                    <td className="col-numeric col-hide-mobile" style={{ fontWeight: 800, color: 'var(--primary-800)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.86rem', padding: '0.25rem 0.15rem' }}>
                      ₹ {formatIndianCurrency(rowAmount)}
                    </td>

                    {/* Action (Delete) */}
                    <td style={{ textAlign: 'center', padding: '0.2rem 0.05rem', width: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.15rem' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm col-hide-mobile"
                          title="Duplicate row"
                          onClick={() => handleDuplicateRow(index)}
                          style={{ padding: '3px' }}
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Delete row"
                          onClick={() => handleDeleteRow(index)}
                          style={{
                            padding: 0,
                            color: 'var(--danger-500, #dc2626)',
                            minWidth: 0,
                            width: '20px',
                            height: '20px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
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
              <tr style={{ backgroundColor: 'var(--bg-subtle, #f1f5f9)', fontWeight: 800, borderTop: '2px solid var(--border-medium)' }}>
                <td className="mobile-show" colSpan={4} style={{ textAlign: 'right', padding: '0.35rem 0.2rem', color: 'var(--text-main)', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                  Total:
                </td>
                <td className="mobile-hide" colSpan={5} style={{ textAlign: 'right', padding: '0.5rem 0.5rem', color: 'var(--text-main)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                  Total:
                </td>
                <td style={{ textAlign: 'center', padding: '0.35rem 0.05rem', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.78rem' }}>
                  {totals.totalPieces}<span className="mobile-hide"> pcs</span>
                </td>
                <td></td>
                <td className="col-numeric col-cft" style={{ textAlign: 'right', padding: '0.35rem 0.15rem', whiteSpace: 'nowrap' }}>
                  <span className="mobile-hide" style={{ fontWeight: 800, fontSize: '0.88rem' }}>{formatValue(totals.totalCft, 3)}</span>
                  <div className="mobile-show" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--primary-700)' }}>
                      {formatValue(totals.totalCft, 3)} CFT
                    </span>
                    <strong style={{ fontSize: '0.76rem', fontWeight: 900, color: 'var(--primary-800)', fontFamily: 'var(--font-mono)' }}>
                      ₹ {formatIndianCurrency(totals.totalAmount || 0)}
                    </strong>
                  </div>
                </td>
                <td className="col-numeric col-sqft col-hide-mobile" style={{ padding: '0.5rem 0.4rem', fontWeight: 800, fontSize: '0.88rem' }}>
                  {formatValue(totals.totalSqft, 2)}
                </td>
                <td className="col-numeric col-hide-mobile" style={{ padding: '0.4rem 0.2rem', color: 'var(--primary-800)', fontSize: '0.92rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
                  ₹ {formatIndianCurrency(totals.totalAmount || 0)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>

      {/* 2. Mobile View: Single-line rows (Measurements + Price beside PCS + Delete) */}
      <div
        className="mobile-show measurement-mobile-list"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
          paddingBottom: isCalcyFocused ? '160px' : '0.5rem'
        }}
      >
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.25rem 1rem', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              No measurement rows yet
            </p>
            <p style={{ fontSize: '0.76rem', margin: '0.2rem 0 0' }}>
              Enter dimensions below &amp; click <strong>+ Add Row</strong>.
            </p>
          </div>
        ) : (
          <>
            {/* Column label header for phone */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--bg-subtle, #f1f5f9)',
              padding: '0.28rem 0.4rem',
              borderRadius: '6px',
              fontSize: '0.66rem',
              fontWeight: 800,
              color: 'var(--text-main)',
              textTransform: 'uppercase'
            }}>
              <div style={{ width: '38px', textAlign: 'left' }}>Tree</div>
              <div style={{ display: 'flex', gap: '0.15rem', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                <span style={{ width: '34px', textAlign: 'center' }}>L (ft)</span>
                <span style={{ width: '4px' }}></span>
                <span style={{ width: '34px', textAlign: 'center' }}>W (in)</span>
                <span style={{ width: '4px' }}></span>
                <span style={{ width: '34px', textAlign: 'center' }}>T (in)</span>
                <span style={{ width: '4px' }}></span>
                <span style={{ width: '28px', textAlign: 'center' }}>Pcs</span>
              </div>
              <div style={{ width: '56px', textAlign: 'right', paddingRight: '0.2rem' }}>CFT / SQFT</div>
              <div style={{ width: '44px', textAlign: 'center' }}>Rate</div>
              <div style={{ width: '20px', textAlign: 'center' }}>Del</div>
            </div>

            {items.map((item, index) => {
              const l = typeof item.lengthFeet === 'number' ? item.lengthFeet : 0;
              const w = typeof item.widthInches === 'number' ? item.widthInches : 0;
              const t = typeof item.thicknessInches === 'number' ? item.thicknessInches : 0;
              const p = typeof item.pieces === 'number' ? item.pieces : 0;
              const isRowValid = l > 0 && w > 0 && t > 0 && p > 0;
              const isSqft = w >= 7 && item.rateUnit !== 'CFT';
              const defaultRowRate = isSqft ? 120 : defaultRate;
              const rowRate = (item.rate as any) === '' ? '' : (typeof item.rate === 'number' && item.rate > 0 ? item.rate : defaultRowRate);

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.75)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                    padding: '0.26rem 0.35rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.2rem',
                    opacity: isRowValid ? 1 : 0.85
                  }}
                >
                  {/* Tree Name */}
                  <div style={{ width: '38px', minWidth: '38px', overflow: 'hidden' }}>
                    <span
                      title={item.woodType || 'Wood'}
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: 'var(--primary-800)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'block'
                      }}
                    >
                      {item.woodType || 'Wood'}
                    </span>
                  </div>

                  {/* Measurements */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', flex: 1, justifyContent: 'center' }}>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder=""
                      className="calc-input tally-cell-input"
                      value={item.lengthFeet}
                      onChange={(e) => handleUpdateItem(index, 'lengthFeet', e.target.value)}
                      style={{ width: '34px', padding: '0.25rem 0.04rem', textAlign: 'center', fontWeight: 800 }}
                    />
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>×</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder=""
                      className="calc-input tally-cell-input"
                      value={item.widthInches}
                      onChange={(e) => handleUpdateItem(index, 'widthInches', e.target.value)}
                      style={{ width: '34px', padding: '0.25rem 0.04rem', textAlign: 'center', fontWeight: 800 }}
                    />
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>×</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder=""
                      className="calc-input tally-cell-input"
                      value={item.thicknessInches}
                      onChange={(e) => handleUpdateItem(index, 'thicknessInches', e.target.value)}
                      style={{ width: '34px', padding: '0.25rem 0.04rem', textAlign: 'center', fontWeight: 800 }}
                    />
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>×</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      placeholder=""
                      className="calc-input tally-cell-input"
                      value={item.pieces}
                      onChange={(e) => handleUpdateItem(index, 'pieces', e.target.value)}
                      style={{ width: '28px', padding: '0.25rem 0.04rem', textAlign: 'center', fontWeight: 800 }}
                    />
                  </div>

                  {/* Volume with SQFT / CFT mention */}
                  <div
                    onClick={() => handleOpenPriceModal(index)}
                    title={isSqft ? `${formatValue(item.sqft, 2)} SQFT - Click to edit rate/unit` : `${formatValue(item.cft, 3)} CFT - Click to edit rate/unit`}
                    style={{
                      width: '56px',
                      minWidth: '56px',
                      textAlign: 'right',
                      cursor: 'pointer',
                      lineHeight: 1.15,
                      paddingRight: '0.15rem'
                    }}
                  >
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: isSqft ? '#b45309' : 'var(--primary-800)',
                      fontFamily: 'var(--font-mono, monospace)',
                      whiteSpace: 'nowrap'
                    }}>
                      {!isRowValid ? '-' : (isSqft ? formatValue(item.sqft, 1) : formatValue(item.cft, 2))}
                    </span>
                    <span style={{
                      fontSize: '0.58rem',
                      fontWeight: 800,
                      color: isSqft ? '#b45309' : 'var(--text-muted)',
                      marginLeft: '2px',
                      textTransform: 'uppercase'
                    }}>
                      {isSqft ? 'SQFT' : 'CFT'}
                    </span>
                  </div>

                  {/* Individual Price (Rate) Edit Option */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', width: '44px', minWidth: '44px', justifyContent: 'center' }}>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder=""
                      className="calc-input tally-cell-input"
                      value={rowRate}
                      onChange={(e) => handleUpdateItem(index, 'rate', e.target.value)}
                      onBlur={() => {
                        if ((item.rate as any) === '' || item.rate === undefined || item.rate === null) {
                          handleUpdateItem(index, 'rate', defaultRowRate.toString());
                        }
                      }}
                      style={{
                        width: '42px',
                        padding: '0.22rem 0.04rem',
                        fontWeight: 800,
                        textAlign: 'center',
                        fontSize: '0.78rem',
                        color: 'var(--primary-900)'
                      }}
                    />
                  </div>

                  {/* Delete button */}
                  <div style={{ width: '20px', minWidth: '20px', display: 'flex', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="Delete row"
                      onClick={() => handleDeleteRow(index)}
                      style={{
                        padding: 0,
                        color: 'var(--danger-500, #dc2626)',
                        minWidth: 0,
                        width: '20px',
                        height: '22px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Scroll anchor to bring newly added calculation into plain view right above calcy */}
            <div ref={listBottomRef} style={{ height: '1px' }} />

            {/* Mobile Totals Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-subtle, #f8fafc)',
              border: '1.5px solid var(--border-medium)',
              borderRadius: '8px',
              padding: '0.45rem 0.65rem',
              fontWeight: 800,
              fontSize: '0.78rem',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)'
            }}>
              <span>Total: {totals.totalPieces} Pcs</span>
              <span style={{ color: 'var(--primary-700)' }}>{formatValue(totals.totalCft, 3)} CFT</span>
              <span style={{ color: 'var(--primary-900)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
                ₹ {formatIndianCurrency(totals.totalAmount || 0)}
              </span>
            </div>
          </>
        )}
      </div>


      {/* Summary Bar */}
      {items.length > 0 && (
        <div
          className="mobile-hide"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-subtle, #f8fafc)',
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

      {/* Comprehensive Edit Price & Rate Dialog Modal (Rendered at top of viewport via portal) */}
      {editPriceRowIndex !== null && items[editPriceRowIndex] && typeof document !== 'undefined' && createPortal(
        (() => {
          const item = items[editPriceRowIndex];
          const wNum = typeof item.widthInches === 'number' ? item.widthInches : parseFloat(item.widthInches as string) || 0;
          const isPlank = wNum >= 7;
          return (
            <div
              className="modal-backdrop"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.68)',
                zIndex: 99999,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '0.65rem',
                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.85rem)',
                overflowY: 'auto',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setEditPriceRowIndex(null);
              }}
            >
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  padding: '1rem 1.15rem',
                  maxWidth: '400px',
                  width: '100%',
                  boxShadow: '0 20px 40px -8px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.9) inset',
                  border: '1.5px solid var(--border-medium)',
                  marginTop: '0',
                  marginBottom: '2rem'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--primary-900)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Pencil size={16} style={{ color: 'var(--primary-700)' }} />
                    Edit Price — Row #{item.serialNumber}
                  </h3>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditPriceRowIndex(null)}
                    style={{ padding: '4px', minWidth: 0, width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Row Specs summary banner */}
                <div style={{
                  backgroundColor: 'var(--bg-subtle, #f8fafc)',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  borderRadius: '8px',
                  padding: '0.6rem 0.75rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 800, color: 'var(--primary-900)', fontSize: '0.85rem' }}>
                      {item.woodType || 'Timber'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {item.lengthFeet}′ × {item.widthInches}″ × {item.thicknessInches}″ • {item.pieces} pcs
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: 'var(--primary-700)', fontSize: '0.85rem' }}>
                      {priceModalUnit === 'SQFT' ? `${item.sqft.toFixed(2)} SQFT` : `${item.cft.toFixed(3)} CFT`}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {priceModalUnit === 'SQFT' ? `(${item.cft.toFixed(3)} CFT)` : `(${item.sqft.toFixed(2)} SQFT)`}
                    </div>
                  </div>
                </div>

                {/* Unit Switcher (CFT vs SQFT) */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Pricing Unit:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => handlePriceModalUnitChange('CFT')}
                      style={{
                        padding: '0.55rem',
                        borderRadius: '6px',
                        border: priceModalUnit === 'CFT' ? '2px solid var(--primary-700)' : '1px solid var(--border-medium)',
                        backgroundColor: priceModalUnit === 'CFT' ? 'var(--primary-100, #f8efe2)' : '#fff',
                        color: priceModalUnit === 'CFT' ? 'var(--primary-900)' : 'var(--text-main)',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                    >
                      <span>Rate in CFT</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>₹ / CFT</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePriceModalUnitChange('SQFT')}
                      style={{
                        padding: '0.55rem',
                        borderRadius: '6px',
                        border: priceModalUnit === 'SQFT' ? '2px solid var(--primary-700)' : '1px solid var(--border-medium)',
                        backgroundColor: priceModalUnit === 'SQFT' ? 'var(--primary-100, #f8efe2)' : '#fff',
                        color: priceModalUnit === 'SQFT' ? 'var(--primary-900)' : 'var(--text-main)',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                    >
                      <span>Rate in SQFT {isPlank ? '⚡' : ''}</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>₹ / SQFT</span>
                    </button>
                  </div>
                </div>

                {/* Rate input & Presets */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Rate (₹ per {priceModalUnit}):
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', fontSize: '1rem' }}>₹</span>
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      className="calc-input"
                      value={priceModalRate}
                      onChange={(e) => handlePriceModalRateChange(e.target.value)}
                      placeholder=""
                      style={{
                        width: '100%',
                        paddingLeft: '1.8rem',
                        fontSize: '1.05rem',
                        fontWeight: 800,
                        color: 'var(--primary-900)',
                        textAlign: 'left'
                      }}
                    />
                  </div>

                  {/* Quick preset chips */}
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
                    {(priceModalUnit === 'SQFT' ? ['80', '100', '120', '150', '180'] : ['900', '1000', '1200', '1400', '1600']).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handlePriceModalRateChange(preset)}
                        style={{
                          padding: '2px 8px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          borderRadius: '4px',
                          border: priceModalRate === preset ? '1.5px solid var(--primary-700)' : '1px solid var(--border-medium)',
                          backgroundColor: priceModalRate === preset ? 'var(--primary-200)' : 'var(--bg-subtle)',
                          color: 'var(--text-main)',
                          cursor: 'pointer'
                        }}
                      >
                        ₹{preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Total Amount Override Input */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Total Row Amount (₹):
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', fontSize: '1rem' }}>₹</span>
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      className="calc-input"
                      value={priceModalAmount}
                      onChange={(e) => handlePriceModalAmountChange(e.target.value)}
                      placeholder=""
                      style={{
                        width: '100%',
                        paddingLeft: '1.8rem',
                        fontSize: '1.05rem',
                        fontWeight: 900,
                        color: 'var(--primary-900)',
                        backgroundColor: 'var(--bg-subtle, #fcf9f2)',
                        textAlign: 'left'
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Auto-calculates rate or enter a flat custom amount.
                  </div>
                </div>

                {/* Modal Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditPriceRowIndex(null)}
                    style={{ padding: '0.45rem 0.85rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleSavePriceModal}
                    style={{ fontWeight: 800, padding: '0.45rem 1rem' }}
                  >
                    Save &amp; Apply Price
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
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
