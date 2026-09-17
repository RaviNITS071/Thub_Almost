/**
 * @file src/pages/TenderDetails.jsx
 * @description Comprehensive view of a single tender, directly mirroring the J&K eProcurement 
 * portal data structure with clean typography, high-contrast light mode, and official portal helper.
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Calendar, FileText, IndianRupee, Heart, ExternalLink, AlertCircle, Download, Layers, CreditCard, MapPin, Map, Compass, Copy, Check, X, Info, FileClock } from 'lucide-react';

import { useTender } from '@/hooks/useTenders';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { formatCurrencyINR, formatDateDisplay, extractDetailedWorkLocation } from '@/utils/formatters';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/Modal';

// Helper to handle MongoDB's {"$date": "..."} format, raw strings, and "NA" fallbacks
const parseDate = (dateField) => {
  if (!dateField || dateField === 'NA' || dateField === 'N/A') return null;
  const dateStr = typeof dateField === 'object' && dateField.$date ? dateField.$date : dateField;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return null; 
  return dateStr;
};

// Reusable Data Row for standardized tables
const DataRow = ({ label, value }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 py-2 border-b border-slate-100 dark:border-slate-700/60 last:border-0 gap-1 sm:gap-3 text-xs">
    <span className="font-semibold text-slate-500 dark:text-slate-400">{label}</span>
    <span className="font-medium text-slate-800 dark:text-slate-200 break-words">
      {value === 'NA' || !value ? 'N/A' : value}
    </span>
  </div>
);

export default function TenderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: tender, isLoading, isError } = useTender(id);
  const { toggleBookmark, isBookmarked } = useBookmarkStore();
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const copyToClipboard = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleOpenPortalModal = () => {
    if (tender?.sourceTenderId) {
      copyToClipboard(tender.sourceTenderId, 'tenderId');
    }
    setIsPortalModalOpen(true);
  };

  if (isLoading) return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-3 border-dalBlue border-t-transparent animate-spin" />
    </div>
  );

  if (isError || !tender) return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 flex flex-col items-center justify-center text-center p-4">
      <AlertCircle className="w-12 h-12 text-chinarRed mb-3" />
      <h2 className="text-xl font-bold font-display text-slate-900 dark:text-white">Tender Not Found</h2>
      <Button onClick={() => navigate('/tenders')} className="mt-3 text-xs">Back to Directory</Button>
    </div>
  );

  const bookmarked = isBookmarked(tender._id || tender.sourceTenderId);
  const orgParts = (tender.organisationChain || '').split('||').map(p => p.trim());
  const primaryOrg = orgParts[0] || tender.department;
  const workLoc = extractDetailedWorkLocation(tender);

  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 py-6 sm:py-8 px-3 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-6xl mx-auto space-y-5 sm:space-y-6">
        
        {/* Navigation & Header */}
        <div>
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-dalBlue dark:hover:text-white mb-3 sm:mb-4 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Directory
          </button>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-6 shadow-xs relative">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-dalBlue dark:text-blue-300 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    ID: {tender.sourceTenderId}
                  </span>
                  <span className="text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    {tender.status || 'Active'}
                  </span>
                </div>
                
                <h1 className="text-xl sm:text-2xl font-bold font-display text-slate-900 dark:text-white leading-snug">
                  {tender.title?.replace(/[[\]]/g, '')}
                </h1>

                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate max-w-[320px]">{primaryOrg}</span>
                  </div>

                  {/* Specific Work Location Badge in Header */}
                  <div className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    <MapPin className="w-3.5 h-3.5 text-chinarRed shrink-0" />
                    <span>Site: <strong>{workLoc.famousLocation}</strong></span>
                    {workLoc.pincode && workLoc.pincode !== 'N/A' && (
                      <span className="font-mono text-[10px] text-slate-500">PIN {workLoc.pincode}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row md:flex-col gap-2 sm:gap-2.5 w-full md:w-auto shrink-0">
                <Button 
                  onClick={() => toggleBookmark(tender)}
                  variant={bookmarked ? "outline" : "default"}
                  className={`w-full text-xs font-bold py-2 sm:py-2.5 ${
                    bookmarked 
                      ? 'border-red-200 text-chinarRed hover:bg-red-50 dark:hover:bg-red-950/40' 
                      : 'bg-dalBlue hover:bg-dalBlue-700 text-white'
                  }`}
                >
                  <Heart className={`w-4 h-4 mr-1.5 ${bookmarked ? 'fill-current text-chinarRed' : ''}`} />
                  {bookmarked ? 'Saved' : 'Save Tender'}
                </Button>
                
                <Button 
                  onClick={handleOpenPortalModal}
                  variant="outline" 
                  className="w-full gap-1.5 text-xs font-semibold py-2 sm:py-2.5"
                >
                  Original Portal <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main 2-Span Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Basic Details Section */}
            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xs">
              <h2 className="text-base font-bold font-display text-slate-900 dark:text-white mb-3 border-b border-slate-100 dark:border-slate-700 pb-2.5 flex items-center gap-2">
                <FileText className="w-4 h-4 text-dalBlue dark:text-blue-400" /> Basic Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <div className="space-y-0.5">
                  <DataRow label="Organisation Chain" value={tender.organisationChain?.replace(/\|\|/g, ' > ')} />
                  <DataRow label="Tender Reference Number" value={tender.tenderReferenceNumber} />
                  <DataRow label="Tender ID" value={tender.sourceTenderId} />
                  <DataRow label="Tender Type" value={tender.tenderType} />
                  <DataRow label="Tender Category" value={tender.tenderCategory} />
                  <DataRow label="Technical Evaluation" value={tender.generalTechnicalEvaluationAllowed} />
                </div>
                <div className="space-y-0.5">
                  <DataRow label="Payment Mode" value={tender.paymentMode} />
                  <DataRow label="Form Of Contract" value={tender.formOfContract} />
                  <DataRow label="No. of Covers" value={tender.noOfCovers} />
                  <DataRow label="ItemWise Tech Eval" value={tender.itemWiseTechnicalEvaluationAllowed} />
                  <DataRow label="Multi Currency BOQ" value={tender.isMultiCurrencyAllowedForBOQ} />
                  <DataRow label="Two Stage Bidding" value={tender.allowTwoStageBidding} />
                </div>
              </div>
            </section>

            {/* Work Execution Location Box */}
            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-chinarRed flex items-center justify-center shrink-0 border border-red-100 dark:border-red-900">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold font-display text-slate-900 dark:text-white">
                      Work Execution Location
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Geographic execution site and administrative jurisdiction
                    </p>
                  </div>
                </div>

                <a
                  href={workLoc.mapSearchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-dalBlue dark:text-blue-300 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shrink-0"
                >
                  <Map className="w-3.5 h-3.5 text-chinarRed" />
                  <span>Google Maps</span>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              </div>

              {/* Specific Project Site Text */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700 mb-4">
                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1 flex items-center gap-1">
                  <Compass className="w-3 h-3" /> Project Site / Area Description
                </span>
                <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
                  {workLoc.specificSite || 'Execution site as specified in tender document.'}
                </p>
              </div>

              {/* Geographic Coordinates Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block mb-0.5">District / City</span>
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-chinarRed shrink-0" />
                    {workLoc.famousLocation}, J&amp;K
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block mb-0.5">Postal Pincode</span>
                  <span className="text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white">
                    {workLoc.pincode}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block mb-0.5">Portal Location</span>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate block">
                    {workLoc.rawLocation || 'Refer to Notice'}
                  </span>
                </div>
              </div>

              {/* Office Details */}
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-400 block mb-0.5">Bid Opening Office:</span>
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{workLoc.bidOpeningPlace}</span>
                </div>
                {workLoc.preBidMeetingPlace && (
                  <div>
                    <span className="font-semibold text-slate-400 block mb-0.5">Pre-Bid Meeting:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{workLoc.preBidMeetingPlace}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Payment Instruments & Covers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-xs">
                <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white mb-3 border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-slate-500 shrink-0" /> Payment Instruments
                </h3>
                {tender.paymentMode === 'Offline' && tender.offlineInstruments?.length > 0 ? (
                  <div className="overflow-x-auto filter-scrollbar -mx-1 px-1">
                    <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 min-w-[240px]">
                      <thead className="bg-slate-50 dark:bg-slate-900 text-[10px] uppercase text-slate-500 border-y border-slate-100 dark:border-slate-700">
                        <tr>
                          <th className="px-2.5 py-1.5">S.No</th>
                          <th className="px-2.5 py-1.5">Instrument Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tender.offlineInstruments.map((inst, idx) => (
                          <tr key={idx} className="border-b border-slate-100 dark:border-slate-700/60">
                            <td className="px-2.5 py-1.5 font-mono">{inst.sNo}</td>
                            <td className="px-2.5 py-1.5">{inst.instrumentType}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Online payment mode or no offline instruments specified.</p>
                )}
              </section>

              <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-xs">
                <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white mb-3 border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-slate-500 shrink-0" /> Covers Information
                </h3>
                <div className="overflow-x-auto filter-scrollbar -mx-1 px-1">
                  <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 min-w-[260px]">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-[10px] uppercase text-slate-500 border-y border-slate-100 dark:border-slate-700">
                      <tr>
                        <th className="px-2.5 py-1.5">No</th>
                        <th className="px-2.5 py-1.5">Type</th>
                        <th className="px-2.5 py-1.5">Document</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tender.coversInfo?.map((cover, idx) => (
                        <tr key={idx} className="border-b border-slate-100 dark:border-slate-700/60">
                          <td className="px-2.5 py-1.5 font-mono">{cover.coverNo}</td>
                          <td className="px-2.5 py-1.5">{cover.coverType || 'Fee/PreQual/Technical'}</td>
                          <td className="px-2.5 py-1.5 font-mono uppercase font-bold text-dalBlue dark:text-blue-400">{cover.documentType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            
            {/* Work Item Description */}
            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xs">
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-white mb-3 border-b border-slate-100 dark:border-slate-700 pb-2.5">
                Work Item Details
              </h3>
              
              <div className="mb-4 p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Scope &amp; Description</span>
                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                  {tender.workDescription || tender.title}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <div className="space-y-0.5">
                  <DataRow label="Tender Value" value={<span className="font-mono font-bold text-dalBlue dark:text-blue-300">{formatCurrencyINR(tender.estimatedValue)}</span>} />
                  <DataRow label="Product Category" value={tender.productCategory} />
                  <DataRow label="Sub Category" value={tender.subCategory} />
                  <DataRow label="Contract Type" value={tender.contractType} />
                  <DataRow label="Location" value={`${workLoc.famousLocation} (${tender.location || 'As specified in NIT'})`} />
                </div>
                <div className="space-y-0.5">
                  <DataRow label="Bid Validity (Days)" value={<span className="font-mono">{tender.bidValidityDays}</span>} />
                  <DataRow label="Period Of Work" value={<span className="font-mono">{tender.periodOfWorkDays ? `${tender.periodOfWorkDays} Days` : 'N/A'}</span>} />
                  <DataRow label="Pre-Bid Meeting Date" value={<span className="font-mono">{formatDateDisplay(parseDate(tender.preBidMeetingDate))}</span>} />
                  <DataRow label="Bid Opening Place" value={tender.bidOpeningPlace} />
                </div>
              </div>
            </section>

          </div>

          {/* Right Column: Financials, Dates & Documents */}
          <div className="space-y-6">
            
            {/* Tender Fee & EMD Details */}
            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-xs">
              <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white mb-4 border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-1.5">
                <IndianRupee className="w-4 h-4 text-dalBlue dark:text-blue-400" /> Fee &amp; EMD Details
              </h3>
              
              <div className="space-y-4">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Tender Fee</span>
                  <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">{formatCurrencyINR(tender.tenderFee)}</span>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                    <p>Payable To: <strong className="text-slate-700 dark:text-slate-300">{tender.feePayableTo || 'N/A'}</strong></p>
                    <p>Payable At: <strong className="text-slate-700 dark:text-slate-300">{tender.feePayableAt || 'N/A'}</strong></p>
                  </div>
                </div>
                
                <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                  <span className="block text-[10px] font-bold uppercase text-slate-400">EMD Deposit</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold font-mono text-chinarRed">{formatCurrencyINR(tender.emdAmount)}</span>
                    <span className="text-xs text-slate-500">({tender.emdFeeType || 'Fixed'})</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                    <p>Payable To: <strong className="text-slate-700 dark:text-slate-300">{tender.emdPayableTo || 'N/A'}</strong></p>
                    <p>Exemption: <strong className={tender.emdExemptionAllowed === 'Yes' ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-300'}>{tender.emdExemptionAllowed || 'No'}</strong></p>
                  </div>
                </div>
              </div>
            </section>

            {/* Critical Dates Section */}
            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-xs">
              <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white mb-3 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-700 pb-2">
                <Calendar className="w-4 h-4 text-chinarRed" /> Critical Dates
              </h3>
              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between py-1">
                  <span className="font-sans text-[10px] font-semibold uppercase text-slate-500">Published</span>
                  <span className="text-slate-800 dark:text-slate-200">{formatDateDisplay(parseDate(tender.publishedDate))}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-sans text-[10px] font-semibold uppercase text-slate-500">Download Start</span>
                  <span className="text-slate-800 dark:text-slate-200">{formatDateDisplay(parseDate(tender.documentDownloadStartDate))}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-sans text-[10px] font-semibold uppercase text-slate-500">Download End</span>
                  <span className="text-slate-800 dark:text-slate-200">{formatDateDisplay(parseDate(tender.documentDownloadEndDate))}</span>
                </div>
                <div className="flex justify-between py-1 bg-emerald-50 dark:bg-emerald-950/30 px-2 rounded">
                  <span className="font-sans text-[10px] font-semibold uppercase text-emerald-800 dark:text-emerald-300">Bid Start</span>
                  <span className="text-emerald-800 dark:text-emerald-300 font-bold">{formatDateDisplay(parseDate(tender.bidSubmissionStartDate))}</span>
                </div>
                <div className="flex justify-between py-1 bg-red-50 dark:bg-red-950/30 px-2 rounded">
                  <span className="font-sans text-[10px] font-semibold uppercase text-red-800 dark:text-red-300">Bid End</span>
                  <span className="text-red-800 dark:text-red-300 font-bold">{formatDateDisplay(parseDate(tender.bidSubmissionEndDate))}</span>
                </div>
                <div className="flex justify-between py-1 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <span className="font-sans text-[10px] font-semibold uppercase text-slate-500">Bid Opening</span>
                  <span className="text-dalBlue dark:text-blue-400 font-bold">{formatDateDisplay(parseDate(tender.bidOpeningDate))}</span>
                </div>
              </div>
            </section>

            {/* Official NIT Documents Section */}
            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-xs">
              <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white mb-3 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-700 pb-2">
                <Download className="w-4 h-4 text-slate-500" /> Tender Documents
              </h3>
              
              <div className="space-y-2.5">
                {tender.pdfUrls && tender.pdfUrls.length > 0 ? (
                  tender.pdfUrls.map((pdfStr, index) => (
                    <div key={index} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <FileText className="w-5 h-5 text-chinarRed shrink-0" />
                        <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 truncate">Tendernotice_{index + 1}.pdf</span>
                      </div>
                      <a href={pdfStr} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="h-7 text-[11px] font-semibold">
                          View PDF
                        </Button>
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 text-slate-700 dark:text-slate-300 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <FileClock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300">
                          Official NIT PDF Pending Release
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                          Document downloads had not yet commenced at time of portal synchronization.
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Download Begins:</span>
                      <span className="font-mono font-bold">
                        {formatDateDisplay(parseDate(tender.documentDownloadStartDate)) || 'Refer to portal'}
                      </span>
                    </div>

                    <div className="pt-1">
                      <Button 
                        onClick={handleOpenPortalModal}
                        className="w-full gap-1.5 bg-dalBlue hover:bg-dalBlue-700 text-white text-xs font-semibold py-2"
                      >
                        Search on Official Portal <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </section>

          </div>
        </div>
      </div>

      {/* Official Portal Helper Dialog */}
      <Dialog open={isPortalModalOpen} onClose={() => setIsPortalModalOpen(false)}>
        <DialogContent className="p-0 overflow-hidden max-w-lg w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-2xl">
          <div className="bg-dalBlue p-4 sm:p-5 text-white relative shrink-0">
            <button
              onClick={() => setIsPortalModalOpen(false)}
              className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-lg cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 mb-1 text-amber-300 text-xs font-bold uppercase">
              <ExternalLink className="w-3.5 h-3.5" /> Official Government Portal
            </div>
            <DialogTitle className="text-base sm:text-lg font-bold text-white">
              Access Notice on JK eProcurement
            </DialogTitle>
            <DialogDescription className="text-white/80 text-xs mt-0.5">
              jktenders.gov.in (Government of Jammu and Kashmir)
            </DialogDescription>
          </div>

          <div className="p-4 sm:p-5 space-y-3.5 text-xs overflow-y-auto filter-scrollbar flex-1">
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong className="text-amber-900 dark:text-amber-300 block mb-0.5">Direct Session Timeout Note</strong>
                Direct GePNIC links time out after 10–15 minutes on NIC servers. Using the pre-copied Tender ID below guarantees access.
              </div>
            </div>

            {/* Pre-copied Tender ID Card */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
              <div className="overflow-hidden">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Tender ID (Copied to Clipboard)
                </span>
                <span className="font-mono text-xs sm:text-sm font-bold text-dalBlue dark:text-blue-400 select-all truncate block">
                  {tender.sourceTenderId}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(tender.sourceTenderId, 'tenderId')}
                className="gap-1 text-xs shrink-0"
              >
                {copiedField === 'tenderId' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>

            {/* Quick 3-step Instructions */}
            <div className="py-1">
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block mb-1.5">
                Instructions
              </span>
              <ol className="space-y-1 text-slate-600 dark:text-slate-300 list-decimal list-inside">
                <li>Tender ID is already in your clipboard.</li>
                <li>Click <strong>&quot;Open Portal Search&quot;</strong> below.</li>
                <li>Paste into <strong>Tender ID</strong> field and click Search.</li>
              </ol>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <a
                href="https://jktenders.gov.in/nicgep/app?page=FrontEndAdvancedSearch&service=page"
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button className="w-full gap-1.5 bg-dalBlue hover:bg-dalBlue-700 text-white font-bold py-2 text-xs">
                  Open Portal Search <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>

              <div className="text-center">
                <a
                  href="https://jktenders.gov.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-dalBlue text-xs underline"
                >
                  Visit JK Tenders Homepage
                </a>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}