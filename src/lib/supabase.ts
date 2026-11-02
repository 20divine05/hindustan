import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'timberpro_supabase_url';
const STORAGE_KEY_KEY = 'timberpro_supabase_anon_key';

export function getSupabaseCredentials(): { url: string; anonKey: string; isConfigured: boolean } {
  const envUrl = (
    import.meta.env.VITE_SUPABASE_URL ||
    (import.meta.env as any).NEXT_PUBLIC_SUPABASE_URL ||
    ''
  );
  const envKey = (
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    (import.meta.env as any).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    (import.meta.env as any).NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );

  const localUrl = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_URL) || '' : '';
  const localKey = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_KEY) || '' : '';

  const url = (envUrl || localUrl).trim();
  const anonKey = (envKey || localKey).trim();

  // Support standard supabase.co URLs and publishable (sb_publishable_) or JWT (eyJ) keys
  const isConfigured = Boolean(
    url &&
    anonKey &&
    url.startsWith('http') &&
    url.includes('.supabase.co') &&
    anonKey.length > 15
  );

  return { url, anonKey, isConfigured };
}

let activeSupabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabaseCredentials();

  if (!isConfigured) {
    return null;
  }

  if (!activeSupabaseClient) {
    try {
      activeSupabaseClient = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return activeSupabaseClient;
}

export function saveCustomSupabaseCredentials(url: string, anonKey: string): boolean {
  try {
    const cleanUrl = url.trim();
    const cleanKey = anonKey.trim();
    localStorage.setItem(STORAGE_KEY_URL, cleanUrl);
    localStorage.setItem(STORAGE_KEY_KEY, cleanKey);
    // Reset client to reinitialize
    activeSupabaseClient = null;
    window.dispatchEvent(new CustomEvent('supabase_config_changed'));
    return true;
  } catch (err) {
    console.error('Error saving credentials:', err);
    return false;
  }
}

export function clearCustomSupabaseCredentials(): void {
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_KEY);
  activeSupabaseClient = null;
  window.dispatchEvent(new CustomEvent('supabase_config_changed'));
}
