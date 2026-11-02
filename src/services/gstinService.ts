export interface GstinData {
  gstin: string;
  legal_name: string;
  trade_name?: string | null;
  status: string;
  taxpayer_type?: string | null;
  state_code?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  address_details?: {
    building_number?: string | null;
    building_name?: string | null;
    floor?: string | null;
    street?: string | null;
    locality?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    landmark?: string | null;
    pincode?: string | null;
  };
}

export interface GstinApiResponse {
  success: boolean;
  gstin?: string;
  data?: GstinData;
  error?: string;
  message?: string;
}

const DEFAULT_GSTIN_API_KEY = 'gak_d8708a67ae8f44ca9b09f11d602c9041';

/**
 * Fetches company and taxpayer details from gstinapi.in using the provided API key.
 * First tries internal proxy route `/api/gstin?gstin=...` to avoid CORS in browsers.
 * Falls back to direct API call if proxy is unavailable.
 */
export async function fetchGstinDetails(gstin: string): Promise<GstinApiResponse> {
  const clean = gstin.trim().toUpperCase();
  if (!clean || clean.length !== 15) {
    return {
      success: false,
      error: 'Please enter a valid 15-character GSTIN number.'
    };
  }

  // 1. Try internal API route (Vercel Serverless / Vite Proxy)
  try {
    const proxyRes = await fetch(`/api/gstin?gstin=${encodeURIComponent(clean)}`, {
      headers: { Accept: 'application/json' }
    });

    if (proxyRes.ok) {
      const data: GstinApiResponse = await proxyRes.json();
      if (data && data.success) {
        return data;
      }
      if (data && data.error) {
        return data;
      }
    }
  } catch (_e) {
    // Proxy may not be reachable in some static environments, fallback to direct
  }

  // 2. Fallback to direct call to https://www.gstinapi.in
  try {
    const directRes = await fetch(`https://www.gstinapi.in/v1/gstin/${clean}`, {
      method: 'GET',
      headers: {
        'x-api-key': DEFAULT_GSTIN_API_KEY,
        Accept: 'application/json'
      }
    });

    const data: GstinApiResponse = await directRes.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error fetching GST details. Please verify your connection.'
    };
  }
}

