import { getSupabase, getSupabaseCredentials } from '../lib/supabase';
import type { MeasurementItem, MeasurementSheet } from '../types';
import { calculateRow, calculateTotals } from '../utils/calculator';

const LOCAL_SHEETS_KEY = 'timberpro_local_sheets';
const ACTIVE_DRAFT_KEY = 'timberpro_active_draft';

// Helper to generate IDs
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

/**
 * Normalizes and recalculates all items and totals on a sheet before persisting
 */
export function sanitizeAndComputeSheet(
  sheet: Partial<MeasurementSheet>,
  userId: string
): MeasurementSheet {
  const items: MeasurementItem[] = (sheet.items || []).map((item, index) => {
    const l = typeof item.lengthFeet === 'number' ? item.lengthFeet : '';
    const w = typeof item.widthInches === 'number' ? item.widthInches : '';
    const t = typeof item.thicknessInches === 'number' ? item.thicknessInches : '';
    const p = typeof item.pieces === 'number' ? item.pieces : '';

    const calc = calculateRow(l, w, t, p);

    const isSqftBilled = typeof w === 'number' && w >= 7 && item.rateUnit !== 'CFT';
    const rateUnit: 'CFT' | 'SQFT' = isSqftBilled ? 'SQFT' : 'CFT';
    const r = typeof item.rate === 'number' ? item.rate : (typeof item.rate === 'string' && item.rate !== '' ? parseFloat(item.rate) : '');
    const defaultRowRate = isSqftBilled ? 120 : 1200;
    const rateNum = typeof r === 'number' && !isNaN(r) && r > 0 ? r : defaultRowRate;
    const multiplier = isSqftBilled ? calc.sqft : calc.cft;
    const amount = typeof item.amount === 'number' && item.amount > 0 ? item.amount : Math.round(multiplier * rateNum * 100) / 100;

    return {
      id: item.id || generateId(),
      serialNumber: index + 1,
      lengthFeet: l,
      widthInches: w,
      thicknessInches: t,
      pieces: p,
      cft: calc.cft,
      sqft: calc.sqft,
      rate: rateNum,
      rateUnit,
      amount,
      woodType: item.woodType || '',
      remarks: item.remarks || ''
    };
  });

  const totals = calculateTotals(items);
  const now = new Date().toISOString();

  return {
    id: sheet.id || generateId(),
    userId,
    sheetName: sheet.sheetName?.trim() || 'Untitled Measurement Sheet',
    customerType: sheet.customerType || 'b2c',
    customerName: sheet.customerName?.trim() || '',
    customerPhone: sheet.customerPhone?.trim() || '',
    customerAddress: sheet.customerAddress?.trim() || '',
    customerGstin: sheet.customerGstin?.trim() || '',
    customerState: sheet.customerState?.trim() || '',
    customerStateCode: sheet.customerStateCode?.trim() || '',
    projectName: sheet.projectName?.trim() || '',
    referenceNumber: sheet.referenceNumber?.trim() || `REF-${Date.now().toString().slice(-6)}`,
    measurementDate: sheet.measurementDate || new Date().toISOString().split('T')[0],
    notes: sheet.notes || '',
    items,
    additionalCharges: sheet.additionalCharges,
    discount: sheet.discount,
    customGstTaxableAmount: sheet.customGstTaxableAmount,
    gstPercent: sheet.gstPercent,
    isConfirmed: Boolean(sheet.isConfirmed),
    finalGrandTotal: sheet.finalGrandTotal,
    totalEntries: totals.totalEntries,
    totalPieces: totals.totalPieces,
    totalCft: totals.totalCft,
    totalSqft: totals.totalSqft,
    createdAt: sheet.createdAt || now,
    updatedAt: now
  };
}

/**
 * Local Storage database fallback implementation
 */
