import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Copy, AlertCircle, CornerDownLeft, Sliders } from 'lucide-react';
import type { RoundLogItem, RoundLogOutputUnit, RoundLogInputUnitType } from '../types';
import {
  calculateRoundLogTotals,
  getRoundLogUnitConfig,
  computeRoundLogDimensions,
  ROUND_LOG_INPUT_UNIT_OPTIONS
} from '../utils/roundLogCalculator';
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
  customerName,
  onNewSheet
}) => {
  const unitConfig = getRoundLogUnitConfig(inputUnit);
  const { girthUnit, lengthUnit } = unitConfig;
  const isFtIn = inputUnit === 'girth_ft_length_ft';

  // Quick Add Input State - ONLY measurements (PCS removed as each log is 1 piece)
  const [quickGirth, setQuickGirth] = useState<string>(''); // G (FT) or G (IN/M/CM)
  const [quickGirthInPart, setQuickGirthInPart] = useState<string>(''); // G (IN) when ft+in
  const [quickLength, setQuickLength] = useState<string>('');

  // Unit switcher modal
  const [isUnitModalOpen, setIsUnitModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isUnitModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isUnitModalOpen]);

  const [selectedWoodOption, setSelectedWoodOption] = useState<string>('Mahagony');
  const [customWoodType, setCustomWoodType] = useState<string>('');
  const [quickError, setQuickError] = useState<string | null>(null);

  const girthInputRef = useRef<HTMLInputElement>(null);
  const girthInPartInputRef = useRef<HTMLInputElement>(null);
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

  // Live calculation for quick entry preview (Always 1 log / PCS = 1)
  const gVal = parseFloat(quickGirth) || 0;
  const gInPVal = isFtIn ? parseFloat(quickGirthInPart) || 0 : 0;
  const lVal = parseFloat(quickLength) || 0;
  const liveCalc = computeRoundLogDimensions({
    girth: gVal,
    girthInPart: gInPVal,
    length: lVal,
    pieces: 1, // Every single log entry is 1 piece
    inputUnit,
    outputUnit
  });

  // Real-time table totals
  const totals = calculateRoundLogTotals(items, outputUnit);

  // In-place row field updates
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

      // Recalculate dimensions & slab
      const g = typeof target.girth === 'number' ? target.girth : 0;
      const gInP = typeof target.girthInPart === 'number' ? target.girthInPart : 0;
      const l = typeof target.length === 'number' ? target.length : 0;
      const p = 1; // Always 1 log per row

      const comp = computeRoundLogDimensions({
        girth: g,
        girthInPart: gInP,
        length: l,
        pieces: p,
        inputUnit: target.inputUnit || inputUnit,
        outputUnit: target.outputUnit || outputUnit
      });

      target.volume = comp.volume;
      target.cft = comp.cft;
      target.cbm = comp.cbm;
      target.girthInches = comp.girthInches;
      target.girthFtInStr = comp.girthFtInStr;
      target.slabId = comp.slab.id;
      target.slabLabel = comp.slab.label;
      target.pieces = 1;

      const rowRate = typeof target.rate === 'number' && target.rate > 0 ? target.rate : 0;
      target.amount = rowRate > 0 ? Math.round(comp.volume * rowRate * 100) / 100 : 0;
    }

    updated[index] = target;
    onChange(updated);
  };

  // Duplicate an existing row - ALWAYS appends as separate independent log with sequential serial number
  const handleDuplicateRow = (index: number) => {
    const source = items[index];
    const duplicate: RoundLogItem = {
      ...source,
      id: generateId(),
      serialNumber: items.length + 1,
      pieces: 1
    };

    const updated = [...items, duplicate];
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

  const advanceFrom = (source: 'girth' | 'girthInPart' | 'length') => {
    if (source === 'length') {
      // Last field reached: immediately add row on enter!
      handleQuickAdd();
      return;
    }

    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 280);

    if (source === 'girth') {
      if (isFtIn) {
        girthInPartInputRef.current?.focus();
      } else {
        lengthInputRef.current?.focus();
      }
    } else if (source === 'girthInPart') {
      lengthInputRef.current?.focus();
    }
  };

  const handleKeyNav = (
    e: React.KeyboardEvent,
    source: 'girth' | 'girthInPart' | 'length'
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

    const active = document.activeElement;
    if (active === girthInputRef.current) {
      advanceFrom('girth');
      return;
    }
    if (active === girthInPartInputRef.current) {
      advanceFrom('girthInPart');
      return;
    }
    if (active === lengthInputRef.current) {
      handleQuickAdd();
    }
  };

  // Add row via Quick-Add Bar (Always 1 log, NEVER merge duplicate measurements)
  const handleQuickAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setQuickError(null);

    const gFt = parseFloat(quickGirth);
    const gInPart = isFtIn ? (parseFloat(quickGirthInPart) || 0) : 0;
    const l = parseFloat(quickLength);
    const p = 1; // Every round log entry represents 1 log

    if (isNaN(gFt) || (gFt <= 0 && gInPart <= 0)) {
      setQuickError(`Girth must be greater than 0 ${girthUnit}`);
      girthInputRef.current?.focus();
      return;
    }
    if (isNaN(l) || l <= 0) {
      setQuickError(`Length must be greater than 0 ${lengthUnit}`);
      lengthInputRef.current?.focus();
      return;
    }

    const comp = computeRoundLogDimensions({
      girth: gFt,
      girthInPart: gInPart,
      length: l,
      pieces: p,
      inputUnit,
      outputUnit
    });

    const finalWood = selectedWoodOption === 'Other (Custom...)'
      ? (customWoodType.trim() || 'Custom Wood')
      : selectedWoodOption;

    const newItem: RoundLogItem = {
      id: generateId(),
      serialNumber: items.length + 1,
      woodType: finalWood,
      girth: gFt,
      girthFt: isFtIn ? gFt : undefined,
      girthInPart: isFtIn ? gInPart : undefined,
      girthInches: comp.girthInches,
      girthFtInStr: comp.girthFtInStr,
      length: l,
      pieces: 1, // Treat every added log as exactly 1 log
      volume: comp.volume,
      cft: comp.cft,
      cbm: comp.cbm,
      slabId: comp.slab.id,
      slabLabel: comp.slab.label,
      outputUnit,
      inputUnit,
      rate: 0,
      amount: 0
    };

    // NEVER MERGE DUPLICATES: Always append every submission as a separate, independent log row
    const updated = [...items, newItem];
    const reindexed = updated.map((it, idx) => ({ ...it, serialNumber: idx + 1 }));
    onChange(reindexed);

    // Reset inputs
    setQuickGirth('');
    setQuickGirthInPart('');
    setQuickLength('');

    // Scroll to view
    setTimeout(() => {
      listBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);

    // Keep focus on first input
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
              TOTAL: {formatValue(totals.totalVolume, 4)} {outputUnit} &bull; {totals.totalPieces} Logs
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

      {/* 1. Quick Dimension Entry Form / Calcy (ONLY MEASUREMENTS, NO PCS FIELD) */}
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

          <div
            className="quick-add-dims"
            style={{
              display: 'grid',
              gridTemplateColumns: isFtIn ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
              gap: '0.45rem'
            }}
          >
            {/* Girth Input (Feet or standard unit) */}
            <div className="quick-dim-col">
              <label className="quick-dim-label">
                <span className="dim-label-desktop">{isFtIn ? 'Girth (FT)' : `Girth (${girthUnit})`}</span>
                <span className="dim-label-mobile">{isFtIn ? 'G (FT)' : `G (${girthUnit})`}</span>
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

            {/* Optional Girth Remaining Inches (only when Girth in ft x Length in ft) */}
            {isFtIn && (
              <div className="quick-dim-col">
                <label className="quick-dim-label">
                  <span className="dim-label-desktop">Girth (IN)</span>
                  <span className="dim-label-mobile">G (IN)</span>
                </label>
                <input
                  ref={girthInPartInputRef}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  max="11.99"
                  placeholder=""
                  className="calc-input"
                  value={quickGirthInPart}
                  onChange={(e) => setQuickGirthInPart(e.target.value)}
                  onKeyDown={(e) => handleKeyNav(e, 'girthInPart')}
                  enterKeyHint="next"
                  tabIndex={2}
                />
              </div>
            )}

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
                enterKeyHint="go"
                tabIndex={isFtIn ? 3 : 2}
              />
            </div>
          </div>

          {/* Quick-Add Controls (Wood Selector & Add Button) */}
          <div className="quick-add-controls" style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem' }}>
            <div className="quick-wood-selector-wrapper" style={{ flex: 1.4 }}>
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
                  style={{ marginTop: '0.25rem' }}
                />
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary quick-add-submit-btn"
              onClick={() => handleQuickAdd()}
              style={{ flex: 1 }}
            >
              <Plus size={16} />
              <span>Add Row</span>
            </button>
          </div>

          {/* Live Preview Chip (Shows volume for 1 log, no price) */}
          {liveCalc.volume > 0 && (
            <div className="quick-live-preview-chip" style={{ marginTop: '0.3rem' }}>
              <span>{formatValue(liveCalc.volume, 4)} {outputUnit}</span>
              <span className="sep">&bull;</span>
              <span>1 Log</span>
              {liveCalc.slab && (
                <>
                  <span className="sep">&bull;</span>
                  <span style={{ fontWeight: 800, color: 'var(--primary-800)' }}>Slab: {liveCalc.slab.label}</span>
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
                <th style={{ width: '45px', textAlign: 'center', padding: '0.35rem 0.15rem' }}>Log No.</th>
                <th style={{ minWidth: '110px' }}>Wood Species</th>
                <th style={{ textAlign: 'center', width: '75px', padding: '0.35rem 0.05rem' }}>
                  Length ({lengthUnit})
                </th>
                <th style={{ textAlign: 'center', width: '80px', padding: '0.35rem 0.05rem' }}>
                  Girth (ft | in)
                </th>
                <th style={{ textAlign: 'center', width: '70px', padding: '0.35rem 0.05rem' }}>
                  Girth (inch)
                </th>
                <th style={{ textAlign: 'center', width: '40px', padding: '0.35rem 0.05rem' }}>
                  PCS
                </th>
                <th style={{ textAlign: 'right', padding: '0.35rem 0.25rem', width: '80px' }}>
                  CFT
                </th>
                <th style={{ textAlign: 'right', padding: '0.35rem 0.25rem', width: '80px' }}>
                  CBM
                </th>
                <th style={{ textAlign: 'center', width: '80px', padding: '0.35rem 0.05rem' }}>
                  Slab
                </th>
                <th style={{ width: '45px', textAlign: 'center', padding: '0.35rem 0.05rem' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                        No round log measurements entered yet
                      </p>
                      <p style={{ fontSize: '0.78rem', margin: 0, maxWidth: '380px' }}>
                        Enter Girth &amp; Length above &amp; click <strong>+ Add Row</strong>.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const g = typeof item.girth === 'number' ? item.girth : 0;
                  const l = typeof item.length === 'number' ? item.length : 0;
                  const isRowValid = g > 0 && l > 0;

                  return (
                    <tr key={item.id} style={{ opacity: isRowValid ? 1 : 0.85 }}>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--primary-700)', padding: '0.25rem 0.1rem' }}>
                        Log {item.serialNumber}
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
                            minWidth: '95px'
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
                          value={item.length}
                          onChange={(e) => handleUpdateItem(index, 'length', e.target.value)}
                          style={{ width: '55px', textAlign: 'center', fontWeight: 800 }}
                        />
                      </td>

                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--text-main)', fontSize: '0.82rem' }}>
                        {item.girthFtInStr || (item.girthFt !== undefined ? `${item.girthFt}' ${item.girthInPart || 0}"` : `${g}"`)}
                      </td>

                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {item.girthInches !== undefined ? `${formatValue(item.girthInches, 1)}"` : `${g}"`}
                      </td>

                      <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--text-main)', padding: '0.2rem 0.05rem' }}>
                        1
                      </td>

                      <td className="col-numeric" style={{ textAlign: 'right', padding: '0.25rem 0.25rem', whiteSpace: 'nowrap', fontWeight: 700, fontSize: '0.84rem' }}>
                        {formatValue(item.cft !== undefined ? item.cft : (outputUnit === 'CFT' ? item.volume : item.volume * 35.3147), 4)}
                      </td>

                      <td className="col-numeric" style={{ textAlign: 'right', padding: '0.25rem 0.25rem', whiteSpace: 'nowrap', fontWeight: 700, fontSize: '0.84rem' }}>
                        {formatValue(item.cbm !== undefined ? item.cbm : (outputUnit === 'CBM' ? item.volume : item.volume / 35.3147), 4)}
                      </td>

                      <td style={{ textAlign: 'center', padding: '0.25rem 0.15rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.35rem', borderRadius: '4px', backgroundColor: 'var(--primary-100)', color: 'var(--primary-800)' }}>
                          {item.slabLabel || 'Upto 23"'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'center', padding: '0.2rem 0.05rem', width: '45px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Duplicate as new separate log row"
                            onClick={() => handleDuplicateRow(index)}
                            style={{ padding: '3px' }}
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Delete log"
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
                  <td colSpan={5} style={{ textAlign: 'right', padding: '0.5rem 0.5rem', color: 'var(--text-main)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                    Total Round Logs:
                  </td>
                  <td style={{ textAlign: 'center', padding: '0.35rem 0.05rem', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.84rem' }}>
                    {totals.totalPieces} Logs
                  </td>
                  <td className="col-numeric" style={{ textAlign: 'right', padding: '0.35rem 0.25rem', whiteSpace: 'nowrap', fontWeight: 800, fontSize: '0.86rem' }}>
                    {formatValue(totals.totalCft || 0, 4)} CFT
                  </td>
                  <td className="col-numeric" style={{ textAlign: 'right', padding: '0.35rem 0.25rem', whiteSpace: 'nowrap', fontWeight: 800, fontSize: '0.86rem' }}>
                    {formatValue(totals.totalCbm || 0, 4)} CBM
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 2. Mobile View: Compact list (Each row is 1 separate log) */}
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
              Enter Girth &amp; Length below &amp; click <strong>+ Add Row</strong>.
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
              <div style={{ width: '65px', textAlign: 'left' }}>Log / Tree</div>
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                <span>Girth × Length</span>
              </div>
              <div style={{ width: '65px', textAlign: 'right', paddingRight: '0.2rem' }}>{outputUnit}</div>
              <div style={{ width: '42px', textAlign: 'center' }}>Act</div>
            </div>

            {items.map((item, index) => {
              const g = typeof item.girth === 'number' ? item.girth : 0;
              const l = typeof item.length === 'number' ? item.length : 0;
              const isRowValid = g > 0 && l > 0;

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.75)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                    padding: '0.3rem 0.35rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.2rem',
                    opacity: isRowValid ? 1 : 0.85
                  }}
                >
                  {/* Log No, Tree Name & Slab */}
                  <div style={{ width: '65px', minWidth: '65px', overflow: 'hidden' }}>
                    <span style={{ fontSize: '0.66rem', fontWeight: 900, color: 'var(--primary-700)', display: 'block' }}>
                      Log {item.serialNumber}
                    </span>
                    <span
                      title={item.woodType || 'Wood'}
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: 'var(--text-main)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'block'
                      }}
                    >
                      {item.woodType || 'Wood'}
                    </span>
                    <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block' }}>
                      {item.slabLabel || 'Slab'}
                    </span>
                  </div>

                  {/* Measurements: Girth (ft|in) × Length */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flex: 1, justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-main)', textAlign: 'center' }}>
                      {item.girthFtInStr || `${item.girth}"`}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>×</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="calc-input tally-cell-input"
                      value={item.length}
                      onChange={(e) => handleUpdateItem(index, 'length', e.target.value)}
                      style={{ width: '48px', padding: '0.25rem 0.04rem', textAlign: 'center', fontWeight: 800 }}
                    />
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{lengthUnit}</span>
                  </div>

                  {/* Volume */}
                  <div style={{ width: '65px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--primary-700)', fontFamily: 'var(--font-mono)' }}>
                      {formatValue(item.volume, 4)} {outputUnit}
                    </span>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                      {outputUnit === 'CFT' ? `${formatValue(item.cbm || 0, 3)} CBM` : `${formatValue(item.cft || 0, 3)} CFT`}
                    </span>
                  </div>

                  {/* Duplicate & Delete buttons */}
                  <div style={{ width: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="Duplicate as new separate log row"
                      onClick={() => handleDuplicateRow(index)}
                      style={{ padding: '2px' }}
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="Delete log"
                      onClick={() => handleDeleteRow(index)}
                      style={{
                        padding: 0,
                        color: 'var(--danger-500, #dc2626)',
                        minWidth: 0,
                        width: '18px',
                        height: '18px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Trash2 size={12} />
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
                Total: {totals.totalPieces} Logs
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--primary-800)', fontFamily: 'var(--font-mono)' }}>
                  {formatValue(totals.totalVolume, 4)} {outputUnit}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div ref={listBottomRef} />

      {/* Unit Change Modal */}
      {isUnitModalOpen && typeof document !== 'undefined' && createPortal(
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
              maxWidth: '380px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              border: '1px solid var(--border-medium)'
            }}
          >
            <h4 style={{ margin: '0 0 0.85rem', fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Configure Round Log Units
            </h4>

            {/* Output Unit Selection */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                Output Unit (Billing &amp; Tally):
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => onOutputUnitChange && onOutputUnitChange('CFT')}
                  style={{
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: outputUnit === 'CFT' ? '2px solid var(--primary-700)' : '1px solid var(--border-medium)',
                    backgroundColor: outputUnit === 'CFT' ? 'var(--primary-100)' : 'var(--bg-subtle)',
                    color: outputUnit === 'CFT' ? 'var(--primary-900)' : 'var(--text-main)',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  CFT (Cubic Feet)
                </button>
                <button
                  type="button"
                  onClick={() => onOutputUnitChange && onOutputUnitChange('CBM')}
                  style={{
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: outputUnit === 'CBM' ? '2px solid var(--primary-700)' : '1px solid var(--border-medium)',
                    backgroundColor: outputUnit === 'CBM' ? 'var(--primary-100)' : 'var(--bg-subtle)',
                    color: outputUnit === 'CBM' ? 'var(--primary-900)' : 'var(--text-main)',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  CBM (Cubic Meters)
                </button>
              </div>
            </div>

            {/* Input Unit Selection */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                Input Dimensions Unit:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {ROUND_LOG_INPUT_UNIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onInputUnitChange && onInputUnitChange(opt.id)}
                    style={{
                      padding: '0.45rem 0.65rem',
                      borderRadius: '8px',
                      border: inputUnit === opt.id ? '2px solid var(--primary-700)' : '1px solid var(--border-medium)',
                      backgroundColor: inputUnit === opt.id ? 'var(--primary-100)' : 'var(--bg-subtle)',
                      color: inputUnit === opt.id ? 'var(--primary-900)' : 'var(--text-main)',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsUnitModalOpen(false)}
                style={{ width: '100%' }}
              >
                Apply &amp; Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
