import React, { useEffect, useState, useMemo } from 'react';
import { FileDown, Printer, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { dbService } from '../services/db';
import { exportSheetToPdf, printProformaInvoicePdf, type ProformaInvoiceExportData } from '../utils/exportPdf';
import { PrintableProformaInvoice } from './PrintableProformaInvoice';
import { formatIndianCurrency } from '../utils/indianNumberWords';
import { calculateTotals, getCutLogItemSectionHeading, getCutLogItemDescription, sortTimberEntries } from '../utils/calculator';
import type { BusinessSettings, MeasurementSheet } from '../types';

interface PublicInvoicePageProps {
  sheetId: string;
  businessSettings: BusinessSettings;
}

export const PublicInvoicePage: React.FC<PublicInvoicePageProps> = ({
  sheetId,
  businessSettings
}) => {
  const [sheet, setSheet] = useState<MeasurementSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadedNotice, setDownloadedNotice] = useState(false);

  useEffect(() => {
    let active = true;
    const loadInvoice = async () => {
      setLoading(true);
      try {
        const fetched = await dbService.getPublicSheetById(sheetId);
        if (!active) return;
        if (!fetched) {
          setError('Invoice could not be found or may have been deleted.');
        } else {
          setSheet(fetched);
        }
      } catch (err) {
        console.error('Failed to load shared invoice:', err);
        if (active) setError('Unable to load the requested invoice. Please check your connection.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadInvoice();
    return () => { active = false; };
  }, [sheetId]);

  const resolvedExportData: ProformaInvoiceExportData | undefined = useMemo(() => {
    if (!sheet) return undefined;
    if (sheet.proformaExportData) {
      return sheet.proformaExportData as ProformaInvoiceExportData;
    }

    const rateDefault = businessSettings?.ratePerCft || 1400;
    const computed = calculateTotals(sheet.items || []);
    const isRoundLog = sheet.logType === 'round';
    const roundLogOutputUnit = sheet.roundLogOutputUnit || 'CFT';

    const cutInvoiceItems = sortTimberEntries(sheet.items || []).map((it, idx) => {
      const itWood = (it.woodType || '').toUpperCase();
      const isPly = it.itemCategory === 'plywood' || itWood.includes('PLYWOOD');
      const isReady = it.itemCategory === 'ready_board' || itWood.includes('READY');
      const isSheet = (isPly || isReady) && it.itemCategory !== 'timber';
      const unit: 'CFT' | 'SQFT' | 'PCS' = it.rateUnit || (isSheet ? 'SQFT' : 'CFT');
      const qty = unit === 'SQFT' ? it.sqft : unit === 'PCS' ? (typeof it.pieces === 'number' ? it.pieces : 0) : it.cft;
      const rate = typeof it.rate === 'number' ? it.rate : rateDefault;
      const amt = typeof it.amount === 'number' ? it.amount : Math.round(qty * rate * 100) / 100;
      const woodHeading = getCutLogItemSectionHeading(it);

      return {
        slNo: idx + 1,
        description: isSheet ? getCutLogItemDescription({ ...it, woodType: woodHeading }) : `${it.lengthFeet}X${it.widthInches}X${it.thicknessInches} ${woodHeading}`,
        woodType: woodHeading,
        hsn: isSheet ? '4412' : '4407',
        cft: it.cft || 0,
        sqft: it.sqft || 0,
        widthInches: it.widthInches || 0,
        rateUnit: unit,
        pieces: Number(it.pieces) || 0,
        rate,
        per: unit,
        discPercent: '',
        amount: amt
      };
    });

    const roundInvoiceItems = (sheet.roundLogItems || []).map((it, idx) => ({
      slNo: idx + 1,
      description: `Log ${it.serialNumber || idx + 1}: ${it.girthFtInStr ? `G: ${it.girthFtInStr}` : `G: ${it.girth}"`} × L: ${it.length}'${it.slabLabel ? ` [${it.slabLabel}]` : ''}`,
      woodType: it.woodType || 'ROUND LOG',
      hsn: '4403',
      cft: roundLogOutputUnit === 'CFT' ? (it.volume || 0) : (it.cft || (it.volume || 0) * 35.3147),
      pieces: Number(it.pieces) || 1,
      rate: typeof it.rate === 'number' ? it.rate : 0,
      per: roundLogOutputUnit,
      discPercent: '',
      amount: it.amount || 0
    }));

    const effectiveTotal = sheet.finalGrandTotal || computed.totalCft * rateDefault;

    return {
      voucherType: sheet.voucherType || 'sales',
      customerName: sheet.customerName || undefined,
      logType: sheet.logType || 'cut',
      roundLogOutputUnit: sheet.roundLogOutputUnit,
      roundLogInputUnit: sheet.roundLogInputUnit,
      roundLogItems: sheet.roundLogItems,
      roundLogSlabRates: sheet.roundLogSlabRates,
      invoiceNo: sheet.referenceNumber ? sheet.referenceNumber.replace('REF-', '') : '8',
      invoiceDate: sheet.measurementDate,
      paymentTerms: sheet.paymentTerms,
      buyerOrderNo: sheet.buyerOrderNo,
      buyerOrderDate: sheet.buyerOrderDate,
      destination: sheet.destination || sheet.consigneeDistrict || sheet.customerState || 'Karnataka',
      motorVehicleNo: sheet.motorVehicleNo,
      termsOfDelivery: sheet.termsOfDelivery,
      consigneeName: sheet.consigneeName || sheet.customerName || '',
      consigneePhone: sheet.consigneePhone || sheet.customerPhone || '',
      consigneeAddress: sheet.consigneeAddress || sheet.customerAddress || '',
      consigneeGstin: sheet.consigneeGstin || sheet.customerGstin || '',
      consigneeState: sheet.consigneeState || sheet.customerState || 'Karnataka',
      consigneeStateCode: sheet.consigneeStateCode || sheet.customerStateCode || '29',
      buyerName: sheet.customerName || sheet.consigneeName || '',
      buyerPhone: sheet.customerPhone || sheet.consigneePhone || '',
      buyerAddress: sheet.customerAddress || sheet.consigneeAddress || '',
      buyerGstin: sheet.customerGstin || sheet.consigneeGstin || '',
      buyerState: sheet.customerState || sheet.consigneeState || 'Karnataka',
      buyerStateCode: sheet.customerStateCode || sheet.consigneeStateCode || '29',
      additionalCharges: sheet.additionalCharges,
      discountAmount: sheet.discount?.amount || 0,
      discountDesc: sheet.discount?.type === 'percentage' ? `${sheet.discount.value}%` : undefined,
      gstPercent: sheet.gstPercent,
      finalGrandTotal: effectiveTotal,
      items: isRoundLog ? roundInvoiceItems : cutInvoiceItems
    };
  }, [sheet, businessSettings]);

  const handleDownloadPdf = () => {
    if (!sheet || !resolvedExportData) return;
    exportSheetToPdf(sheet, businessSettings, resolvedExportData);
    setDownloadedNotice(true);
    setTimeout(() => setDownloadedNotice(false), 3500);
  };

  const handlePrint = () => {
    if (!sheet || !resolvedExportData) return;
    printProformaInvoicePdf(sheet, businessSettings, resolvedExportData);
  };

  if (loading) {
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
        padding: '1.5rem'
      }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: '#38bdf8',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '1rem'
        }} />
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Loading Your Invoice PDF...</h2>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.84rem', color: '#94a3b8' }}>
          Hindustan Saw Mill &amp; Wood Industries
        </p>
      </div>
    );
  }

  if (error || !sheet || !resolvedExportData) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1.5rem',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <div style={{
          maxWidth: '420px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 25px rgba(0,0,0,0.06)'
        }}>
          <AlertCircle size={42} color="#dc2626" style={{ margin: '0 auto 0.75rem' }} />
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
            Invoice Unavailable
          </h2>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', lineHeight: 1.5 }}>
            {error || 'This invoice link is invalid or has expired.'}
          </p>
        </div>
      </div>
    );
  }

  const grandTotal = resolvedExportData.finalGrandTotal || sheet.finalGrandTotal || 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top Action Header Bar (Hidden when printing) */}
      <div className="no-print" style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: '#0f172a',
        color: '#ffffff',
        padding: '0.85rem 1.25rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <div style={{
          maxWidth: '960px',
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8'
            }}>
              <FileText size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                {businessSettings.companyName}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#cbd5e1' }}>
                Invoice #{resolvedExportData.invoiceNo} &bull; {sheet.customerName || 'Valued Customer'} &bull; <strong>₹{formatIndianCurrency(grandTotal)}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleDownloadPdf}
              style={{
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.6rem 1.15rem',
                fontSize: '0.88rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)'
              }}
            >
              <FileDown size={17} />
              <span>Download PDF Invoice</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              style={{
                backgroundColor: '#334155',
                color: '#ffffff',
                border: '1px solid #475569',
                borderRadius: '8px',
                padding: '0.6rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Printer size={16} />
              <span>Print</span>
            </button>
          </div>
        </div>

        {downloadedNotice && (
          <div style={{
            maxWidth: '960px',
            margin: '0.5rem auto 0',
            padding: '0.45rem 0.75rem',
            backgroundColor: '#166534',
            color: '#ffffff',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}>
            <CheckCircle2 size={14} /> Proforma Invoice PDF downloaded successfully!
          </div>
        )}
      </div>

      {/* Rendered Invoice Document */}
      <div style={{ padding: '1rem 0.5rem 2.5rem', overflowX: 'auto' }}>
        <div style={{ maxWidth: '840px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
          <PrintableProformaInvoice
            businessSettings={businessSettings}
            voucherType={resolvedExportData.voucherType}
            invoiceNo={resolvedExportData.invoiceNo}
            eWayBillNo={resolvedExportData.eWayBillNo}
            invoiceDate={resolvedExportData.invoiceDate}
            deliveryNote={resolvedExportData.deliveryNote}
            paymentTerms={resolvedExportData.paymentTerms}
            refNoAndDate={resolvedExportData.refNoAndDate}
            otherReferences={resolvedExportData.otherReferences}
            buyerOrderNo={resolvedExportData.buyerOrderNo}
            buyerOrderDate={resolvedExportData.buyerOrderDate}
            dispatchDocNo={resolvedExportData.dispatchDocNo}
            deliveryNoteDate={resolvedExportData.deliveryNoteDate}
            dispatchedThrough={resolvedExportData.dispatchedThrough}
            destination={resolvedExportData.destination}
            billOfLadingNo={resolvedExportData.billOfLadingNo}
            motorVehicleNo={resolvedExportData.motorVehicleNo}
            termsOfDelivery={resolvedExportData.termsOfDelivery}
            consigneeName={resolvedExportData.consigneeName}
            consigneePhone={resolvedExportData.consigneePhone}
            consigneeAddress={resolvedExportData.consigneeAddress}
            consigneeGstin={resolvedExportData.consigneeGstin}
            consigneeState={resolvedExportData.consigneeState}
            consigneeStateCode={resolvedExportData.consigneeStateCode}
            buyerName={resolvedExportData.buyerName}
            buyerPhone={resolvedExportData.buyerPhone}
            buyerAddress={resolvedExportData.buyerAddress}
            buyerGstin={resolvedExportData.buyerGstin}
            buyerState={resolvedExportData.buyerState}
            buyerStateCode={resolvedExportData.buyerStateCode}
            logType={sheet.logType}
            roundLogOutputUnit={sheet.roundLogOutputUnit}
            roundLogInputUnit={sheet.roundLogInputUnit}
            roundLogItems={sheet.roundLogItems}
            roundLogSlabRates={sheet.roundLogSlabRates}
            items={sheet.items}
            ratePerCft={businessSettings.ratePerCft}
            additionalCharges={sheet.additionalCharges}
            discountAmount={resolvedExportData.discountAmount}
            discountDesc={resolvedExportData.discountDesc}
            gstPercent={sheet.gstPercent}
            gstTaxableBase={resolvedExportData.gstTaxableBase}
            gstAmount={resolvedExportData.gstAmount}
            finalGrandTotal={grandTotal}
          />
        </div>
      </div>
    </div>
  );
};
