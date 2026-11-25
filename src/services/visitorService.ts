import type { AppVisitor, VisitorStatus } from '../types';
import { getSupabase } from '../lib/supabase';

const DEVICE_ID_KEY = 'hs_device_id';
const LOCAL_VISITORS_KEY = 'hs_visitors_store';
const SYSTEM_SHEET_ID = '00000000-0000-0000-0000-000000000001';
const SYSTEM_SHEET_NAME = '__SYSTEM_APP_VISITORS__';

/**
 * Retrieves or generates a persistent device ID stored in localStorage.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server_device';
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId || deviceId.trim() === '') {
    const randomHex = Math.random().toString(36).substring(2, 10);
    deviceId = `dev_${Date.now()}_${randomHex}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export interface NetworkInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  isp: string;
}

/**
 * Fetches visitor's public IP and location with fast multi-provider fallback & timeout
 */
export async function fetchNetworkInfo(): Promise<NetworkInfo> {
  const fallback: NetworkInfo = {
    ip: 'Unknown IP',
    city: '',
    region: '',
    country: '',
    isp: ''
  };

  // Provider 1: ipwho.is (fast, detailed, free)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('https://ipwho.is/', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        return {
          ip: data.ip,
          city: data.city || '',
          region: data.region || '',
          country: data.country || '',
          isp: data.connection?.isp || data.connection?.org || ''
        };
      }
    }
  } catch {
    // Continue to provider 2
  }

  // Provider 2: ipapi.co
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        return {
          ip: data.ip,
          city: data.city || '',
          region: data.region || '',
          country: data.country_name || '',
          isp: data.org || ''
        };
      }
    }
  } catch {
    // Continue to provider 3
  }

  // Provider 3: api.ipify.org (minimal fallback)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        return {
          ...fallback,
          ip: data.ip
        };
      }
    }
  } catch {
    // Return default fallback
  }

  return fallback;
}

/**
 * Detects device type, operating system, and browser from userAgent
 */
export function getDeviceDetails(): { deviceType: string; browser: string; os: string; userAgent: string } {
  if (typeof window === 'undefined') {
    return { deviceType: 'Desktop', browser: 'Browser', os: 'OS', userAgent: '' };
  }

  const ua = navigator.userAgent || '';
  let deviceType = 'Desktop';
  if (/mobile|android|touch|webos|hpwos/i.test(ua)) {
    deviceType = 'Mobile';
  } else if (/ipad|tablet/i.test(ua)) {
    deviceType = 'Tablet';
  }

  let os = 'Unknown OS';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/opera|opr/i.test(ua)) browser = 'Opera';

  return {
    deviceType,
    browser,
    os,
    userAgent: ua
  };
}

// -------------------------------------------------------------------------
// Storage & Fallback Management (Supabase Table <-> Fallback Storage)
// -------------------------------------------------------------------------

