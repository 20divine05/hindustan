import os
import io
import base64
from PIL import Image

# Resize logo for crisp embedding
icon_b64 = ""
try:
    if os.path.exists('public/logo-icon-transparent.png'):
        img = Image.open('public/logo-icon-transparent.png')
        img.thumbnail((180, 180), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format='PNG', optimize=True)
        icon_b64 = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('utf-8')
    elif os.path.exists('public/logo-icon.png'):
        img = Image.open('public/logo-icon.png')
        img.thumbnail((180, 180), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format='PNG', optimize=True)
        icon_b64 = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('utf-8')
except Exception as e:
    print("Warning loading logo:", e)

logo_img_tag = f'<img src="{icon_b64}" alt="Hindustan Saw Mill Logo" class="company-logo" onerror="this.style.display=\'none\';" />' if icon_b64 else ''

html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proforma Invoice #8 - Hindustan Saw Mills and Wood Industries</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    :root {{
      --border-color: #222222;
      --text-main: #111111;
      --bg-header: #f6f7f6;
      --brand-green: #1b4332;
    }}

    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: var(--text-main);
      background-color: #525659;
      line-height: 1.25;
      font-size: 9.5px;
      -webkit-font-smoothing: antialiased;
      padding: 20px 0;
    }}

    /* Screen Top Action Bar */
    .screen-actions {{
      width: 210mm;
      margin: 0 auto 12px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      padding: 10px 18px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }}

    .screen-actions .title {{
      font-size: 13px;
      font-weight: 700;
      color: var(--brand-green);
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .btn {{
      appearance: none;
      border: none;
      background: var(--brand-green);
      color: #ffffff;
      font-weight: 600;
      font-size: 11px;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
    }}

    .btn:hover {{
      background: #2d6a4f;
    }}

    /* Standard A4 Portrait Invoice Container */
    .invoice-container {{
      width: 210mm;
      margin: 0 auto;
      background: #ffffff;
      box-shadow: 0 6px 24px rgba(0,0,0,0.25);
    }}

    /* Bordered Invoice Wrapper */
    .invoice-box {{
      border: 1.5px solid var(--border-color);
      width: 100%;
      display: flex;
      flex-direction: column;
    }}

    /* Title Bar */
    .invoice-title {{
      text-align: center;
      font-size: 13.5px;
      font-weight: 800;
      letter-spacing: 1.5px;
      padding: 4px 0;
      border-bottom: 1.5px solid var(--border-color);
      text-transform: uppercase;
      background-color: #ffffff;
    }}

    /* Top Split Section: Left (Seller + Consignee + Buyer) | Right (Dispatch Grid) */
    .top-split-grid {{
      display: grid;
      grid-template-columns: 50% 50%;
      border-bottom: 1.5px solid var(--border-color);
    }}

    .left-col {{
      border-right: 1.5px solid var(--border-color);
      display: flex;
      flex-direction: column;
    }}

    /* Seller Box */
    .seller-box {{
      display: flex;
      gap: 10px;
      padding: 6px 8px;
      border-bottom: 1.5px solid var(--border-color);
      align-items: flex-start;
    }}

    .logo-box {{
      width: 60px;
      height: 60px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }}

    .company-logo {{
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }}

    .seller-details {{
      flex: 1;
    }}

    .seller-name {{
      font-size: 11px;
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: 2px;
      color: #000000;
    }}

    .seller-line {{
      font-size: 9px;
      line-height: 1.25;
      color: #111111;
    }}

    /* Consignee & Buyer Boxes */
    .party-box {{
      padding: 5px 8px;
      border-bottom: 1.5px solid var(--border-color);
    }}

    .party-box.no-border {{
      border-bottom: none;
    }}

    .party-heading {{
      font-size: 9px;
      font-weight: 700;
      color: #333333;
      margin-bottom: 2px;
    }}

    .party-name {{
      font-size: 10.5px;
      font-weight: 800;
      color: #000000;
      margin-bottom: 1px;
    }}

    .party-address {{
      font-size: 9px;
      line-height: 1.25;
      color: #222222;
      margin-bottom: 2px;
    }}

    .party-meta-row {{
      display: flex;
      font-size: 9px;
      line-height: 1.25;
    }}

    .party-meta-label {{
      width: 75px;
      color: #222222;
    }}

    .party-meta-val {{
      font-weight: 600;
      color: #000000;
    }}

    /* Right Metadata Grid */
    .right-col {{
      display: flex;
      flex-direction: column;
    }}

    .meta-row {{
      display: grid;
      border-bottom: 1px solid var(--border-color);
    }}

    .meta-row.cols-3 {{
      grid-template-columns: 33.3% 33.3% 33.4%;
    }}

    .meta-row.cols-2 {{
      grid-template-columns: 50% 50%;
    }}

    .meta-row.full {{
      grid-template-columns: 100%;
    }}

    .meta-cell {{
      padding: 3px 6px;
      border-right: 1px solid var(--border-color);
      font-size: 9px;
      min-height: 24px;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }}

    .meta-cell:last-child {{
      border-right: none;
    }}

    .meta-label {{
      font-size: 8px;
      color: #444444;
      display: block;
      line-height: 1.1;
      margin-bottom: 1px;
    }}

    .meta-val {{
      font-size: 9.5px;
      font-weight: 700;
      color: #000000;
    }}

    /* Items Table */
    .items-table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
    }}

    .items-table th {{
      border-bottom: 1.5px solid var(--border-color);
      border-right: 1px solid var(--border-color);
      padding: 4px 3px;
      font-weight: 700;
      font-size: 8.5px;
      background-color: var(--bg-header);
      vertical-align: middle;
      text-align: center;
    }}

    .items-table th:last-child {{
      border-right: none;
    }}

    .items-table td {{
      padding: 2.5px 4px;
      border-right: 1px solid var(--border-color);
      border-bottom: none;
      vertical-align: middle;
      line-height: 1.25;
    }}

    .items-table td:last-child {{
      border-right: none;
    }}

    .desc-cell {{
      font-weight: 700;
      color: #000000;
      padding-left: 8px !important;
      text-align: left;
    }}

    .mono {{
      font-family: 'JetBrains Mono', Courier, monospace;
      font-variant-numeric: tabular-nums;
      font-size: 9px;
    }}

    .text-center {{
      text-align: center;
    }}

    .text-right {{
      text-align: right;
    }}

    /* Total Row */
    .total-row td {{
      border-top: 1.5px solid var(--border-color);
      border-bottom: 1.5px solid var(--border-color);
      border-right: 1px solid var(--border-color);
      padding: 4px 4px;
      background-color: var(--bg-header);
      font-weight: 800;
    }}

    .total-row td:last-child {{
      border-right: none;
    }}

    /* Words Bar */
    .words-bar {{
      border-bottom: 1.5px solid var(--border-color);
      padding: 4px 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
    }}

    .words-label {{
      font-size: 8px;
      color: #444444;
      display: block;
    }}

    .words-text {{
      font-size: 10px;
      font-weight: 800;
      color: #000000;
    }}

    .eoe {{
      font-size: 9px;
      font-weight: 700;
      color: #333333;
    }}

    /* HSN / Tax Summary */
    .hsn-container {{
      border-bottom: 1.5px solid var(--border-color);
      padding: 4px 8px;
      display: flex;
      flex-direction: column;
    }}

    .hsn-table-wrap {{
      margin-left: auto;
      width: 200px;
    }}

    .hsn-table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      border: 1px solid var(--border-color);
    }}

    .hsn-table th {{
      border: 1px solid var(--border-color);
      padding: 2px 6px;
      font-weight: 700;
      font-size: 8.5px;
      background-color: var(--bg-header);
    }}

    .hsn-table td {{
      border: 1px solid var(--border-color);
      padding: 2px 6px;
      text-align: right;
    }}

    .hsn-table td:first-child {{
      text-align: center;
    }}

    .hsn-total-row td {{
      font-weight: 800;
      background-color: var(--bg-header);
    }}

    .tax-words {{
      font-size: 9px;
      margin-top: 2px;
      color: #111111;
    }}

    /* Bottom Grid */
    .bottom-grid {{
      display: grid;
      grid-template-columns: 55% 45%;
      border-bottom: 1px solid var(--border-color);
    }}

    .bottom-left {{
      border-right: 1.5px solid var(--border-color);
      display: flex;
      flex-direction: column;
    }}

    .terms-box {{
      padding: 5px 8px;
      border-bottom: 1px solid var(--border-color);
    }}

    .section-title {{
      font-size: 9px;
      font-weight: 800;
      text-decoration: underline;
      margin-bottom: 3px;
      color: #000000;
    }}

    .terms-list {{
      margin: 0;
      padding-left: 14px;
      font-size: 8px;
      color: #222222;
      line-height: 1.35;
    }}

    .declaration-box {{
      padding: 5px 8px;
      border-bottom: 1px solid var(--border-color);
    }}

    .decl-heading {{
      font-size: 9px;
      font-weight: 800;
      margin-bottom: 2px;
    }}

    .decl-text {{
      font-size: 8px;
      line-height: 1.3;
      color: #222222;
    }}

    .cust-sign-box {{
      padding: 5px 8px;
      font-size: 9px;
      font-weight: 700;
      color: #333333;
      min-height: 48px;
      display: flex;
      align-items: flex-start;
    }}

    .bottom-right {{
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }}

    .bank-box {{
      padding: 5px 8px;
      border-bottom: 1px solid var(--border-color);
    }}

    .bank-row {{
      display: flex;
      font-size: 8.5px;
      line-height: 1.35;
    }}

    .bank-lbl {{
      width: 100px;
      color: #333333;
    }}

    .bank-v {{
      font-weight: 700;
      color: #000000;
    }}

    .auth-box {{
      padding: 6px 8px;
      text-align: right;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 65px;
    }}

    .for-co {{
      font-size: 9.5px;
      font-weight: 800;
      color: #000000;
    }}

    .sign-space {{
      flex: 1;
    }}

    .sign-title {{
      font-size: 9px;
      font-weight: 700;
      color: #222222;
    }}

    .computer-note {{
      text-align: center;
      font-size: 8.5px;
      color: #444444;
      padding: 2.5px 0;
      font-style: italic;
      background-color: #ffffff;
    }}

    @media print {{
      @page {{
        size: A4 portrait;
        margin: 5mm 6mm;
      }}
      body {{
        background: transparent !important;
        padding: 0 !important;
      }}
      .screen-actions {{
        display: none !important;
      }}
      .invoice-container {{
        width: 100% !important;
        margin: 0 !important;
        box-shadow: none !important;
      }}
      .invoice-box {{
        border: 1.5px solid #000000 !important;
        page-break-inside: avoid !important;
      }}
      * {{
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }}
    }}
  </style>
