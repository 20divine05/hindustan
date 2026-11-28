import QRCode from 'qrcode';
import type { BusinessSettings } from '../types';

export const SETTINGS_STORAGE_KEY = 'timberpro_business_settings';

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  companyName: 'HINDUSTAN SAW MILLS AND WOOD INDUSTRIES',
  tagline: 'Wood Industries • Precision CFT & SQFT Calculator',
  sinceBadge: 'SINCE 1971',
  address: '#99/C INDUSTRIAL SUBURB 2ND STAGE\nVISHVESHWARA NAGAR, MYSORE - 570008',
  phone: '7996222901',
  email: 'hindustansawmill@gmail.com',
  taxId: '29APYPK6256P1ZL',
  state: 'Karnataka',
  stateCode: '29',
  logoDataUrl: '',
  bankAccountHolder: 'HINDUSTAN SAW MILLS AND WOOD INDUSTRIES 2024-25',
  bankName: 'ICICI BANK',
  bankAccountNo: '464205000153',
  bankBranchIfsc: 'JP NAGAR & ICIC0004642',
  upiId: 'hindustansawmill@icici',
  upiQrDataUrl: '',
  sqftFormulaType: 'standard_1face',
  currencySymbol: '₹',
  ratePerCft: 1200
};

function migrateLegacyBoilerplate(raw: Partial<BusinessSettings>): Partial<BusinessSettings> {
  const next: Partial<BusinessSettings> = { ...raw };
  if (next.companyName === 'TimberCraft Wood Industries' || next.companyName === 'Hindustan Saw Mill & Wood Industries') {
    next.companyName = DEFAULT_BUSINESS_SETTINGS.companyName;
  }
  if (next.tagline === 'Saw Mill & Wood Industries — Established Since 1971') {
    next.tagline = DEFAULT_BUSINESS_SETTINGS.tagline;
  }
  if (next.address === 'Hindustan Saw Mill Industrial Complex') {
    next.address = DEFAULT_BUSINESS_SETTINGS.address;
  }
  if (next.phone === '+91 (0) 98765 43210') {
    next.phone = DEFAULT_BUSINESS_SETTINGS.phone;
  }
  if (next.email === 'info@hindustansawmill.com') {
    next.email = DEFAULT_BUSINESS_SETTINGS.email;
  }
  if (next.taxId === 'HSM-WOOD-1971') {
    next.taxId = DEFAULT_BUSINESS_SETTINGS.taxId;
  }
  return next;
}

export function resolveBusinessSettings(settings?: Partial<BusinessSettings> | null): BusinessSettings {
  if (!settings) {
    return { ...DEFAULT_BUSINESS_SETTINGS };
  }
  const normalized = migrateLegacyBoilerplate(settings);
  const pick = (val: string | undefined, fallback: string) =>
    val !== undefined && val !== null && val.trim() !== '' ? val.trim() : fallback;

  return {
    companyName: pick(normalized.companyName, DEFAULT_BUSINESS_SETTINGS.companyName),
    tagline: normalized.tagline !== undefined ? normalized.tagline : DEFAULT_BUSINESS_SETTINGS.tagline,
    sinceBadge: normalized.sinceBadge !== undefined ? normalized.sinceBadge : DEFAULT_BUSINESS_SETTINGS.sinceBadge,
    address: pick(normalized.address, DEFAULT_BUSINESS_SETTINGS.address),
    phone: pick(normalized.phone, DEFAULT_BUSINESS_SETTINGS.phone),
    email: pick(normalized.email, DEFAULT_BUSINESS_SETTINGS.email),
    taxId: pick(normalized.taxId, DEFAULT_BUSINESS_SETTINGS.taxId),
    state: pick(normalized.state, DEFAULT_BUSINESS_SETTINGS.state || 'Karnataka'),
    stateCode: pick(normalized.stateCode, DEFAULT_BUSINESS_SETTINGS.stateCode || '29'),
    logoDataUrl: normalized.logoDataUrl || '',
    bankAccountHolder: pick(normalized.bankAccountHolder, DEFAULT_BUSINESS_SETTINGS.bankAccountHolder || ''),
    bankName: pick(normalized.bankName, DEFAULT_BUSINESS_SETTINGS.bankName || ''),
    bankAccountNo: pick(normalized.bankAccountNo, DEFAULT_BUSINESS_SETTINGS.bankAccountNo || ''),
    bankBranchIfsc: pick(normalized.bankBranchIfsc, DEFAULT_BUSINESS_SETTINGS.bankBranchIfsc || ''),
    upiId: pick(normalized.upiId, DEFAULT_BUSINESS_SETTINGS.upiId || ''),
    upiQrDataUrl: normalized.upiQrDataUrl || '',
    sqftFormulaType: normalized.sqftFormulaType || 'standard_1face',
    currencySymbol: pick(normalized.currencySymbol, '₹'),
    ratePerCft:
      typeof normalized.ratePerCft === 'number' && Number.isFinite(normalized.ratePerCft) && normalized.ratePerCft > 0
        ? normalized.ratePerCft
        : DEFAULT_BUSINESS_SETTINGS.ratePerCft
  };
}

export function loadBusinessSettings(): BusinessSettings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_BUSINESS_SETTINGS };
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_BUSINESS_SETTINGS };
    const parsed = JSON.parse(stored);
    return resolveBusinessSettings(parsed);
  } catch {
    return { ...DEFAULT_BUSINESS_SETTINGS };
  }
}

export function saveBusinessSettings(settings: BusinessSettings): BusinessSettings {
  const resolved = resolveBusinessSettings(settings);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(resolved));
    }
  } catch (err) {
    console.warn('Could not persist business settings:', err);
  }
  return resolved;
}

export function detectImageDataUrlFormat(dataUrl: string): 'PNG' | 'WEBP' | 'JPEG' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

export async function processBrandImageUpload(
  file: File,
  options: { maxDim?: number; squareFit?: boolean; preserveTransparency?: boolean } = {}
): Promise<string> {
  const { maxDim = 360, squareFit = true, preserveTransparency = true } = options;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected image file.'));
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width || 1;
    const srcH = img.naturalHeight || img.height || 1;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const drawW = Math.max(1, Math.round(srcW * scale));
    const drawH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    if (squareFit) {
      const box = Math.max(drawW, drawH);
      canvas.width = box;
      canvas.height = box;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Browser canvas unavailable.');
      if (!preserveTransparency) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, box, box);
      }
      const x = Math.round((box - drawW) / 2);
      const y = Math.round((box - drawH) / 2);
      ctx.drawImage(img, x, y, drawW, drawH);
    } else {
      canvas.width = drawW;
      canvas.height = drawH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Browser canvas unavailable.');
      if (!preserveTransparency) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, drawW, drawH);
      }
      ctx.drawImage(img, 0, 0, drawW, drawH);
    }

    return preserveTransparency
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function generateUpiQrDataUrl(upiId: string, payeeName?: string): Promise<string> {
  const pa = upiId.trim();
  if (!pa) {
    throw new Error('Please enter a valid UPI ID first.');
  }
  const pn = encodeURIComponent((payeeName || 'Hindustan Saw Mills').trim());
  const upiUri = `upi://pay?pa=${encodeURIComponent(pa)}&pn=${pn}&cu=INR`;
  return QRCode.toDataURL(upiUri, {
    width: 320,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}
