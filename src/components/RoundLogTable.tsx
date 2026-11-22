import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Copy, AlertCircle, CornerDownLeft, X, Pencil, Sliders } from 'lucide-react';
import type { RoundLogItem, RoundLogOutputUnit, RoundLogInputUnitType } from '../types';
import {
  calculateRoundLogRow,
  calculateRoundLogTotals,
  getRoundLogUnitConfig,
  ROUND_LOG_INPUT_UNIT_OPTIONS
} from '../utils/roundLogCalculator';
import { formatIndianCurrency } from '../utils/indianNumberWords';
import { formatValue } from '../utils/calculator';
import { generateId } from '../services/db';
import { WOOD_SPECIES_OPTIONS } from './MeasurementTable';

interface RoundLogTableProps {
  items: RoundLogItem[];
  onChange: (items: RoundLogItem[]) => void;
  outputUnit: RoundLogOutputUnit;
  inputUnit: RoundLogInputUnitType;
  onOutputUnitChange?: (unit: RoundLogOutputUnit) => void;
  onInputUnitChange?: (unit: RoundLogInputUnitType) => void;
  defaultRate?: number;
  customerName?: string;
  onNewSheet?: () => void;
}

export const RoundLogTable: React.FC<RoundLogTableProps> = ({
  items,
  onChange,
  outputUnit,
  inputUnit,
  onOutputUnitChange,
  onInputUnitChange,
  defaultRate = 1200,
  customerName,
  onNewSheet
}) => {
  const unitConfig = getRoundLogUnitConfig(inputUnit);
  const { girthUnit, lengthUnit } = unitConfig;

  // Quick Add Input State
  const [quickGirth, setQuickGirth] = useState<string>('');
  const [quickLength, setQuickLength] = useState<string>('');
  const [quickPieces, setQuickPieces] = useState<string>('');
  const [quickRate, setQuickRate] = useState<string>('');

  // Modal state for editing price / rate of a row
  const [editPriceRowIndex, setEditPriceRowIndex] = useState<number | null>(null);
  const [priceModalRate, setPriceModalRate] = useState<string>('');
  const [priceModalAmount, setPriceModalAmount] = useState<string>('');

  // Unit switcher modal / popover
  const [isUnitModalOpen, setIsUnitModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (editPriceRowIndex !== null || isUnitModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [editPriceRowIndex, isUnitModalOpen]);

  const [selectedWoodOption, setSelectedWoodOption] = useState<string>('Mahagony');
  const [customWoodType, setCustomWoodType] = useState<string>('');
  const [quickError, setQuickError] = useState<string | null>(null);

  const girthInputRef = useRef<HTMLInputElement>(null);
  const lengthInputRef = useRef<HTMLInputElement>(null);
  const piecesInputRef = useRef<HTMLInputElement>(null);
  const rateInputRef = useRef<HTMLInputElement>(null);
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
  const gVal = parseFloat(quickGirth) || 0;
  const lVal = parseFloat(quickLength) || 0;
  const pVal = parseFloat(quickPieces) || 0;
  const liveCalc = calculateRoundLogRow(gVal, lVal, pVal, outputUnit, inputUnit);
  const rawEnteredRate = parseFloat(quickRate);
  const currentRateVal = !isNaN(rawEnteredRate) && rawEnteredRate > 0 ? rawEnteredRate : 0;
  const liveAmount = currentRateVal > 0 ? Math.round(liveCalc.volume * currentRateVal * 100) / 100 : 0;

  // Real-time table totals
  const totals = calculateRoundLogTotals(items, outputUnit);

  // Open price editing modal for any row
  const handleOpenPriceModal = (index: number) => {
    const item = items[index];
    if (!item) return;
    const currentRate = typeof item.rate === 'number' && item.rate > 0 ? item.rate : defaultRate;
    const currentAmount = typeof item.amount === 'number' && item.amount > 0 
      ? item.amount 
      : Math.round(item.volume * currentRate * 100) / 100;

    setPriceModalRate(String(currentRate));
    setPriceModalAmount(String(currentAmount));
    setEditPriceRowIndex(index);
  };

  // Save changes from price modal
  const handleSavePriceModal = () => {
    if (editPriceRowIndex === null) return;
    const updated = [...items];
    const target = { ...updated[editPriceRowIndex] };
    const r = parseFloat(priceModalRate) || 0;
    const amt = parseFloat(priceModalAmount) || 0;
    target.rate = r;
    target.amount = amt > 0 ? amt : Math.round(target.volume * r * 100) / 100;
    updated[editPriceRowIndex] = target;
    onChange(updated);
    setEditPriceRowIndex(null);
  };

  // Handle in-place row editing
  const handleUpdateItem = (
    index: number,
    field: keyof RoundLogItem,
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
      const calc = calculateRoundLogRow(
        target.girth,
        target.length,
        target.pieces,
        target.outputUnit || outputUnit,
        target.inputUnit || inputUnit
      );
      target.volume = calc.volume;

      const rowRate = typeof target.rate === 'number' && target.rate > 0 ? target.rate : defaultRate;
      target.amount = Math.round(calc.volume * rowRate * 100) / 100;
    }

    updated[index] = target;
    onChange(updated);
  };

  // Duplicate an existing row
  const handleDuplicateRow = (index: number) => {
    const source = items[index];
    const duplicate: RoundLogItem = {
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

  // Sequential field navigation
  const isNavigatingRef = useRef<boolean>(false);
  const rateFocusedAtRef = useRef<number>(0);

  const advanceFrom = (source: 'girth' | 'length' | 'pieces' | 'rate') => {
    if (source === 'rate') {
      if (Date.now() - rateFocusedAtRef.current < 450) {
        return;
      }
      handleQuickAdd();
      return;
    }

    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 280);

    if (source === 'girth') {
      lengthInputRef.current?.focus();
    } else if (source === 'length') {
      piecesInputRef.current?.focus();
    } else if (source === 'pieces') {
      rateFocusedAtRef.current = Date.now();
      rateInputRef.current?.focus();
    }
  };

  const handleKeyNav = (
    e: React.KeyboardEvent,
    source: 'girth' | 'length' | 'pieces' | 'rate'
  ) => {
    if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13) {
      e.preventDefault();
      e.stopPropagation();
      advanceFrom(source);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNavigatingRef.current) return;
    if (Date.now() - rateFocusedAtRef.current < 450) return;

    const active = document.activeElement;
    if (active === girthInputRef.current) {
      advanceFrom('girth');
      return;
    }
    if (active === lengthInputRef.current) {
      advanceFrom('length');
      return;
    }
    if (active === piecesInputRef.current) {
      advanceFrom('pieces');
      return;
    }
    if (active === rateInputRef.current) {
      handleQuickAdd();
    }
  };

  // Add row via Quick-Add Bar
  const handleQuickAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setQuickError(null);

    const g = parseFloat(quickGirth);
    const l = parseFloat(quickLength);
    const pRaw = parseFloat(quickPieces);
    const p = !isNaN(pRaw) && pRaw > 0 ? pRaw : 1;

    if (isNaN(g) || g <= 0) {
      setQuickError(`Girth must be greater than 0 ${girthUnit}`);
      girthInputRef.current?.focus();
      return;
    }
    if (isNaN(l) || l <= 0) {
      setQuickError(`Length must be greater than 0 ${lengthUnit}`);
      lengthInputRef.current?.focus();
      return;
    }

    // Check DOM value of rate to prevent mobile state lag
    const directRateInput = rateInputRef.current?.value?.trim();
    const domRateVal = directRateInput !== undefined && directRateInput !== '' ? parseFloat(directRateInput) : NaN;
    const parsedRate = !isNaN(domRateVal) && domRateVal > 0 ? domRateVal : parseFloat(quickRate);

    if (!parsedRate || isNaN(parsedRate) || parsedRate <= 0) {
      setQuickError(`Please enter price / rate before adding row`);
      rateInputRef.current?.focus();
      return;
    }

    const calc = calculateRoundLogRow(g, l, p, outputUnit, inputUnit);
    const itemAmount = Math.round(calc.volume * parsedRate * 100) / 100;
    const finalWood = selectedWoodOption === 'Other (Custom...)' 
      ? (customWoodType.trim() || 'Custom Wood') 
      : selectedWoodOption;

    const newItem: RoundLogItem = {
      id: generateId(),
      serialNumber: items.length + 1,
      woodType: finalWood,
      girth: g,
      length: l,
      pieces: p,
      volume: calc.volume,
      outputUnit,
      inputUnit,
      rate: parsedRate,
      amount: itemAmount
    };

    const updated = [...items, newItem];
    const reindexed = updated.map((it, idx) => ({ ...it, serialNumber: idx + 1 }));
    onChange(reindexed);

    // Reset inputs
    setQuickGirth('');
    setQuickLength('');
    setQuickPieces('');
    setQuickRate('');
    if (rateInputRef.current) {
      rateInputRef.current.value = '';
    }

    // Scroll to view
    setTimeout(() => {
      listBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);

    // Keep mobile keyboard focused
    girthInputRef.current?.focus();
    setTimeout(() => {
      girthInputRef.current?.focus();
    }, 60);
  };

  return (
    <div className="measurement-tally-root" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Top Header & Summary */}
      {(customerName !== undefined || onNewSheet) && (
        <div className="calc-step2-top-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <div className="calc-step2-title-block">
            <h3 style={{ fontSize: '1.15rem', margin: 0, color: 'var(--text-main)', fontWeight: 800 }}>
              Round Log Measurement Daily Tally
            </h3>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Customer: <strong>{customerName || 'Direct Cash Buyer'}</strong> &bull; Hoppus Rule ({outputUnit})
            </p>
          </div>

          <div className="calc-step2-actions-block" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', justifyContent: 'space-between' }}>
            <span className="badge calc-step2-total-badge" style={{ backgroundColor: 'var(--primary-100)', color: 'var(--primary-800)', border: '1px solid var(--primary-200)', fontSize: '0.74rem', padding: '0.22rem 0.5rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
              <span className="mobile-hide">{customerName ? `${customerName} • ` : ''}</span>
              Total: {formatValue(totals.totalVolume, 4)} {outputUnit} &bull; ₹ {formatIndianCurrency(totals.totalAmount || 0)}
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
      )}

      {/* Unit Settings Pill Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-subtle, #f1f5f9)',
        border: '1px solid var(--border-medium)',
        borderRadius: '8px',
        padding: '0.4rem 0.65rem',
        flexWrap: 'wrap',
        gap: '0.4rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span className="badge" style={{ backgroundColor: 'var(--primary-800)', color: '#fff', fontSize: '0.74rem', padding: '0.2rem 0.45rem', fontWeight: 800 }}>
            🪵 Round Log
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Output: <strong style={{ color: 'var(--primary-700)' }}>{outputUnit}</strong> &bull; Input: <strong style={{ color: 'var(--primary-700)' }}>{unitConfig.label}</strong>
          </span>
        </div>

        {onOutputUnitChange && onInputUnitChange && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIsUnitModalOpen(true)}
            style={{ fontSize: '0.74rem', fontWeight: 700, padding: '0.22rem 0.55rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Sliders size={13} /> Change Units
          </button>
        )}
      </div>

      {/* 1. Quick Dimension Entry Form / Calcy */}
      <div
        className={`quick-add-bar-wrapper ${isCalcyFocused ? 'calcy-is-elevated' : ''}`}
        style={{ minHeight: isCalcyFocused ? '105px' : 'auto' }}
      >
        <form
          ref={calcyRef}
          onSubmit={handleFormSubmit}
          onFocusCapture={handleCalcyFocus}
          onBlurCapture={handleCalcyBlur}
          className={`quick-add-bar no-print ${isCalcyFocused ? 'is-elevated-keyboard' : ''}`}
          style={isCalcyFocused && calcyKeyboardOffset > 0 ? { bottom: `${calcyKeyboardOffset}px` } : undefined}
        >
          {isCalcyFocused && (
            <div className="calcy-elevation-header">
              <span className="calcy-elevation-title">
                <CornerDownLeft size={13} color="var(--primary-600)" /> Round Log Quick Entry ({unitConfig.shortLabel})
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
            <span>Round Log Quick Entry ({unitConfig.shortLabel} &rarr; {outputUnit}):</span>
          </div>

          <div className="quick-add-dims">
            {/* Girth Input */}
            <div className="quick-dim-col">
              <label className="quick-dim-label">
                <span className="dim-label-desktop">Girth ({girthUnit})</span>
                <span className="dim-label-mobile">G ({girthUnit})</span>
              </label>
              <input
                ref={girthInputRef}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder=""
                className="calc-input"
                value={quickGirth}
                onChange={(e) => setQuickGirth(e.target.value)}
                onKeyDown={(e) => handleKeyNav(e, 'girth')}
                enterKeyHint="next"
                tabIndex={1}
              />
            </div>

            {/* Length Input */}
            <div className="quick-dim-col">
              <label className="quick-dim-label">
                <span className="dim-label-desktop">Length ({lengthUnit})</span>
                <span className="dim-label-mobile">L ({lengthUnit})</span>
              </label>
              <input
                ref={lengthInputRef}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder=""
                className="calc-input"
                value={quickLength}
                onChange={(e) => setQuickLength(e.target.value)}
                onKeyDown={(e) => handleKeyNav(e, 'length')}
                enterKeyHint="next"
                tabIndex={2}
              />
            </div>

            {/* Pieces Input */}
            <div className="quick-dim-col">
              <label className="quick-dim-label">
                <span className="dim-label-desktop">Pieces</span>
                <span className="dim-label-mobile">Pcs</span>
              </label>
              <input
                ref={piecesInputRef}
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                placeholder=""
                className="calc-input"
                value={quickPieces}
                onChange={(e) => setQuickPieces(e.target.value)}
                onKeyDown={(e) => handleKeyNav(e, 'pieces')}
                enterKeyHint="next"
                tabIndex={3}
              />
            </div>

            {/* Rate Input */}
            <div className="quick-dim-col quick-dim-col-rate">
              <label className="quick-dim-label">
                <span className="dim-label-desktop">Rate (₹/{outputUnit})</span>
                <span className="dim-label-mobile">Rate</span>
              </label>
              <input
                ref={rateInputRef}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder=""
                className="calc-input"
                value={quickRate}
                onFocus={() => {
                  rateFocusedAtRef.current = Date.now();
                }}
                onChange={(e) => setQuickRate(e.target.value)}
                onKeyDown={(e) => handleKeyNav(e, 'rate')}
                enterKeyHint="go"
                tabIndex={4}
              />
            </div>
          </div>

          {/* Quick-Add Controls (Wood Selector & Add Button) */}
          <div className="quick-add-controls">
            <div className="quick-wood-selector-wrapper">
              <select
                id="round-wood-species"
                value={selectedWoodOption}
                onChange={(e) => setSelectedWoodOption(e.target.value)}
                className="calc-select"
                tabIndex={-1}
              >
                {WOOD_SPECIES_OPTIONS.map((sp) => (
                  <option key={sp} value={sp}>
                    🪵 {sp}
                  </option>
                ))}
              </select>

              {selectedWoodOption === 'Other (Custom...)' && (
                <input
                  type="text"
                  placeholder="Type custom wood..."
                  value={customWoodType}
                  onChange={(e) => setCustomWoodType(e.target.value)}
                  className="calc-input custom-wood-input"
                />
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary quick-add-submit-btn"
              onClick={() => handleQuickAdd()}
            >
              <Plus size={16} />
              <span>Add Row</span>
            </button>
          </div>

          {/* Live Preview Chip */}
          {liveCalc.volume > 0 && (
            <div className="quick-live-preview-chip">
              <span>{formatValue(liveCalc.volume, 3)} {outputUnit}</span>
              {currentRateVal > 0 && (
                <>
                  <span className="sep">&bull;</span>
                  <strong>₹ {formatIndianCurrency(liveAmount)}</strong>
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
                <th style={{ width: '28px', textAlign: 'center', padding: '0.35rem 0.05rem' }}>#</th>
                <th style={{ minWidth: '120px' }}>Wood Species</th>
                <th style={{ textAlign: 'center', width: '50px', padding: '0.35rem 0.05rem' }}>
                  G ({girthUnit})
                </th>
                <th style={{ textAlign: 'center', width: '50px', padding: '0.35rem 0.05rem' }}>
                  L ({lengthUnit})
                </th>
                <th style={{ textAlign: 'center', width: '36px', padding: '0.35rem 0.05rem' }}>
                  Pcs
                </th>
                <th style={{ textAlign: 'center', width: '54px', padding: '0.35rem 0.05rem' }}>
                  Rate (₹/{outputUnit})
                </th>
                <th style={{ textAlign: 'right', padding: '0.35rem 0.25rem', width: '75px' }}>
                  Total {outputUnit}
                </th>
                <th style={{ textAlign: 'right', padding: '0.35rem 0.25rem', width: '90px' }}>
                  Amount (₹)
                </th>
                <th style={{ width: '32px', textAlign: 'center', padding: '0.35rem 0.05rem' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                        No round log measurements yet
                      </p>
                      <p style={{ fontSize: '0.78rem', margin: 0, maxWidth: '380px' }}>
                        Enter Girth ({girthUnit}) &amp; Length ({lengthUnit}) above &amp; click <strong>+ Add Row</strong>.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const g = typeof item.girth === 'number' ? item.girth : 0;
                  const l = typeof item.length === 'number' ? item.length : 0;
                  const p = typeof item.pieces === 'number' ? item.pieces : 0;
                  const isRowValid = g > 0 && l > 0 && p > 0;
                  const rowRate = typeof item.rate === 'number' && item.rate > 0 ? item.rate : defaultRate;
                  const rowAmount = typeof item.amount === 'number' && item.amount > 0 ? item.amount : Math.round(item.volume * rowRate * 100) / 100;

                  return (
                    <tr key={item.id} style={{ opacity: isRowValid ? 1 : 0.85 }}>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary-700)', padding: '0.25rem 0.1rem' }}>
                        #{item.serialNumber}
                      </td>

                      <td>
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

                      <td style={{ textAlign: 'center', padding: '0.2rem 0.05rem' }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="calc-input tally-cell-input"
                          value={item.girth}
                          onChange={(e) => handleUpdateItem(index, 'girth', e.target.value)}
                          style={{ width: '46px', textAlign: 'center', fontWeight: 800 }}
                        />
                      </td>

                      <td style={{ textAlign: 'center', padding: '0.2rem 0.05rem' }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="calc-input tally-cell-input"
                          value={item.length}
                          onChange={(e) => handleUpdateItem(index, 'length', e.target.value)}
                          style={{ width: '46px', textAlign: 'center', fontWeight: 800 }}
                        />
                      </td>

                      <td style={{ textAlign: 'center', padding: '0.2rem 0.05rem' }}>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          className="calc-input tally-cell-input"
                          value={item.pieces}
                          onChange={(e) => handleUpdateItem(index, 'pieces', e.target.value)}
                          style={{ width: '32px', textAlign: 'center', fontWeight: 800 }}
                        />
                      </td>

                      <td style={{ textAlign: 'center', padding: '0.2rem 0.05rem' }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="calc-input tally-cell-input"
                          value={item.rate}
                          onChange={(e) => handleUpdateItem(index, 'rate', e.target.value)}
                          style={{ width: '52px', textAlign: 'center', fontWeight: 800 }}
                        />
                      </td>

                      <td className="col-numeric" style={{ textAlign: 'right', padding: '0.25rem 0.25rem', whiteSpace: 'nowrap', fontWeight: 700, fontSize: '0.85rem' }}>
                        {formatValue(item.volume, 3)}
                      </td>

                      <td className="col-numeric" style={{ fontWeight: 800, color: 'var(--primary-800)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.86rem', padding: '0.25rem 0.25rem' }}>
                        ₹ {formatIndianCurrency(rowAmount)}
                      </td>

                      <td style={{ textAlign: 'center', padding: '0.2rem 0.05rem', width: '32px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.15rem' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
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
                  <td colSpan={4} style={{ textAlign: 'right', padding: '0.5rem 0.5rem', color: 'var(--text-main)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                    Total Round Logs:
                  </td>
                  <td style={{ textAlign: 'center', padding: '0.35rem 0.05rem', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.82rem' }}>
                    {totals.totalPieces} pcs
                  </td>
                  <td></td>
                  <td className="col-numeric" style={{ textAlign: 'right', padding: '0.35rem 0.25rem', whiteSpace: 'nowrap', fontWeight: 800, fontSize: '0.88rem' }}>
                    {formatValue(totals.totalVolume, 3)} {outputUnit}
                  </td>
                  <td className="col-numeric" style={{ padding: '0.4rem 0.25rem', color: 'var(--primary-800)', fontSize: '0.92rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
                    ₹ {formatIndianCurrency(totals.totalAmount || 0)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 2. Mobile View: Single-line rows */}
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
              No round log entries yet
            </p>
            <p style={{ fontSize: '0.76rem', margin: '0.2rem 0 0' }}>
              Enter Girth ({girthUnit}) &amp; Length ({lengthUnit}) below &amp; click <strong>+ Add Row</strong>.
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
              <div style={{ width: '42px', textAlign: 'left' }}>Tree</div>
              <div style={{ display: 'flex', gap: '0.15rem', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                <span style={{ width: '42px', textAlign: 'center' }}>G ({girthUnit})</span>
                <span style={{ width: '4px' }}></span>
                <span style={{ width: '42px', textAlign: 'center' }}>L ({lengthUnit})</span>
                <span style={{ width: '4px' }}></span>
                <span style={{ width: '32px', textAlign: 'center' }}>Pcs</span>
              </div>
              <div style={{ width: '60px', textAlign: 'right', paddingRight: '0.2rem' }}>{outputUnit} / ₹</div>
              <div style={{ width: '46px', textAlign: 'center' }}>Rate</div>
              <div style={{ width: '22px', textAlign: 'center' }}>Del</div>
            </div>

            {items.map((item, index) => {
              const g = typeof item.girth === 'number' ? item.girth : 0;
              const l = typeof item.length === 'number' ? item.length : 0;
              const p = typeof item.pieces === 'number' ? item.pieces : 0;
              const isRowValid = g > 0 && l > 0 && p > 0;
              const rowRate = (item.rate as any) === '' ? '' : (typeof item.rate === 'number' && item.rate > 0 ? item.rate : defaultRate);
              const rowAmount = typeof item.amount === 'number' && item.amount > 0 ? item.amount : Math.round(item.volume * (Number(rowRate) || 0) * 100) / 100;

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
                  <div style={{ width: '42px', minWidth: '42px', overflow: 'hidden' }}>
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

                  {/* Measurements: Girth × Length × Pcs */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', flex: 1, justifyContent: 'center' }}>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="calc-input tally-cell-input"
                      value={item.girth}
                      onChange={(e) => handleUpdateItem(index, 'girth', e.target.value)}
                      style={{ width: '42px', padding: '0.25rem 0.04rem', textAlign: 'center', fontWeight: 800 }}
                    />
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>×</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="calc-input tally-cell-input"
                      value={item.length}
                      onChange={(e) => handleUpdateItem(index, 'length', e.target.value)}
                      style={{ width: '42px', padding: '0.25rem 0.04rem', textAlign: 'center', fontWeight: 800 }}
                    />
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>×</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      className="calc-input tally-cell-input"
                      value={item.pieces}
                      onChange={(e) => handleUpdateItem(index, 'pieces', e.target.value)}
                      style={{ width: '32px', padding: '0.25rem 0.04rem', textAlign: 'center', fontWeight: 800 }}
                    />
                  </div>

                  {/* Volume & Amount stacked */}
                  <div style={{ width: '60px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--primary-700)' }}>
                      {formatValue(item.volume, 3)} {outputUnit}
                    </span>
                    <strong
                      onClick={() => handleOpenPriceModal(index)}
                      style={{ fontSize: '0.74rem', fontWeight: 900, color: 'var(--primary-800)', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
                    >
                      ₹ {formatIndianCurrency(rowAmount)}
                    </strong>
                  </div>

                  {/* Rate Input */}
                  <div style={{ width: '46px', textAlign: 'center' }}>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="calc-input tally-cell-input"
                      value={item.rate}
                      onChange={(e) => handleUpdateItem(index, 'rate', e.target.value)}
                      style={{ width: '46px', padding: '0.25rem 0.04rem', textAlign: 'center', fontWeight: 800 }}
                    />
                  </div>

                  {/* Delete button */}
                  <div style={{ width: '22px', textAlign: 'center' }}>
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
                </div>
              );
            })}

            {/* Mobile Summary Box */}
            <div
              style={{
                marginTop: '0.4rem',
                backgroundColor: 'var(--primary-50, #f8f6f0)',
                border: '1.5px solid var(--primary-300)',
                borderRadius: '8px',
                padding: '0.45rem 0.65rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.35rem'
              }}
            >
              <span style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Total: {totals.totalPieces} Pcs
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary-800)', fontFamily: 'var(--font-mono)' }}>
                  {formatValue(totals.totalVolume, 3)} {outputUnit}
                </span>
                <strong style={{ fontSize: '0.84rem', fontWeight: 900, color: 'var(--primary-900)', fontFamily: 'var(--font-mono)' }}>
                  ₹ {formatIndianCurrency(totals.totalAmount || 0)}
                </strong>
              </div>
            </div>
          </>
        )}
      </div>

      <div ref={listBottomRef} />

      {/* Price / Rate Editing Modal */}
      {editPriceRowIndex !== null && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay"
          onClick={() => setEditPriceRowIndex(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(3px)'
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-card, #ffffff)',
              borderRadius: '12px',
              padding: '1.25rem',
              maxWidth: '360px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              border: '1px solid var(--border-medium)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Pencil size={15} color="var(--primary-600)" /> Edit Price &amp; Rate
              </h4>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditPriceRowIndex(null)}
                style={{ padding: '0.2rem' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  Rate per {outputUnit} (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  className="calc-input"
                  value={priceModalRate}
                  onChange={(e) => {
                    const r = e.target.value;
                    setPriceModalRate(r);
                    const parsedR = parseFloat(r) || 0;
                    const item = items[editPriceRowIndex];
                    if (item) {
                      setPriceModalAmount(String(Math.round(item.volume * parsedR * 100) / 100));
                    }
                  }}
                  style={{ width: '100%', fontSize: '1rem', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  Direct Total Amount (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  className="calc-input"
                  value={priceModalAmount}
                  onChange={(e) => {
                    const amt = e.target.value;
                    setPriceModalAmount(amt);
                    const parsedAmt = parseFloat(amt) || 0;
                    const item = items[editPriceRowIndex];
                    if (item && item.volume > 0) {
                      setPriceModalRate(String(Math.round((parsedAmt / item.volume) * 100) / 100));
                    }
                  }}
                  style={{ width: '100%', fontSize: '1rem', fontWeight: 700 }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditPriceRowIndex(null)}
                  style={{ flex: 1, padding: '0.45rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSavePriceModal}
                  style={{ flex: 1, padding: '0.45rem', fontWeight: 800 }}
                >
                  Save Price
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Unit Settings Modal */}
      {isUnitModalOpen && onOutputUnitChange && onInputUnitChange && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay"
          onClick={() => setIsUnitModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(3px)'
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-card, #ffffff)',
              borderRadius: '12px',
              padding: '1.25rem',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              border: '1px solid var(--border-medium)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Sliders size={16} color="var(--primary-600)" /> Round Log Units &amp; Formula
              </h4>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setIsUnitModalOpen(false)}
                style={{ padding: '0.2rem' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Output Unit */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.35rem', display: 'block' }}>
                  Output Volume Unit:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      onOutputUnitChange('CFT');
                      // Recalculate existing rows if any
                      if (items.length > 0) {
                        const updated = items.map(it => {
                          const calc = calculateRoundLogRow(it.girth, it.length, it.pieces, 'CFT', it.inputUnit || inputUnit);
                          const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRate;
                          return {
                            ...it,
                            outputUnit: 'CFT' as RoundLogOutputUnit,
                            volume: calc.volume,
                            amount: Math.round(calc.volume * r * 100) / 100
                          };
                        });
                        onChange(updated);
                      }
                    }}
                    className="btn"
                    style={{
                      padding: '0.45rem',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      backgroundColor: outputUnit === 'CFT' ? 'var(--primary-800)' : 'var(--bg-subtle)',
                      color: outputUnit === 'CFT' ? '#fff' : 'var(--text-main)',
                      borderColor: outputUnit === 'CFT' ? 'var(--primary-800)' : 'var(--border-medium)'
                    }}
                  >
                    CFT (Cubic Feet)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOutputUnitChange('CBM');
                      // Recalculate existing rows if any
                      if (items.length > 0) {
                        const updated = items.map(it => {
                          const calc = calculateRoundLogRow(it.girth, it.length, it.pieces, 'CBM', it.inputUnit || inputUnit);
                          const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRate;
                          return {
                            ...it,
                            outputUnit: 'CBM' as RoundLogOutputUnit,
                            volume: calc.volume,
                            amount: Math.round(calc.volume * r * 100) / 100
                          };
                        });
                        onChange(updated);
                      }
                    }}
                    className="btn"
                    style={{
                      padding: '0.45rem',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      backgroundColor: outputUnit === 'CBM' ? 'var(--primary-800)' : 'var(--bg-subtle)',
                      color: outputUnit === 'CBM' ? '#fff' : 'var(--text-main)',
                      borderColor: outputUnit === 'CBM' ? 'var(--primary-800)' : 'var(--border-medium)'
                    }}
                  >
                    CBM (Cubic Meters)
                  </button>
                </div>
              </div>

              {/* Input Units */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.35rem', display: 'block' }}>
                  Input Units (Girth × Length):
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {ROUND_LOG_INPUT_UNIT_OPTIONS.map((opt) => {
                    const isSelected = inputUnit === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => {
                          onInputUnitChange(opt.id);
                          if (items.length > 0) {
                            const updated = items.map(it => {
                              const calc = calculateRoundLogRow(it.girth, it.length, it.pieces, outputUnit, opt.id);
                              const r = typeof it.rate === 'number' && it.rate > 0 ? it.rate : defaultRate;
                              return {
                                ...it,
                                inputUnit: opt.id,
                                volume: calc.volume,
                                amount: Math.round(calc.volume * r * 100) / 100
                              };
                            });
                            onChange(updated);
                          }
                        }}
                        style={{
                          padding: '0.5rem 0.65rem',
                          borderRadius: '6px',
                          border: `1.5px solid ${isSelected ? 'var(--primary-700)' : 'var(--border-medium)'}`,
                          backgroundColor: isSelected ? 'var(--primary-50, #f8f6f0)' : 'var(--bg-card)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.82rem', color: isSelected ? 'var(--primary-900)' : 'var(--text-main)' }}>
                            {opt.label}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {outputUnit === 'CFT' ? opt.formulaDisplayCFT : opt.formulaDisplayCBM}
                          </div>
                        </div>
                        <input
                          type="radio"
                          name="round_unit_modal"
                          checked={isSelected}
                          onChange={() => {}}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsUnitModalOpen(false)}
                style={{ width: '100%', padding: '0.55rem', fontWeight: 800 }}
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
