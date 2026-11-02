import React, { useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { Navbar } from './components/Navbar';
import { CalculatorPage } from './pages/CalculatorPage';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import type { BusinessSettings, MeasurementSheet } from './types';
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

const MainApp: React.FC = () => {
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
      <footer
        className="no-print"
        style={{
          borderTop: '1px solid var(--border-medium)',
          padding: '1.5rem',
          textAlign: 'center',
          fontSize: '0.82rem',
          color: 'var(--text-muted)',
          backgroundColor: 'var(--bg-surface)'
        }}
      >
        <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
            <img src="/logo-icon-transparent.png" alt="Logo" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
            <strong>Hindustan Saw Mill &amp; Wood Industries</strong> &mdash; Since 1971 &bull; CFT &amp; SQFT Calculator Suite
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
            CFT = (L &times; W &times; T &times; Pcs) / 144 &bull; SQFT = CFT &times; 12
          </div>
        </div>
      </footer>
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