</head>
<body>

  <!-- Screen Top Actions Bar -->
  <div class="screen-actions">
    <div class="title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
      <span>PROFORMA INVOICE #8 &bull; HINDUSTAN SAW MILLS AND WOOD INDUSTRIES</span>
    </div>
    <button class="btn" onclick="window.print()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Print / Save as PDF
    </button>
  </div>

  <!-- A4 Invoice Container -->
  <div class="invoice-container">
    <div class="invoice-box">

      <!-- Header Title -->
      <div class="invoice-title">
        PROFORMA INVOICE
      </div>

      <!-- Top Section: Left (Seller + Consignee + Buyer) | Right (Dispatch Table) -->
      <div class="top-split-grid">
        
        <!-- Left Column -->
        <div class="left-col">
          <!-- Seller Box -->
          <div class="seller-box">
            <div class="logo-box">
              {logo_img_tag}
            </div>
            <div class="seller-details">
              <div class="seller-name">HINDUSTAN SAW MILLS AND WOOD INDUSTRIES</div>
              <div class="seller-line">#99/C INDUSTRIAL SUBURB 2ND STAGE</div>
              <div class="seller-line">VISHVESHWARA NAGAR MYSOREE - 570008</div>
              <div class="seller-line">ACCOUNTS DEPARTMENT - 7996222901</div>
              <div class="seller-line"><strong>GSTIN/UIN:</strong> 29APYPK6256P1ZL</div>
              <div class="seller-line">State Name : Karnataka, Code : 29</div>
              <div class="seller-line">E-Mail : hindustansawmill@gmail.com</div>
            </div>
          </div>

          <!-- Consignee (Ship to) -->
          <div class="party-box">
            <div class="party-heading">Consignee (Ship to)</div>
            <div class="party-name">New India Saw Mill</div>
            <div class="party-address">
              Sy.No.10/7 Khata No.27/2/100/10/7, Sir M<br>
              Vishveshwaraiah Layout, 3rd Block, Bengaluru, Near<br>
              Nammoora Thindi, Bengaluru Urban
            </div>
            <div class="party-meta-row">
              <span class="party-meta-label">GSTIN/UIN</span>
              <span class="party-meta-val">: 29CJZPK3158H1ZG</span>
            </div>
            <div class="party-meta-row">
              <span class="party-meta-label">State Name</span>
              <span class="party-meta-val">: Karnataka, Code : 29</span>
            </div>
          </div>

          <!-- Buyer (Bill to) -->
          <div class="party-box no-border">
            <div class="party-heading">Buyer (Bill to)</div>
            <div class="party-name">New India Saw Mill</div>
            <div class="party-address">
              Sy.No.10/7 Khata No.27/2/100/10/7, Sir M<br>
              Vishveshwaraiah Layout, 3rd Block, Bengaluru, Near<br>
              Nammoora Thindi, Bengaluru Urban
            </div>
            <div class="party-meta-row">
              <span class="party-meta-label">GSTIN/UIN</span>
              <span class="party-meta-val">: 29CJZPK3158H1ZG</span>
            </div>
            <div class="party-meta-row">
              <span class="party-meta-label">State Name</span>
              <span class="party-meta-val">: Karnataka, Code : 29</span>
            </div>
          </div>
        </div>

        <!-- Right Column: Dispatch Table -->
        <div class="right-col">
          <div class="meta-row cols-3">
            <div class="meta-cell">
              <span class="meta-label">Invoice No.</span>
              <span class="meta-val">8</span>
            </div>
            <div class="meta-cell">
              <span class="meta-label">e-Way Bill No.</span>
              <span class="meta-val"></span>
            </div>
            <div class="meta-cell">
              <span class="meta-label">Dated</span>
              <span class="meta-val">26-Oct-26</span>
            </div>
          </div>

          <div class="meta-row cols-2">
            <div class="meta-cell">
              <span class="meta-label">Delivery Note</span>
              <span class="meta-val"></span>
            </div>
            <div class="meta-cell">
              <span class="meta-label">Mode/Terms of Payment</span>
              <span class="meta-val">IMMIDIEATE PAYMENT</span>
            </div>
          </div>

          <div class="meta-row cols-2">
            <div class="meta-cell">
              <span class="meta-label">Reference No. &amp; Date.</span>
              <span class="meta-val"></span>
            </div>
            <div class="meta-cell">
              <span class="meta-label">Other References</span>
              <span class="meta-val"></span>
            </div>
          </div>

          <div class="meta-row cols-2">
            <div class="meta-cell">
              <span class="meta-label">Buyer's Order No.</span>
              <span class="meta-val"></span>
            </div>
            <div class="meta-cell">
              <span class="meta-label">Dated</span>
              <span class="meta-val"></span>
            </div>
          </div>

          <div class="meta-row cols-2">
            <div class="meta-cell">
              <span class="meta-label">Dispatch Doc No.</span>
              <span class="meta-val"></span>
            </div>
            <div class="meta-cell">
              <span class="meta-label">Delivery Note Date</span>
              <span class="meta-val"></span>
            </div>
          </div>

          <div class="meta-row cols-2">
            <div class="meta-cell">
              <span class="meta-label">Dispatched through</span>
              <span class="meta-val">ROAD</span>
            </div>
            <div class="meta-cell">
              <span class="meta-label">Destination</span>
              <span class="meta-val">BANGLORE</span>
            </div>
          </div>

          <div class="meta-row cols-2">
            <div class="meta-cell">
              <span class="meta-label">Bill of Lading/LR-RR No.</span>
              <span class="meta-val">dt. 26-Oct-26</span>
            </div>
            <div class="meta-cell">
              <span class="meta-label">Motor Vehicle No.</span>
              <span class="meta-val"></span>
            </div>
          </div>

          <div class="meta-row full" style="border-bottom:none; flex:1;">
            <div class="meta-cell">
              <span class="meta-label">Terms of Delivery</span>
              <div class="meta-val" style="white-space:pre-line; margin-top:2px; line-height:1.3;">
                TRANSPORTATION EXTRA
                APPLICABLE GST EXTRA
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Item Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 4%;">Sl<br>No.</th>
            <th style="width: 31%; text-align: left; padding-left: 8px;">Description of Goods</th>
            <th style="width: 7%;">HSN/SAC</th>
            <th style="width: 13%; text-align: right;">Alt. Quantity</th>
            <th style="width: 10%; text-align: right;">Quantity</th>
            <th style="width: 11%; text-align: right;">Rate</th>
            <th style="width: 6%;">per</th>
            <th style="width: 6%;">Disc. %</th>
            <th style="width: 12%; text-align: right; padding-right: 8px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="text-center">1</td>
            <td class="desc-cell">9X5X3 MAHAGONY</td>
            <td class="text-center">4407</td>
            <td class="text-right mono">9.3750 CFT</td>
            <td class="text-right mono">10 PCS</td>
            <td class="text-right mono">1,200.00</td>
            <td class="text-center">CFT</td>
            <td class="text-center"></td>
            <td class="text-right mono" style="padding-right:8px;">11,250.00</td>
          </tr>
          <tr>
            <td class="text-center">2</td>
            <td class="desc-cell">8X5X3 MAHAGONY</td>
            <td class="text-center">4407</td>
            <td class="text-right mono">41.6650 CFT</td>
            <td class="text-right mono">50 PCS</td>
            <td class="text-right mono">1,200.00</td>
            <td class="text-center">CFT</td>
            <td class="text-center"></td>
            <td class="text-right mono" style="padding-right:8px;">49,998.00</td>
          </tr>
          <tr>
            <td class="text-center">3</td>
            <td class="desc-cell">7X5X3 MAHAGONY</td>
            <td class="text-center">4407</td>
            <td class="text-right mono">364.5500 CFT</td>
            <td class="text-right mono">500 PCS</td>
            <td class="text-right mono">1,200.00</td>
            <td class="text-center">CFT</td>
            <td class="text-center"></td>
            <td class="text-right mono" style="padding-right:8px;">4,37,460.00</td>
          </tr>
          <tr>
            <td class="text-center">4</td>
            <td class="desc-cell">6X5X3 MAHAGONY</td>
            <td class="text-center">4407</td>
            <td class="text-right mono">15.6250 CFT</td>
            <td class="text-right mono">25 PCS</td>
            <td class="text-right mono">1,200.00</td>
            <td class="text-center">CFT</td>
            <td class="text-center"></td>
            <td class="text-right mono" style="padding-right:8px;">18,750.00</td>
          </tr>
          <tr>
            <td class="text-center">5</td>
            <td class="desc-cell">5X5X3 MAHAGONY</td>
            <td class="text-center">4407</td>
            <td class="text-right mono">13.0200 CFT</td>
            <td class="text-right mono">25 PCS</td>
            <td class="text-right mono">1,200.00</td>
            <td class="text-center">CFT</td>
            <td class="text-center"></td>
            <td class="text-right mono" style="padding-right:8px;">15,624.00</td>
          </tr>
          <tr>
            <td class="text-center">6</td>
            <td class="desc-cell">4X5X3 MAHAGONY</td>
            <td class="text-center">4407</td>
            <td class="text-right mono">31.2450 CFT</td>
            <td class="text-right mono">75 PCS</td>
            <td class="text-right mono">1,200.00</td>
            <td class="text-center">CFT</td>
            <td class="text-center"></td>
            <td class="text-right mono" style="padding-right:8px;">37,494.00</td>
          </tr>
          <tr>
            <td class="text-center">7</td>
            <td class="desc-cell">4.5X5X3 MAHAGONY</td>
            <td class="text-center">4407</td>
            <td class="text-right mono">35.1525 CFT</td>
            <td class="text-right mono">75 PCS</td>
            <td class="text-right mono">1,200.00</td>
            <td class="text-center">CFT</td>
            <td class="text-center"></td>
            <td class="text-right mono" style="padding-right:8px;">42,183.00</td>
          </tr>
          <tr>
            <td class="text-center">8</td>
            <td class="desc-cell">3.5X5X3 MAHAGONY</td>
            <td class="text-center">4407</td>
            <td class="text-right mono">9.1125 CFT</td>
            <td class="text-right mono">25 PCS</td>
            <td class="text-right mono">1,200.00</td>
            <td class="text-center">CFT</td>
            <td class="text-center"></td>
            <td class="text-right mono" style="padding-right:8px;">10,935.00</td>
          </tr>
          <tr>
            <td class="text-center">9</td>
            <td class="desc-cell">3X5X3 MAHAGONY</td>
            <td class="text-center">4407</td>
            <td class="text-right mono">4.6875 CFT</td>
            <td class="text-right mono">15 PCS</td>
            <td class="text-right mono">1,200.00</td>
            <td class="text-center">CFT</td>
            <td class="text-center"></td>
            <td class="text-right mono" style="padding-right:8px;">5,625.00</td>
          </tr>
          <tr>
            <td class="text-center">10</td>
            <td class="desc-cell">7X6X4 MAHAGONY</td>
            <td class="text-center">4407</td>
            <td class="text-right mono">34.9980 CFT</td>
            <td class="text-right mono">30 PCS</td>
            <td class="text-right mono">1,250.00</td>
            <td class="text-center">CFT</td>
            <td class="text-center"></td>
            <td class="text-right mono" style="padding-right:8px;">43,747.50</td>
          </tr>
          <tr>
            <td class="text-center">11</td>
            <td class="desc-cell">8X6X4 MAHAGONY</td>
            <td class="text-center">4407</td>
            <td class="text-right mono">39.9900 CFT</td>
            <td class="text-right mono">30 PCS</td>
            <td class="text-right mono">1,250.00</td>
            <td class="text-center">CFT</td>
            <td class="text-center"></td>
            <td class="text-right mono" style="padding-right:8px;">49,987.50</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="2" style="text-align: right; padding-right: 12px;">Total</td>
            <td></td>
            <td class="text-right mono font-bold">599.4205 CFT</td>
            <td class="text-right mono font-bold">860 PCS</td>
            <td></td>
            <td></td>
            <td></td>
            <td class="text-right mono font-bold" style="padding-right: 8px;">₹ 7,23,054.00</td>
          </tr>
        </tfoot>
      </table>

      <!-- Amount Chargeable in Words -->
      <div class="words-bar">
        <div>
          <span class="words-label">Amount Chargeable (in words)</span>
          <div class="words-text">INR Seven Lakh Twenty Three Thousand Fifty Four Only</div>
        </div>
        <div class="eoe">E. &amp; O.E</div>
      </div>

      <!-- HSN/SAC Summary Section -->
      <div class="hsn-container">
        <div class="hsn-table-wrap">
          <table class="hsn-table">
            <thead>
              <tr>
                <th>HSN/SAC</th>
                <th style="text-align: right;">Taxable<br>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>4407</td>
                <td class="mono">7,23,054.00</td>
              </tr>
              <tr class="hsn-total-row">
                <td>Total</td>
                <td class="mono">7,23,054.00</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="tax-words">
          Tax Amount (in words) : <strong>NIL</strong>
        </div>
      </div>

      <!-- Bottom Grid (Terms and Conditions removed) -->
      <div class="bottom-grid">
        
        <!-- Left: Declaration & Customer Seal/Signature -->
        <div class="bottom-left">
          <div class="declaration-box">
            <div class="decl-heading">Declaration</div>
            <div class="decl-text">
              We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
            </div>
          </div>

          <div class="cust-sign-box">
            Customer's Seal and Signature
          </div>
        </div>

        <!-- Right: Bank Details & Authorized Signatory -->
        <div class="bottom-right">
          <div class="bank-box">
            <div class="section-title">Company's Bank Details</div>
            <div class="bank-row">
              <span class="bank-lbl">A/c Holder's Name</span>
              <span class="bank-v">: HINDUSTAN SAW MILLS AND WOOD INDUSTRIES 2024-25</span>
            </div>
            <div class="bank-row">
              <span class="bank-lbl">Bank Name</span>
              <span class="bank-v">: ICICI BANK</span>
            </div>
            <div class="bank-row">
              <span class="bank-lbl">A/c No.</span>
              <span class="bank-v">: 464205000153</span>
            </div>
            <div class="bank-row">
              <span class="bank-lbl">Branch &amp; IFS Code</span>
              <span class="bank-v">: JP NAGAR &amp; ICIC0004642</span>
            </div>
          </div>

          <div class="auth-box">
            <div class="for-co">for HINDUSTAN SAW MILLS AND WOOD INDUSTRIES</div>
            <div class="sign-space"></div>
            <div class="sign-title">Authorised Signatory</div>
          </div>
        </div>

      </div>

      <!-- Footnote -->
      <div class="computer-note">
        This is a Computer Generated Invoice
      </div>

    </div>
  </div>

</body>
</html>
'''

# Write to both project root and public folder
with open('proforma_invoice_8.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

with open('public/proforma_invoice_8.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print("Generated exact 1:1 proforma_invoice_8.html successfully in both root and public directories!")