function getLocalVisitors(): AppVisitor[] {
  try {
    const raw = localStorage.getItem(LOCAL_VISITORS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore JSON errors
  }
  return [];
}

function saveLocalVisitors(visitors: AppVisitor[]): void {
  try {
    localStorage.setItem(LOCAL_VISITORS_KEY, JSON.stringify(visitors));
  } catch (err) {
    console.warn('LocalStorage save warning:', err);
  }
}

/**
 * Helper to sync with fallback measurement_sheets system record
 */
async function syncWithSystemSheet(supabase: any, visitors: AppVisitor[]): Promise<void> {
  try {
    const payloadNotes = `__VISITORS_DATA__${JSON.stringify(visitors)}`;
    await supabase.from('measurement_sheets').upsert({
      id: SYSTEM_SHEET_ID,
      sheet_name: SYSTEM_SHEET_NAME,
      notes: payloadNotes,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('System sheet sync notice:', err);
  }
}

/**
 * Helper to fetch visitors from fallback system sheet
 */
async function loadFromSystemSheet(supabase: any): Promise<AppVisitor[] | null> {
  try {
    const { data } = await supabase
      .from('measurement_sheets')
      .select('notes')
      .eq('id', SYSTEM_SHEET_ID)
      .maybeSingle();

    if (data?.notes && data.notes.startsWith('__VISITORS_DATA__')) {
      const raw = data.notes.replace('__VISITORS_DATA__', '');
      return JSON.parse(raw) as AppVisitor[];
    }
  } catch (err) {
    console.warn('System sheet load notice:', err);
  }
  return null;
}

// -------------------------------------------------------------------------
// Public Visitor Service Methods
// -------------------------------------------------------------------------

export const visitorService = {
  /**
   * Checks or registers the current visitor device & IP.
   * If approved: updates last_seen and returns visitor with 'approved'.
   * If new: registers with 'pending' and returns visitor.
   */
  async checkOrRegisterVisitor(): Promise<{ visitor: AppVisitor; isApproved: boolean }> {
    const deviceId = getOrCreateDeviceId();
    const network = await fetchNetworkInfo();
    const device = getDeviceDetails();
    const nowIso = new Date().toISOString();

    const supabase = getSupabase();
    let visitors = getLocalVisitors();

    if (supabase) {
      // 1. Try querying native app_visitors table
      try {
        const { data: remoteData, error } = await supabase
          .from('app_visitors')
          .select('*')
          .or(`device_id.eq.${deviceId},ip_address.eq.${network.ip}`)
          .limit(10);

        if (!error && remoteData) {
          // Found in native table!
          // Prioritize exact device_id match, or match by IP
          let match = remoteData.find((v: any) => v.device_id === deviceId) || remoteData.find((v: any) => v.ip_address === network.ip);

          if (match) {
            // Update last seen & device metadata
            const updated = {
              ip_address: network.ip || match.ip_address,
              city: network.city || match.city,
              region: network.region || match.region,
              isp: network.isp || match.isp,
              device_type: device.deviceType,
              browser: device.browser,
              os: device.os,
              last_seen: nowIso,
              updated_at: nowIso
            };

            await supabase
              .from('app_visitors')
              .update(updated)
              .eq('id', match.id);

            const resolved: AppVisitor = {
              id: match.id,
              deviceId: match.device_id,
              ipAddress: network.ip || match.ip_address,
              city: network.city || match.city,
              region: network.region || match.region,
              country: network.country || match.country,
              isp: network.isp || match.isp,
              deviceType: device.deviceType,
              browser: device.browser,
              os: device.os,
              userAgent: device.userAgent,
              status: match.status as VisitorStatus,
              label: match.label || '',
              firstSeen: match.first_seen || match.created_at || nowIso,
              lastSeen: nowIso,
              createdAt: match.created_at || nowIso,
              updatedAt: nowIso
            };

            // Mirror locally
            const localFiltered = visitors.filter(v => v.id !== resolved.id && v.deviceId !== resolved.deviceId);
            saveLocalVisitors([resolved, ...localFiltered]);

            return { visitor: resolved, isApproved: resolved.status === 'approved' };
          } else {
            // Register new visitor in native table
            const newRecord = {
              device_id: deviceId,
              ip_address: network.ip,
              city: network.city,
              region: network.region,
              country: network.country,
              isp: network.isp,
              device_type: device.deviceType,
              browser: device.browser,
              os: device.os,
              user_agent: device.userAgent,
              status: 'pending',
              label: '',
              first_seen: nowIso,
              last_seen: nowIso,
              created_at: nowIso,
              updated_at: nowIso
            };

            const { data: inserted, error: insertErr } = await supabase
              .from('app_visitors')
              .insert([newRecord])
              .select()
              .single();

            if (!insertErr && inserted) {
              const resVisitor: AppVisitor = {
                id: inserted.id,
                deviceId: inserted.device_id,
                ipAddress: inserted.ip_address,
                city: inserted.city,
                region: inserted.region,
                country: inserted.country,
                isp: inserted.isp,
                deviceType: inserted.device_type,
                browser: inserted.browser,
                os: inserted.os,
                userAgent: inserted.user_agent,
                status: inserted.status as VisitorStatus,
                label: inserted.label || '',
                firstSeen: inserted.first_seen,
                lastSeen: inserted.last_seen,
                createdAt: inserted.created_at,
                updatedAt: inserted.updated_at
              };

              saveLocalVisitors([resVisitor, ...visitors]);
              return { visitor: resVisitor, isApproved: false };
            }
          }
        }
      } catch (err) {
        console.warn('Native app_visitors query notice:', err);
      }

      // 2. Fallback: Check system sheet storage in Supabase
      const remoteVisitors = await loadFromSystemSheet(supabase);
      if (remoteVisitors && Array.isArray(remoteVisitors)) {
        visitors = remoteVisitors;
      }
    }

    // Process with fallback list
    let existing = visitors.find(v => v.deviceId === deviceId || (network.ip !== 'Unknown IP' && v.ipAddress === network.ip));

    if (existing) {
      existing.lastSeen = nowIso;
      existing.updatedAt = nowIso;
      if (network.ip && network.ip !== 'Unknown IP') existing.ipAddress = network.ip;
      if (network.city) existing.city = network.city;
      if (network.region) existing.region = network.region;
      if (network.isp) existing.isp = network.isp;
      existing.deviceType = device.deviceType;
      existing.browser = device.browser;
      existing.os = device.os;

      saveLocalVisitors(visitors);
      if (supabase) await syncWithSystemSheet(supabase, visitors);

      return { visitor: existing, isApproved: existing.status === 'approved' };
    }

    // Register new visitor in fallback list
    const newVisitor: AppVisitor = {
      id: `vis_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      deviceId,
      ipAddress: network.ip,
      city: network.city,
      region: network.region,
      country: network.country,
      isp: network.isp,
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
      userAgent: device.userAgent,
      status: 'pending',
      label: '',
      firstSeen: nowIso,
      lastSeen: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    visitors = [newVisitor, ...visitors];
    saveLocalVisitors(visitors);
    if (supabase) await syncWithSystemSheet(supabase, visitors);

    return { visitor: newVisitor, isApproved: false };
  },

  /**
   * Fetches all registered visitors for the admin dashboard
   */
  async getAllVisitors(): Promise<AppVisitor[]> {
    const supabase = getSupabase();

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('app_visitors')
          .select('*')
          .order('last_seen', { ascending: false });

        if (!error && data) {
          const mapped: AppVisitor[] = data.map((v: any) => ({
            id: v.id,
            deviceId: v.device_id,
            ipAddress: v.ip_address,
            city: v.city || '',
            region: v.region || '',
            country: v.country || '',
            isp: v.isp || '',
            deviceType: v.device_type || 'Desktop',
            browser: v.browser || 'Browser',
            os: v.os || 'OS',
            userAgent: v.user_agent || '',
            status: (v.status as VisitorStatus) || 'pending',
            label: v.label || '',
            firstSeen: v.first_seen || v.created_at,
            lastSeen: v.last_seen || v.created_at,
            createdAt: v.created_at,
            updatedAt: v.updated_at
          }));

          saveLocalVisitors(mapped);
          return mapped;
        }
      } catch (err) {
        console.warn('Native getAllVisitors query notice:', err);
      }

      // Fallback
      const fromSystem = await loadFromSystemSheet(supabase);
      if (fromSystem && Array.isArray(fromSystem)) {
        saveLocalVisitors(fromSystem);
        return fromSystem;
      }
    }

    return getLocalVisitors();
  },

  /**
   * Updates visitor status (approved, pending, blocked)
   */
  async updateVisitorStatus(visitorId: string, status: VisitorStatus): Promise<boolean> {
    const nowIso = new Date().toISOString();
    const supabase = getSupabase();

    if (supabase) {
      try {
        const { error } = await supabase
          .from('app_visitors')
          .update({ status, updated_at: nowIso })
          .eq('id', visitorId);

        if (!error) {
          // Mirror in local state
          const visitors = getLocalVisitors().map(v => v.id === visitorId ? { ...v, status, updatedAt: nowIso } : v);
          saveLocalVisitors(visitors);
          return true;
        }
      } catch (err) {
        console.warn('Native updateVisitorStatus notice:', err);
      }
    }

    // Fallback
    const visitors = getLocalVisitors().map(v => v.id === visitorId ? { ...v, status, updatedAt: nowIso } : v);
    saveLocalVisitors(visitors);
    if (supabase) await syncWithSystemSheet(supabase, visitors);
    return true;
  },

  /**
   * Updates custom label / note for a visitor (e.g. "Hindustan Sawmill Office PC")
   */
  async updateVisitorLabel(visitorId: string, label: string): Promise<boolean> {
    const nowIso = new Date().toISOString();
    const supabase = getSupabase();

    if (supabase) {
      try {
        const { error } = await supabase
          .from('app_visitors')
          .update({ label, updated_at: nowIso })
          .eq('id', visitorId);

        if (!error) {
          const visitors = getLocalVisitors().map(v => v.id === visitorId ? { ...v, label, updatedAt: nowIso } : v);
          saveLocalVisitors(visitors);
          return true;
        }
      } catch (err) {
        console.warn('Native updateVisitorLabel notice:', err);
      }
    }

    // Fallback
    const visitors = getLocalVisitors().map(v => v.id === visitorId ? { ...v, label, updatedAt: nowIso } : v);
    saveLocalVisitors(visitors);
    if (supabase) await syncWithSystemSheet(supabase, visitors);
    return true;
  },

  /**
   * Deletes a visitor record
   */
  async deleteVisitor(visitorId: string): Promise<boolean> {
    const supabase = getSupabase();

    if (supabase) {
      try {
        const { error } = await supabase
          .from('app_visitors')
          .delete()
          .eq('id', visitorId);

        if (!error) {
          const visitors = getLocalVisitors().filter(v => v.id !== visitorId);
          saveLocalVisitors(visitors);
          return true;
        }
      } catch (err) {
        console.warn('Native deleteVisitor notice:', err);
      }
    }

    // Fallback
    const visitors = getLocalVisitors().filter(v => v.id !== visitorId);
    saveLocalVisitors(visitors);
    if (supabase) await syncWithSystemSheet(supabase, visitors);
    return true;
  },

  /**
   * Pre-approves an IP address (Whitelist IP)
   */
  async whitelistIpAddress(ipAddress: string, label: string = 'Whitelisted Static IP'): Promise<AppVisitor> {
    const cleanIp = ipAddress.trim();
    const nowIso = new Date().toISOString();
    const supabase = getSupabase();

    const newRecord: AppVisitor = {
      id: `white_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      deviceId: `whitelisted_ip_${cleanIp}`,
      ipAddress: cleanIp,
      city: 'Pre-approved',
      region: '',
      country: '',
      isp: 'Direct Whitelist',
      deviceType: 'Any Device',
      browser: 'All Browsers',
      os: 'All Platforms',
      userAgent: 'Pre-approved IP entry',
      status: 'approved',
      label: label.trim() || 'Whitelisted Static IP',
      firstSeen: nowIso,
      lastSeen: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('app_visitors')
          .insert([{
            device_id: newRecord.deviceId,
            ip_address: newRecord.ipAddress,
            city: newRecord.city,
            isp: newRecord.isp,
            device_type: newRecord.deviceType,
            browser: newRecord.browser,
            os: newRecord.os,
            status: 'approved',
            label: newRecord.label,
            first_seen: nowIso,
            last_seen: nowIso,
            created_at: nowIso,
            updated_at: nowIso
          }])
          .select()
          .single();

        if (!error && data) {
          newRecord.id = data.id;
        }
      } catch (err) {
        console.warn('Native whitelistIpAddress notice:', err);
      }
    }

    const visitors = [newRecord, ...getLocalVisitors().filter(v => v.ipAddress !== cleanIp)];
    saveLocalVisitors(visitors);
    if (supabase) await syncWithSystemSheet(supabase, visitors);

    return newRecord;
  }
};
