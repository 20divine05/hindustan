import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase, getSupabaseCredentials } from '../lib/supabase';
import type { UserProfile } from '../types';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isSupabaseConnected: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string, companyName?: string) => Promise<{ error?: string; message?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string; message?: string }>;
  refreshProfile: () => Promise<void>;
  switchDemoUser?: (role: 'user' | 'manager' | 'admin') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_USER_KEY = 'timberpro_auth_user';

export const PUBLIC_STAFF_USER: UserProfile = {
  id: 'hindustan-staff',
  email: 'staff@hindustansawmill.com',
  fullName: 'Hindustan Saw Mill Staff',
  role: 'admin',
  companyName: 'Hindustan Saw Mill & Wood Industries',
  createdAt: new Date().toISOString()
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile>(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_USER_KEY) : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.fullName) return parsed;
      }
    } catch {
      // fallback
    }
    return PUBLIC_STAFF_USER;
  });
  const [loading] = useState(false);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);

  // Initialize Auth state
  useEffect(() => {
    let authSubscription: { unsubscribe: () => void } | null = null;

    const initAuth = async () => {
      const { isConfigured } = getSupabaseCredentials();
      setIsSupabaseConnected(isConfigured);

      const supabase = getSupabase();

      if (isConfigured && supabase) {
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error) {
            console.warn('Supabase getSession notice:', error.message);
          }

          if (session?.user) {
            await loadSupabaseProfile(session.user.id, session.user.email || '');
          } else {
            // Keep public staff session active
            setUser(PUBLIC_STAFF_USER);
          }

          const { data: subData } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
            if (newSession?.user) {
              await loadSupabaseProfile(newSession.user.id, newSession.user.email || '');
            } else {
              setUser(PUBLIC_STAFF_USER);
            }
          });

          authSubscription = subData.subscription;
        } catch (err) {
          console.error('Supabase connection note:', err);
          fallbackToLocalStorage();
        }
      } else {
        fallbackToLocalStorage();
      }
    };

    const fallbackToLocalStorage = () => {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.companyName === 'TimberCraft Wood Industries') {
            parsed.companyName = 'Hindustan Saw Mill & Wood Industries';
            localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(parsed));
          }
          setUser(parsed);
        } else {
          // Default demo session for immediate usability
          const demoUser: UserProfile = {
            id: 'demo-user-1',
            email: 'operator@hindustansawmill.com',
            fullName: 'Rajesh Sharma (Head Sawyer)',
            role: 'user',
            companyName: 'Hindustan Saw Mill & Wood Industries',
            createdAt: new Date().toISOString()
          };
          setUser(demoUser);
          localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(demoUser));
        }
      } catch (e) {
        console.error('Error accessing local auth store:', e);
      }
    };

    initAuth();

    const handleConfigChange = () => {
      initAuth();
    };

    window.addEventListener('supabase_config_changed', handleConfigChange);

    return () => {
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
      window.removeEventListener('supabase_config_changed', handleConfigChange);
    };
  }, []);

  const loadSupabaseProfile = async (userId: string, email: string) => {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data && !error) {
        setUser({
          id: data.id,
          email: data.email || email,
          fullName: data.full_name || email.split('@')[0],
          role: data.role || 'user',
          companyName: data.company_name || 'Timber & Wood Solutions',
          createdAt: data.created_at
        });
      } else {
        // Fallback profile if row is not yet created
        const tempProfile: UserProfile = {
          id: userId,
          email,
          fullName: email.split('@')[0],
          role: 'user',
          companyName: 'Timber & Wood Solutions',
          createdAt: new Date().toISOString()
        };
        setUser(tempProfile);
      }
    } catch (err) {
      console.error('Failed to load profile from Supabase:', err);
      setUser({
        id: userId,
        email,
        fullName: email.split('@')[0],
        role: 'user',
        companyName: 'Timber & Wood Solutions'
      });
    }
  };

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    const supabase = getSupabase();
    if (isSupabaseConnected && supabase) {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error) {
          return { error: error.message };
        }
        return {};
      } catch (err: any) {
        return { error: err.message || 'Failed to sign in' };
      }
    } else {
      // Demo authentication mode
      if (!email.includes('@') || password.length < 6) {
        return { error: 'Please enter a valid email and minimum 6 character password.' };
      }

      const role: 'user' | 'manager' = email.includes('admin') || email.includes('manager') ? 'manager' : 'user';
      const demoUser: UserProfile = {
        id: `local-user-${email.replace(/[^a-zA-Z0-9]/g, '_')}`,
        email: email.trim(),
        fullName: email.split('@')[0].replace('.', ' '),
        role,
        companyName: 'TimberCraft Wood Industries',
        createdAt: new Date().toISOString()
      };
      setUser(demoUser);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(demoUser));
      return {};
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    companyName: string = 'Timber & Wood Solutions'
  ): Promise<{ error?: string; message?: string }> => {
    const supabase = getSupabase();
    if (isSupabaseConnected && supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName,
              company_name: companyName
            }
          }
        });

        if (error) {
          return { error: error.message };
        }

        if (data.session?.user) {
          await loadSupabaseProfile(data.session.user.id, data.session.user.email || email);
          return { message: 'Account created and signed in successfully!' };
        }

        return { message: 'Registration successful! Please check your email to confirm your account.' };
      } catch (err: any) {
        return { error: err.message || 'Failed to register account' };
      }
    } else {
      // Demo signup
      if (!email.includes('@') || password.length < 6) {
        return { error: 'Please provide a valid email and password with at least 6 characters.' };
      }

      const newUser: UserProfile = {
        id: `local-user-${Date.now()}`,
        email: email.trim(),
        fullName: fullName || email.split('@')[0],
        role: 'user',
        companyName,
        createdAt: new Date().toISOString()
      };

      setUser(newUser);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(newUser));
      return { message: 'Account created successfully!' };
    }
  };

  const signOut = async (): Promise<void> => {
    const supabase = getSupabase();
    if (isSupabaseConnected && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Supabase sign out error:', err);
      }
    }
    setUser(PUBLIC_STAFF_USER);
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
  };

  const resetPassword = async (email: string): Promise<{ error?: string; message?: string }> => {
    const supabase = getSupabase();
    if (isSupabaseConnected && supabase) {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin
        });
        if (error) {
          return { error: error.message };
        }
        return { message: 'Password reset link sent to your email address.' };
      } catch (err: any) {
        return { error: err.message || 'Failed to send reset email' };
      }
    } else {
      return { message: 'Demo mode: In live mode, a secure password reset link is delivered via Supabase Auth.' };
    }
  };

  const refreshProfile = async () => {
    if (user && isSupabaseConnected) {
      await loadSupabaseProfile(user.id, user.email);
    }
  };

  const switchDemoUser = (role: 'user' | 'manager' | 'admin') => {
    const accounts = {
      user: {
        id: 'demo-user-1',
        email: 'sawyer@hindustansawmill.com',
        fullName: 'Rajesh Sharma (Head Sawyer)',
        role: 'user' as const,
        companyName: 'Hindustan Saw Mill & Wood Industries'
      },
      manager: {
        id: 'demo-user-2',
        email: 'manager@hindustansawmill.com',
        fullName: 'Vikram Singh (Mill Manager)',
        role: 'manager' as const,
        companyName: 'Hindustan Saw Mill & Wood Industries'
      },
      admin: {
        id: 'demo-user-3',
        email: 'director@hindustansawmill.com',
        fullName: 'Harpreet Singh (Managing Director)',
        role: 'admin' as const,
        companyName: 'Hindustan Saw Mill & Wood Industries'
      }
    };

    const chosen = accounts[role];
    setUser({ ...chosen, createdAt: new Date().toISOString() });
    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(chosen));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isSupabaseConnected,
        signIn,
        signUp,
        signOut,
        resetPassword,
        refreshProfile,
        switchDemoUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
