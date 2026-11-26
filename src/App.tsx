import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { Navbar } from './components/Navbar';
import { CalculatorPage } from './pages/CalculatorPage';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AccessRestrictedScreen } from './components/AccessRestrictedScreen';
import { PublicInvoicePage } from './components/PublicInvoicePage';
import { visitorService } from './services/visitorService';
import type { BusinessSettings, MeasurementSheet, AppVisitor } from './types';
import { dbService } from './services/db';

const SETTINGS_STORAGE_KEY = 'timberpro_business_settings';

const defaultSettings: BusinessSettings = {
  companyName: 'Hindustan Saw Mill & Wood Industries',
  tagline: 'Saw Mill & Wood Industries — Established Since 1971',
  address: 'Hindustan Saw Mill Industrial Complex',
  phone: '+91 (0) 98765 43210',
  email: 'info@hindustansawmill.com',
  taxId: 'HSM-WOOD-1971',
  sqftFormulaType: 'standard_1face',
  currencySymbol: '₹'
};

const MainApp: React.FC<{ onNavigateToAdmin?: () => void }> = ({ onNavigateToAdmin }) => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'calculator' | 'history' | 'settings'>('calculator');
  const [activeSheet, setActiveSheet] = useState<MeasurementSheet | null>(null);

  // Business settings state
  const [settings, setSettings] = useState<BusinessSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.companyName === 'TimberCraft Wood Industries' || !parsed.companyName) {
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(defaultSettings));
          return defaultSettings;
        }
        return parsed;
      }
      return defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  const handleUpdateSettings = (newSettings: BusinessSettings) => {
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
  };

  // Purge any legacy demo draft from previous sessions on startup
  useEffect(() => {
    const draft = dbService.loadDraft();
    if (draft?.items?.some((it) => it.woodType === 'Teak Wood Batten' || it.woodType === 'Pine Plank')) {
      dbService.clearDraft();
    }
  }, []);

  const handleOpenSheet = (sheet: MeasurementSheet) => {
    setActiveSheet(sheet);
    setCurrentView('calculator');
  };

  const handleNewSheet = () => {
    setActiveSheet(null);
    setCurrentView('calculator');
  };

  return (
    <div className="app-container">
      <Navbar
        currentView={currentView}
        onNavigate={(view) => {
          if (view === 'calculator' && currentView !== 'calculator') {
            // Keep active sheet if set
          }
          setCurrentView(view);
        }}
        onNavigateToAdmin={onNavigateToAdmin}
        activeSheetName={activeSheet?.sheetName}
      />

      <main className="main-content">
        {currentView === 'dashboard' && (
          <DashboardPage
            onNewSheet={handleNewSheet}
            onOpenSheet={handleOpenSheet}
            onViewAllSheets={() => setCurrentView('history')}
          />
        )}

        {currentView === 'calculator' && (
          <CalculatorPage
            sheetToEdit={activeSheet}
            onSaved={(savedSheet) => {
              setActiveSheet(savedSheet);
            }}
            businessSettings={settings}
          />
        )}

        {currentView === 'history' && (
          <HistoryPage
            onOpenSheet={handleOpenSheet}
            onNewSheet={handleNewSheet}
            businessSettings={settings}
          />
        )}

        {currentView === 'settings' && (
          <SettingsPage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer no-print">
        <div className="app-footer-inner">
          <div className="app-footer-brand">
            <img src="/logo-icon-transparent.png" alt="Logo" className="app-footer-logo" />
            <span>Hindustan Saw Mill &bull; Since 1971</span>
            {onNavigateToAdmin && (
              <a
                href="/admin"
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    onNavigateToAdmin();
                  }
                }}
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.78rem',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  marginLeft: '0.5rem'
                }}
              >
                Admin
              </a>
            )}
          </div>
          <div className="app-footer-formula">
            CFT = (L &times; W &times; T &times; Pcs) / 144
          </div>
        </div>
      </footer>
    </div>
  );
};

export function App() {
  const [publicInvoiceId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('invoice');
  });

  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();
    return path.startsWith('/admin') || hash.includes('admin') || search.includes('admin');
  });

  const [visitor, setVisitor] = useState<AppVisitor | null>(null);
  const [visitorStatus, setVisitorStatus] = useState<'checking' | 'approved' | 'restricted'>('checking');

  // Detect URL change
  useEffect(() => {
    const handleUrlChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      const search = window.location.search.toLowerCase();
      setIsAdminRoute(path.startsWith('/admin') || hash.includes('admin') || search.includes('admin'));
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Verify visitor on regular routes
  const verifyVisitor = useCallback(async () => {
    try {
      const { visitor: checkedVisitor, isApproved } = await visitorService.checkOrRegisterVisitor();
      setVisitor(checkedVisitor);
      setVisitorStatus(isApproved ? 'approved' : 'restricted');
    } catch (err) {
      console.warn('Visitor verification warning:', err);
      setVisitorStatus('restricted');
    }
  }, []);

  useEffect(() => {
    if (!isAdminRoute && !publicInvoiceId) {
      verifyVisitor();
    }
  }, [isAdminRoute, publicInvoiceId, verifyVisitor]);

  // 0. Public Read-Only Shared Invoice PDF Route (from WhatsApp invoice link)
  if (publicInvoiceId) {
    return <PublicInvoicePage sheetId={publicInvoiceId} businessSettings={defaultSettings} />;
  }

  const handleNavigateToAdmin = () => {
    window.history.pushState({}, '', '/admin');
    setIsAdminRoute(true);
  };

  const handleBackToApp = () => {
    window.history.pushState({}, '', '/');
    setIsAdminRoute(false);
    verifyVisitor();
  };

  // 1. Dedicated /admin Route (Password Protected)
  if (isAdminRoute) {
    return <AdminDashboardPage onBackToApp={handleBackToApp} />;
  }

  // 2. Checking visitor credentials
  if (visitorStatus === 'checking') {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#ffffff',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '1.5rem',
        textAlign: 'center'
      }}>
        <div style={{
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: '#38bdf8',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '1.25rem'
        }} />
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 0.4rem', letterSpacing: '-0.02em' }}>
          Hindustan Saw Mill &amp; Wood Industries
        </h2>
        <p style={{ fontSize: '0.84rem', color: '#94a3b8', margin: 0 }}>
          Verifying visitor authorization &amp; credentials...
        </p>
      </div>
    );
  }

  // 3. Visitor status is 'pending' or 'blocked': Show Access Restricted Screen
  if (visitorStatus === 'restricted' || visitor?.status !== 'approved') {
    return (
      <AccessRestrictedScreen
        visitor={visitor}
        onRefresh={verifyVisitor}
        onNavigateToAdmin={handleNavigateToAdmin}
      />
    );
  }

  // 4. Approved: Render full timber calculation app untouched
  return (
    <AuthProvider>
      <MainApp onNavigateToAdmin={handleNavigateToAdmin} />
    </AuthProvider>
  );
}

export default App;
