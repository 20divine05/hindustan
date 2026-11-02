# TimberPro — Industrial CFT & SQFT Calculator Suite

A complete, production-grade timber and wood business application for calculating **CFT (Cubic Feet)** and **SQFT (Square Feet)** from lumber measurements in the format:

$$\text{Length (Feet)} \times \text{Width (Inches)} \times \text{Thickness (Inches)} \times \text{Number of Pieces}$$

Built with **React**, **TypeScript**, **Supabase (Auth, PostgreSQL & Row Level Security)**, and a **Dark Forest Green & Charcoal timber-industry design system**.

---

## Key Features

1. **Precision Timber Calculation Engine**:
   - **CFT Formula**: $\text{CFT} = (\text{Length}_{\text{ft}} \times \text{Width}_{\text{in}} \times \text{Thickness}_{\text{in}} \times \text{Pieces}) \div 144$
   - **SQFT Formula**: $\text{SQFT} = (\text{Length}_{\text{ft}} \times \text{Width}_{\text{in}} \times \text{Pieces}) \div 12$
   - Unrounded floating-point precision maintained for all internal math and grand totals.
   - Display rounded to 3 commercial decimal places (e.g. `13.016 CFT`).
   - Configurable business rules: Select between standard 1-face board footage or double-face surface area.

2. **High-Speed Measurement Tallying**:
   - Real-time row calculation on every keystroke.
   - Quick-Add Bar at table bottom with auto-focus and keyboard cycle (`Tab` to jump fields, `Enter` to commit row).
   - In-place row editing, row duplication, and row deletion.
   - Serial number auto-indexing.

3. **Multi-User Authentication & Data Isolation**:
   - Supabase Auth (Email & Password, Registration, Password Reset, Session Persistence).
   - Multi-tenant data isolation enforced at the PostgreSQL database level using **Row Level Security (RLS)**.
   - Role-based permissions (`user`, `manager`, `admin`).
   - Resilient Dual-Mode fallback: Operates in offline/demo mode out-of-the-box, with an in-app setup modal to connect live Supabase anytime.

4. **Measurement Sheet Portfolio Management**:
   - Metadata: Sheet Name, Reference Number, Customer Name, Project / Site, Date, Delivery Notes.
   - Auto-save draft safeguard against accidental tab close or reload.
   - Reopen, edit, rename, duplicate, and delete with cascade safety.
   - Full search by Customer, Project, Ref, or Sheet Name, with date range filters.

5. **Multi-Format Reports & Exports**:
   - **Excel-Compatible CSV**: Includes UTF-8 BOM, metadata header, itemized breakdown, and summary totals.
   - **Industrial PDF Report**: Generates print-ready timber tally invoice/bill with brand header, totals highlight box, and signature lines.
   - **Print-Friendly View**: Dedicated `@media print` CSS stylesheet.

---

## Calculation Verification Examples

| Item # | Species | Length (ft) | Width (in) | Thick (in) | Pieces | Calculated CFT | Calculated SQFT |
|---|---|---|---|---|---|---|---|
| 1 | Teak Batten | 10.0 | 4.0 | 3.0 | 10 | **8.333** | **33.333** |
| 2 | Pine Plank | 12.0 | 6.0 | 2.0 | 8 | **8.000** | **48.000** |
| 3 | Mahogany | 8.5 | 5.25 | 1.75 | 24 | **13.016** | **89.250** |
| **Grand Total** | *Unrounded Sum* | &mdash; | &mdash; | &mdash; | **42 pcs** | **29.349 CFT** | **170.583 SQFT** |

---

## Database Architecture & Row Level Security (RLS)

All database tables, foreign key cascades, triggers, and RLS policies are available in `supabase/schema.sql`.

### Tables:
- **`public.profiles`**: Linked to `auth.users(id) on delete cascade`, stores `email`, `full_name`, `company_name`, and `role`.
- **`public.measurement_sheets`**: Stores sheet metadata, customer details, timestamps, and summary totals.
- **`public.measurement_items`**: Stores individual measurement rows (`length_feet`, `width_inches`, `thickness_inches`, `number_of_pieces`, `cft`, `sqft`, `wood_type`, `remarks`).

### RLS Policies:
- Every table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
- Users can view, create, update, and delete **only their own measurement sheets and measurement items** (`auth.uid() = user_id`).
- Items must belong to a sheet owned by the authenticated user (`EXISTS (SELECT 1 FROM measurement_sheets WHERE id = sheet_id AND user_id = auth.uid())`).
- Optional `is_admin_or_manager()` function permits administrators or mill managers to inspect records if enabled.

---

## Setup & Installation

### 1. Prerequisites
- Node.js (v18+)
- npm or yarn

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Supabase Cloud Database

#### Option A: Via `.env` file
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Option B: In-App Connection Wizard (Zero-Config)
You can simply launch the app! Click the **"Demo Mode (Offline)"** badge in the navigation bar to paste your Supabase Project URL and Anon Key directly in the UI.

#### Database SQL Migration:
1. Log in to [supabase.com](https://supabase.com).
2. Go to your project's **SQL Editor**.
3. Copy the contents of `supabase/schema.sql` (or click **"Copy SQL Schema"** inside the app's Settings page).
4. Paste and click **Run**.

### 4. Run Locally
```bash
npm run dev
```
Open `http://localhost:5173/` in your browser.

### 5. Build for Production
```bash
npm run build
```
Generates production bundle in `dist/`.

### 6. Run Calculation Unit Tests
```bash
node scripts/test_calc.js
```

---

## File Structure

```
cft/
├── public/                 # Static assets & icons
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── ConfirmModal.tsx
│   │   ├── MeasurementTable.tsx
│   │   ├── Navbar.tsx
│   │   ├── SummaryCards.tsx
│   │   └── SupabaseConfigModal.tsx
│   ├── contexts/
│   │   └── AuthContext.tsx # Supabase Auth & Session Provider
│   ├── lib/
│   │   └── supabase.ts     # Supabase client factory & credential store
│   ├── pages/
│   │   ├── AuthPage.tsx    # Sign In, Sign Up, Password Reset, Demo personas
│   │   ├── CalculatorPage.tsx # Real-time tally sheet & calculator
│   │   ├── DashboardPage.tsx  # User overview & cumulative metrics
│   │   ├── HistoryPage.tsx    # Saved sheet history, search, & management
│   │   └── SettingsPage.tsx   # Company branding & formula settings
│   ├── services/
│   │   └── db.ts           # Unified Supabase + Local Resilience service
│   ├── types/
│   │   └── index.ts        # TypeScript domain models
│   ├── utils/
│   │   ├── calculator.ts   # Core CFT & SQFT formulas and precision logic
│   │   ├── exportCsv.ts    # Excel-compatible CSV generator
│   │   └── exportPdf.ts    # jsPDF + AutoTable timber invoice generator
│   ├── App.tsx             # Root assembly & router
│   ├── index.css           # Vanilla CSS timber design system
│   └── main.tsx            # Entry point
├── supabase/
│   └── schema.sql          # Complete PostgreSQL schema, RLS, & triggers
├── scripts/
│   └── test_calc.js        # Automated calculation verification runner
├── .env.example            # Environment variables template
├── package.json
└── README.md
```