const localDb = {
  getSheets(userId: string, role?: string): MeasurementSheet[] {
    try {
      const data = localStorage.getItem(LOCAL_SHEETS_KEY);
      if (!data) return [];
      let sheets: MeasurementSheet[] = JSON.parse(data);

      // Automatically prune abandoned ghost sheets with 0 timber entries/pieces/cft
      const validSheets = sheets.filter((s) => {
        const hasItems = Array.isArray(s.items) && s.items.length > 0;
        const hasPieces = typeof s.totalPieces === 'number' && s.totalPieces > 0;
        const hasCft = typeof s.totalCft === 'number' && s.totalCft > 0;
        return hasItems || hasPieces || hasCft;
      });

      if (validSheets.length !== sheets.length) {
        localStorage.setItem(LOCAL_SHEETS_KEY, JSON.stringify(validSheets));
        sheets = validSheets;
      }

      // Admin/manager can view all; normal user views only their own
      if (role === 'admin' || role === 'manager') {
        return sheets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      }
      return sheets
        .filter((s) => s.userId === userId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (e) {
      console.error('Error reading local sheets:', e);
      return [];
    }
  },

  getSheetById(sheetId: string, _userId?: string, _role?: string): MeasurementSheet | null {
    const raw = this.getAllRawSheets();
    const found = raw.find((s) => s.id === sheetId);
    if (found) return found;
    return null;
  },

  saveSheet(sheet: MeasurementSheet): void {
    const sheets = this.getAllRawSheets();
    const existingIndex = sheets.findIndex((s) => s.id === sheet.id);
    if (existingIndex >= 0) {
      sheets[existingIndex] = sheet;
    } else {
      sheets.unshift(sheet);
    }
    localStorage.setItem(LOCAL_SHEETS_KEY, JSON.stringify(sheets));
  },

  deleteSheet(sheetId: string): boolean {
    const sheets = this.getAllRawSheets();
    const filtered = sheets.filter((s) => s.id !== sheetId);
    localStorage.setItem(LOCAL_SHEETS_KEY, JSON.stringify(filtered));
    return true;
  },

  getAllRawSheets(): MeasurementSheet[] {
    try {
      const data = localStorage.getItem(LOCAL_SHEETS_KEY);
      if (!data) return [];
      const sheets: MeasurementSheet[] = JSON.parse(data);
      return sheets.filter((s) => {
        const hasItems = Array.isArray(s.items) && s.items.length > 0;
        const hasPieces = typeof s.totalPieces === 'number' && s.totalPieces > 0;
        const hasCft = typeof s.totalCft === 'number' && s.totalCft > 0;
        return hasItems || hasPieces || hasCft;
      });
    } catch {
      return [];
    }
  }
};

/**
 * Unified Database Service API
 */
export const dbService = {
  /**
   * Fetches all measurement sheets for current user
   */
  async getSheets(userId: string, role?: string): Promise<MeasurementSheet[]> {
    const { isConfigured } = getSupabaseCredentials();
    const supabase = getSupabase();

    if (!isConfigured || !supabase) {
      return localDb.getSheets(userId, role);
    }

    try {
      let query = supabase
        .from('measurement_sheets')
        .select('*')
        .order('updated_at', { ascending: false });

      if (role !== 'admin' && role !== 'manager') {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Supabase getSheets error:', error);
        return localDb.getSheets(userId, role);
      }

      return (data || [])
        .map((row) => {
          let isConfirmed = Boolean(row.is_confirmed);
          let cleanNotes = row.notes || '';
          if (cleanNotes.startsWith('__TIMBER_META__')) {
            try {
              const meta = JSON.parse(cleanNotes.replace('__TIMBER_META__', ''));
              if (meta.isConfirmed !== undefined) isConfirmed = Boolean(meta.isConfirmed);
              cleanNotes = meta.rawNotes || '';
            } catch {}
          }
          return {
            id: row.id,
            userId: row.user_id,
            sheetName: row.sheet_name,
            customerName: row.customer_name || '',
            projectName: row.project_name || '',
            referenceNumber: row.reference_number || '',
            measurementDate: row.measurement_date,
            notes: cleanNotes,
            items: [],
            isConfirmed,
            totalEntries: row.total_entries || 0,
            totalPieces: Number(row.total_pieces) || 0,
            totalCft: Number(row.total_cft) || 0,
            totalSqft: Number(row.total_sqft) || 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          };
        })
        .filter((s) => s.totalEntries > 0 || s.totalPieces > 0 || s.totalCft > 0);
    } catch (err) {
      console.error('Error fetching sheets:', err);
      return localDb.getSheets(userId, role);
    }
  },

  /**
   * Fetches a specific measurement sheet along with all of its measurement items
   */
  async getSheetById(
    sheetId: string,
    userId: string,
    role?: string
  ): Promise<MeasurementSheet | null> {
    const { isConfigured } = getSupabaseCredentials();
    const supabase = getSupabase();

    if (!isConfigured || !supabase) {
      return localDb.getSheetById(sheetId, userId, role);
    }

    try {
      let sheetQuery = supabase
        .from('measurement_sheets')
        .select('*')
        .eq('id', sheetId);

      if (role !== 'admin' && role !== 'manager') {
        sheetQuery = sheetQuery.eq('user_id', userId);
      }

      const { data: sheetData, error: sheetError } = await sheetQuery.single();

      if (sheetError || !sheetData) {
        console.error('Supabase fetch sheet error:', sheetError);
        return localDb.getSheetById(sheetId, userId, role);
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from('measurement_items')
        .select('*')
        .eq('sheet_id', sheetId)
        .order('serial_number', { ascending: true });

      if (itemsError) {
        console.error('Supabase fetch items error:', itemsError);
      }

      const items: MeasurementItem[] = (itemsData || []).map((it) => ({
        id: it.id,
        serialNumber: it.serial_number,
        lengthFeet: Number(it.length_feet),
        widthInches: Number(it.width_inches),
        thicknessInches: Number(it.thickness_inches),
        pieces: Number(it.number_of_pieces),
        cft: Number(it.cft),
        sqft: Number(it.sqft),
        woodType: it.wood_type || '',
        remarks: it.remarks || ''
      }));

      // Parse metadata envelope from notes if present
      let parsedMeta: any = null;
      let cleanNotes = sheetData.notes || '';
      if (cleanNotes.startsWith('__TIMBER_META__')) {
        try {
          parsedMeta = JSON.parse(cleanNotes.replace('__TIMBER_META__', ''));
          cleanNotes = parsedMeta.rawNotes || '';
        } catch {}
      }

      const localSheet = localDb.getSheetById(sheetId, userId, role);

      const finalItems = items.length > 0
        ? items
        : (localSheet?.items && localSheet.items.length > 0
            ? localSheet.items
            : (parsedMeta?.backupItems || []));

      return {
        id: sheetData.id,
        userId: sheetData.user_id,
        sheetName: sheetData.sheet_name,
        customerType: parsedMeta?.customerType || localSheet?.customerType || 'b2c',
        customerName: sheetData.customer_name || localSheet?.customerName || '',
        customerPhone: parsedMeta?.customerPhone || localSheet?.customerPhone || '',
        customerAddress: parsedMeta?.customerAddress || localSheet?.customerAddress || '',
        customerGstin: parsedMeta?.customerGstin || localSheet?.customerGstin || '',
        customerState: parsedMeta?.customerState || localSheet?.customerState || 'Karnataka',
        customerStateCode: parsedMeta?.customerStateCode || localSheet?.customerStateCode || '29',
        projectName: sheetData.project_name || localSheet?.projectName || '',
        referenceNumber: sheetData.reference_number || localSheet?.referenceNumber || '',
        measurementDate: sheetData.measurement_date,
        notes: cleanNotes,
        items: finalItems,
        additionalCharges: parsedMeta?.additionalCharges || localSheet?.additionalCharges,
        discount: parsedMeta?.discount || localSheet?.discount,
        customGstTaxableAmount: parsedMeta?.customGstTaxableAmount !== undefined ? parsedMeta.customGstTaxableAmount : localSheet?.customGstTaxableAmount,
        gstPercent: parsedMeta?.gstPercent !== undefined ? parsedMeta.gstPercent : localSheet?.gstPercent,
        isConfirmed: parsedMeta?.isConfirmed !== undefined ? Boolean(parsedMeta.isConfirmed) : (localSheet?.isConfirmed ?? Boolean(sheetData.is_confirmed) ?? false),
        finalGrandTotal: parsedMeta?.finalGrandTotal || localSheet?.finalGrandTotal,
        totalEntries: sheetData.total_entries || finalItems.length,
        totalPieces: Number(sheetData.total_pieces) || localSheet?.totalPieces || 0,
        totalCft: Number(sheetData.total_cft) || localSheet?.totalCft || 0,
        totalSqft: Number(sheetData.total_sqft) || localSheet?.totalSqft || 0,
        createdAt: sheetData.created_at,
        updatedAt: sheetData.updated_at
      };
    } catch (err) {
      console.error('Error fetching sheet by ID:', err);
      return localDb.getSheetById(sheetId, userId, role);
    }
  },

  /**
   * Saves or updates a measurement sheet and all associated items
   */
  async saveSheet(
    sheetData: Partial<MeasurementSheet>,
    userId: string
  ): Promise<{ sheet: MeasurementSheet; error?: string }> {
    const sanitized = sanitizeAndComputeSheet(sheetData, userId);
    const { isConfigured } = getSupabaseCredentials();
    const supabase = getSupabase();

    // Always mirror to local storage as safety backup
    localDb.saveSheet(sanitized);

    if (!isConfigured || !supabase) {
      return { sheet: sanitized };
    }

    try {
      // Format valid UUID or null for open public entries
      const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      const dbUserId = isValidUuid ? userId : null;

      // Encode full metadata envelope into notes for 100% cloud schema compatibility
      const metaPayload = {
        customerType: sanitized.customerType,
        customerPhone: sanitized.customerPhone,
        customerAddress: sanitized.customerAddress,
        customerGstin: sanitized.customerGstin,
        customerState: sanitized.customerState,
        customerStateCode: sanitized.customerStateCode,
        additionalCharges: sanitized.additionalCharges,
        discount: sanitized.discount,
        customGstTaxableAmount: sanitized.customGstTaxableAmount,
        gstPercent: sanitized.gstPercent,
        isConfirmed: Boolean(sanitized.isConfirmed),
        finalGrandTotal: sanitized.finalGrandTotal,
        rawNotes: sanitized.notes || '',
        backupItems: sanitized.items
      };
      const encodedNotes = `__TIMBER_META__${JSON.stringify(metaPayload)}`;

      // 1. Upsert Sheet Record
      const { error: sheetUpsertError } = await supabase
        .from('measurement_sheets')
        .upsert(
          {
            id: sanitized.id,
            user_id: dbUserId,
            sheet_name: sanitized.sheetName,
            customer_name: sanitized.customerName,
            project_name: sanitized.projectName,
            reference_number: sanitized.referenceNumber,
            measurement_date: sanitized.measurementDate,
            notes: encodedNotes,
            total_entries: sanitized.totalEntries,
            total_pieces: sanitized.totalPieces,
            total_cft: sanitized.totalCft,
            total_sqft: sanitized.totalSqft,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'id' }
        );

      if (sheetUpsertError) {
        console.error('Supabase sheet upsert notice:', sheetUpsertError);
        if (sheetUpsertError.code === '42501' || sheetUpsertError.message.includes('row-level security policy')) {
          return {
            sheet: sanitized,
            error: 'Saved locally to this device! (Supabase Cloud sync requires running the 10-second open-access SQL script in your Supabase SQL editor).'
          };
        }
        return { sheet: sanitized, error: sheetUpsertError.message };
      }

      // 2. Delete existing items for this sheet to replace cleanly
      await supabase.from('measurement_items').delete().eq('sheet_id', sanitized.id);

      // 3. Insert items if any exist
      if (sanitized.items.length > 0) {
        const rowsToInsert = sanitized.items
          .filter((it) => typeof it.lengthFeet === 'number' && it.lengthFeet > 0)
          .map((it, idx) => ({
            id: it.id || generateId(),
            sheet_id: sanitized.id,
            user_id: dbUserId,
            serial_number: idx + 1,
            length_feet: it.lengthFeet,
            width_inches: it.widthInches,
            thickness_inches: it.thicknessInches,
            number_of_pieces: it.pieces,
            cft: it.cft,
            sqft: it.sqft,
            wood_type: it.woodType || '',
            remarks: it.remarks || ''
          }));

        if (rowsToInsert.length > 0) {
          const { error: itemsInsertError } = await supabase
            .from('measurement_items')
            .insert(rowsToInsert);

          if (itemsInsertError) {
            console.error('Supabase items insert failed:', itemsInsertError);
            return { sheet: sanitized, error: itemsInsertError.message };
          }
        }
      }

      return { sheet: sanitized };
    } catch (err: any) {
      console.error('Error saving sheet to Supabase:', err);
      return { sheet: sanitized, error: err.message || 'Database error occurred' };
    }
  },

  /**
   * Deletes a measurement sheet and all its items
   */
  async deleteSheet(sheetId: string, _userId?: string): Promise<boolean> {
    const { isConfigured } = getSupabaseCredentials();
    const supabase = getSupabase();

    // 1. Immediately delete from local storage
    localDb.deleteSheet(sheetId);

    // 2. Clear draft if active
    try {
      const activeDraft = this.loadDraft();
      if (activeDraft && activeDraft.id === sheetId) {
        this.clearDraft();
      }
    } catch {}

    // 3. Supabase deletion
    if (isConfigured && supabase) {
      try {
        // Delete child items first to prevent foreign key errors
        await supabase
          .from('measurement_items')
          .delete()
          .eq('sheet_id', sheetId);

        const { error } = await supabase
          .from('measurement_sheets')
          .delete()
          .eq('id', sheetId);

        if (error) {
          console.warn('Supabase delete notice (local delete succeeded):', error);
        }
      } catch (err) {
        console.warn('Supabase delete notice (local delete succeeded):', err);
      }
    }

    return true;
  },

  /**
   * Duplicates an existing measurement sheet with a new ID and "(Copy)" in title
   */
  async duplicateSheet(sheetId: string, userId: string): Promise<MeasurementSheet | null> {
    const original = await this.getSheetById(sheetId, userId);
    if (!original) return null;

    const newSheet: MeasurementSheet = {
      ...original,
      id: generateId(),
      sheetName: `${original.sheetName} (Copy)`,
      referenceNumber: `REF-${Date.now().toString().slice(-6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: original.items.map((it) => ({
        ...it,
        id: generateId()
      }))
    };

    const res = await this.saveSheet(newSheet, userId);
    return res.sheet;
  },

  // ----------------------------------------------------
  // Draft Recovery for Preventing Work Loss
  // ----------------------------------------------------
  saveDraft(sheet: Partial<MeasurementSheet>): void {
    try {
      localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(sheet));
    } catch (e) {
      console.warn('Failed to save draft:', e);
    }
  },

  loadDraft(): Partial<MeasurementSheet> | null {
    try {
      const data = localStorage.getItem(ACTIVE_DRAFT_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  clearDraft(): void {
    try {
      localStorage.removeItem(ACTIVE_DRAFT_KEY);
    } catch (e) {
      console.warn('Failed to clear draft:', e);
    }
  }
};
