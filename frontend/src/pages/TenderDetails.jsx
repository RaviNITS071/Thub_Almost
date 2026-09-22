/**
 * @file src/pages/TenderDetails.jsx
 * @description Comprehensive view of a single tender, directly mirroring the J&K eProcurement 
 * portal data structure with clean typography, high-contrast light mode, and official portal helper.
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, Calendar, FileText, FileSpreadsheet, IndianRupee, Heart, ExternalLink, AlertCircle, Download, Layers, CreditCard, MapPin, Map, Compass, Copy, Check, X, Info, FileClock, Eye, FolderArchive, Loader2, FileCheck } from 'lucide-react';
import JSZip from 'jszip';

import { useTender } from '@/hooks/useTenders';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { formatCurrencyINR, formatDateDisplay, formatDateTimeDisplay, extractDetailedWorkLocation } from '@/utils/formatters';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/Modal';
import { api } from '@/services/api';

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

  // In-browser ZIP extraction state
  const [isUnzipping, setIsUnzipping] = useState(false);
  const [extractedFiles, setExtractedFiles] = useState(null);
  const [unzipError, setUnzipError] = useState(null);

  const handleUnzip = async (zipUrl) => {
    if (extractedFiles) return;
    setIsUnzipping(true);
    setUnzipError(null);
    try {
      // First try fetching via backend proxy to bypass R2 CORS restrictions
      let response = null;
      const tenderId = tender?._id || id;
      if (tenderId) {
        try {
          const proxyUrl = `${api.defaults.baseURL}/tenders/${tenderId}/zip`;
          const res = await fetch(proxyUrl);
          if (res.ok) response = res;
        } catch (e) {
          // Fallback to direct fetch
        }
      }

      if (!response && zipUrl) {
        response = await fetch(zipUrl);
      }

      if (!response || !response.ok) throw new Error('Failed to fetch ZIP archive from storage');
      const blob = await response.blob();
      const zip = await JSZip.loadAsync(blob);
      const files = [];

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        const fileName = relativePath.split('/').pop();
        if (!fileName || fileName.startsWith('.') || fileName.startsWith('__MACOSX')) continue;

        const fileBlob = await zipEntry.async('blob');
        const fileUrl = URL.createObjectURL(fileBlob);
        const sizeKb = Math.round(fileBlob.size / 1024);

        const lowerName = fileName.toLowerCase();
        let fileType = 'ATTACHMENT';
        if (lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) fileType = 'BOQ';
        else if (lowerName.endsWith('.pdf')) fileType = 'PDF';
        else if (lowerName.endsWith('.dwg') || lowerName.endsWith('.dxf')) fileType = 'DRAWING';
        else if (lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) fileType = 'DOC';

        files.push({
          name: fileName,
          sizeKb,
          url: fileUrl,
          type: fileType
        });
      }

      setExtractedFiles(files);
    } catch (err) {
      setUnzipError(err.message || 'Failed to extract zip archive.');
    } finally {
      setIsUnzipping(false);
    }
  };

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

  // Consolidate all official NIT / Tender Notice documents
  const nitDocs = (tender.nitDocuments && tender.nitDocuments.length > 0)
    ? tender.nitDocuments
    : (tender.pdfUrls || []).map((url, idx) => ({
        documentName: `Tendernotice_${idx + 1}.pdf`,
        description: `Official Tender Notice Document ${idx + 1}`,
        documentSizeKb: null,
        fileUrl: url,
      }));

  // Consolidate all work item documents extracted from Zip archives (legacy support)
  const workDocs = [...(tender.workItemDocuments || [])];
  if (tender.boqFileUrl && !tender.boqZipUrl && !tender.boqFileUrl.toLowerCase().endsWith('.zip') && !workDocs.some(d => d.fileUrl === tender.boqFileUrl)) {
    workDocs.unshift({
      documentType: 'BOQ',
      documentName: 'BOQ_Schedule.xls',
      description: 'BOQ Work Schedule (Extracted from Zip Archive)',
      documentSizeKb: null,
      fileUrl: tender.boqFileUrl,
    });
  }

  const zipUrl = tender.boqZipUrl || (tender.boqFileUrl && tender.boqFileUrl.toLowerCase().endsWith('.zip') ? tender.boqFileUrl : null);
  const totalDocsCount = nitDocs.length + (zipUrl ? (extractedFiles ? extractedFiles.length : 1) : workDocs.length);

  // Filter out any leaked documents, notices, dates or navbar elements from offline payment instruments
  const genuineInstruments = (tender.offlineInstruments || []).filter(inst => {
    if (!inst || !inst.instrumentType) return false;
    const name = String(inst.instrumentType).trim();
    if (name.length < 3) return false;
    // Exclude dates (e.g. 20-Sep-2026)
    if (/\d{1,2}-[a-z]{3}-\d{4}/i.test(name)) return false;
    // Exclude navbar, notice, corrigendum, boq, drawing keywords
    if (name.includes('Search') || name.includes('Active Tenders') || name.includes('Results of Tenders') || name.includes('Corrigendum')) return false;
    if (/^(tendernotice|notice|nit|boq|corrigendum|tender documents|work item|drawing|sbd|other document)/i.test(name)) return false;
    if (name.toLowerCase().includes('other document') || name.toLowerCase().includes('tendernotice') || name.toLowerCase().includes('.pdf') || name.toLowerCase().includes('.xls')) return false;
    return true;
  });

  // Filter out leaked navbar items from covers information
  const genuineCovers = (tender.coversInfo || []).filter(cover => {
    if (!cover) return false;
    const type = String(cover.coverType || '').trim();
    const docType = String(cover.documentType || '').trim();
    const desc = String(cover.description || '').trim();
    // Exclude dates and navbar
    if (/\d{1,2}-[a-z]{3}-\d{4}/i.test(type) || /\d{1,2}-[a-z]{3}-\d{4}/i.test(desc)) return false;
    if (type.includes('Search') || type.includes('Active Tenders') || desc.includes('Search') || desc.includes('Active Tenders') || desc.includes('Corrigendum')) return false;
    if (type.toLowerCase().includes('other document') && !desc) return false;
    return true;
  });

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
                  {(totalDocsCount === 0 || tender.isDocumentAvailable === false) && (
                    <span className="text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1" title={(tender.documentDownloadStartDateStr || tender.documentDownloadStartDate) ? `Documents available on ${formatDateTimeDisplay(tender.documentDownloadStartDateStr || tender.documentDownloadStartDate)}` : 'Pending portal release'}>
                      <FileClock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      <span>Docs Available: {(tender.documentDownloadStartDateStr || tender.documentDownloadStartDate) ? formatDateTimeDisplay(tender.documentDownloadStartDateStr || tender.documentDownloadStartDate) : 'Pending Release'}</span>
                    </span>
                  )}
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

        {/* Multi-Work Tenders Alert & Navigation */}
        {tender.relatedTenders && tender.relatedTenders.length > 0 && (
          <div className="bg-gradient-to-r from-amber-50/80 via-orange-50/60 to-amber-50/80 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-2xl p-4 sm:p-5 shadow-xs mb-6">
            <div className="flex items-start gap-3 sm:gap-3.5">
              <div className="p-2.5 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded-xl shrink-0 mt-0.5 shadow-xs">
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      Multiple Works Detected for this NIT
                    </h3>
                    <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/80 px-2 py-0.5 rounded-full">
                      {tender.relatedTenders.length + 1} Total Works
                    </span>
                  </div>
                  {(tender.tenderReferenceNumber || tender.baseTenderId) && (
                    <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 bg-white/90 dark:bg-slate-800/90 px-2.5 py-0.5 rounded border border-amber-200 dark:border-amber-700/80">
                      Ref: {tender.tenderReferenceNumber || tender.baseTenderId}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 mb-3.5">
                  This tender is part of a multi-work contract notice issued by the department. Each work item has its own distinct scope, BOQ, and estimated budget. Explore the other works under this notice below:
                </p>

                {/* Sibling Works Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tender.relatedTenders.map((sibling) => (
                    <div 
                      key={sibling._id || sibling.sourceTenderId}
                      onClick={() => navigate(`/tenders/${sibling._id || sibling.sourceTenderId}`)}
                      className="group/work flex flex-col justify-between p-3.5 bg-white dark:bg-slate-800/90 border border-amber-200/80 dark:border-slate-700 rounded-xl hover:border-dalBlue dark:hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-mono text-xs font-bold text-dalBlue dark:text-blue-300 group-hover/work:underline">
                            {sibling.sourceTenderId}
                          </span>
                          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/50">
                            {sibling.estimatedValue ? formatCurrencyINR(sibling.estimatedValue) : 'Value N/A'}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed">
                          {sibling.title}
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                        <span>Pub: {formatDateDisplay(sibling.publishedDate || sibling.publishedDateStr)}</span>
                        <span className="flex items-center gap-1 text-xs font-bold text-dalBlue dark:text-blue-400 group-hover/work:translate-x-0.5 transition-transform">
                          View Work <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

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
                  <DataRow label="Withdrawal Allowed" value={tender.withdrawalAllowed} />
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
                  <DataRow label="Multi Currency Fee" value={tender.isMultiCurrencyAllowedForFee} />
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
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Portal Location</span>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5 block truncate" title={tender.location}>
                    {tender.location || 'As specified in NIT'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs border-t border-slate-100 dark:border-slate-700 pt-3">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Bid Opening Office:</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{tender.bidOpeningPlace && tender.bidOpeningPlace !== 'NA' ? tender.bidOpeningPlace : 'N/A'}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Pre-Bid Meeting:</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                    {tender.preBidMeetingAddress && tender.preBidMeetingAddress !== 'NA' 
                      ? tender.preBidMeetingAddress 
                      : (tender.preBidMeetingPlace && tender.preBidMeetingPlace !== 'NA' 
                          ? tender.preBidMeetingPlace 
                          : 'No Pre-Bid Meeting Scheduled')}
                  </p>
                </div>
              </div>
            </section>

            {/* Payment Instruments & Covers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-xs">
                <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white mb-3 border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-slate-500 shrink-0" /> Payment Instruments
                </h3>
                {genuineInstruments.length > 0 ? (
                  <div className="overflow-x-auto filter-scrollbar -mx-1 px-1">
                    <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 min-w-[240px]">
                      <thead className="bg-slate-50 dark:bg-slate-900 text-[10px] uppercase text-slate-500 border-y border-slate-100 dark:border-slate-700">
                        <tr>
                          <th className="px-2.5 py-1.5">S.No</th>
                          <th className="px-2.5 py-1.5">Instrument Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {genuineInstruments.map((inst, idx) => (
                          <tr key={idx} className="border-b border-slate-100 dark:border-slate-700/60">
                            <td className="px-2.5 py-1.5 font-mono">{inst.sNo || idx + 1}</td>
                            <td className="px-2.5 py-1.5 font-medium">{inst.instrumentType}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : tender.paymentMode === 'Offline' ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Offline payment mode (acceptable instruments: Demand Draft / Bank Guarantee / CDR / FDR as per NIT).</p>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Online payment mode (e-Payment / Net Banking / RTGS / NEFT).</p>
                )}
              </section>

              <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-xs">
                <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white mb-3 border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-slate-500 shrink-0" /> Covers Information
                  <span className="text-[11px] text-slate-400 font-normal ml-auto">
                    No. of Covers: {tender.noOfCovers || 2}
                  </span>
                </h3>
                {genuineCovers.length > 0 ? (
                  <div className="overflow-x-auto filter-scrollbar -mx-1 px-1">
                    <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 min-w-[340px]">
                      <thead className="bg-slate-50 dark:bg-slate-900 text-[10px] uppercase text-slate-500 border-y border-slate-100 dark:border-slate-700">
                        <tr>
                          <th className="px-2.5 py-1.5 w-12">Cover</th>
                          <th className="px-2.5 py-1.5 w-32">Cover Type</th>
                          <th className="px-2.5 py-1.5">Description</th>
                          <th className="px-2.5 py-1.5 w-24">Doc Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {genuineCovers.map((cover, idx) => (
                          <tr key={idx} className="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                            <td className="px-2.5 py-2 font-mono font-bold text-slate-900 dark:text-white">{cover.coverNo || idx + 1}</td>
                            <td className="px-2.5 py-2 font-medium">{cover.coverType || 'Fee/PreQual/Technical'}</td>
                            <td className="px-2.5 py-2 text-slate-600 dark:text-slate-300 font-normal leading-relaxed">{cover.description || 'Document requirement as per NIT'}</td>
                            <td className="px-2.5 py-2 font-mono uppercase font-bold text-dalBlue dark:text-blue-400">{cover.documentType}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                    <p>Standard {tender.noOfCovers || 2}-cover bidding system:</p>
                    <ul className="list-disc list-inside text-[11px] text-slate-600 dark:text-slate-300">
                      <li>Cover 1: Fee / Pre-Qualification / Technical (.pdf)</li>
                      <li>Cover 2: Finance / BOQ Schedule (.xls)</li>
                    </ul>
                  </div>
                )}
              </section>
            </div>

            {/* Other Important Documents List (Mandatory Bidder Checklist) */}
            {tender.otherImportantDocuments && tender.otherImportantDocuments.length > 0 && (
              <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-xs">
                <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white mb-3 border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> Other Important Documents List
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    {tender.otherImportantDocuments.length} Mandatory Document(s)
                  </span>
                </h3>
                <div className="overflow-x-auto filter-scrollbar -mx-1 px-1">
                  <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 min-w-[500px]">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-[10px] uppercase text-slate-500 border-y border-slate-100 dark:border-slate-700">
                      <tr>
                        <th className="px-2.5 py-1.5 w-12">S.No</th>
                        <th className="px-2.5 py-1.5 w-36">Category</th>
                        <th className="px-2.5 py-1.5 w-48">Sub Category</th>
                        <th className="px-2.5 py-1.5">Sub Category Description</th>
                        <th className="px-2.5 py-1.5 w-24">Format/File</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tender.otherImportantDocuments.map((doc, idx) => (
                        <tr key={idx} className="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                          <td className="px-2.5 py-2 font-mono font-bold text-slate-900 dark:text-white">{doc.sNo || idx + 1}</td>
                          <td className="px-2.5 py-2 font-medium">{doc.category}</td>
                          <td className="px-2.5 py-2 font-semibold text-slate-900 dark:text-white">{doc.subCategory}</td>
                          <td className="px-2.5 py-2 text-slate-600 dark:text-slate-300 font-normal leading-relaxed">{doc.description}</td>
                          <td className="px-2.5 py-2 font-mono text-[11px] text-slate-500">{doc.format || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            
            {/* Work Item Details */}
            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xs">
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-white mb-3 border-b border-slate-100 dark:border-slate-700 pb-2.5">
                Work Item Details
              </h3>
              
              <div className="space-y-3 mb-4">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Title</span>
                  <p className="text-xs sm:text-sm text-slate-900 dark:text-slate-100 font-semibold leading-relaxed">
                    {tender.title}
                  </p>
                </div>
                {tender.workDescription && tender.workDescription !== tender.title && (
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Work Description</span>
                    <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                      {tender.workDescription}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <div className="space-y-0.5">
                  <DataRow 
                    label="Tender Value in ₹" 
                    value={
                      <span className="font-mono font-bold text-dalBlue dark:text-blue-300">
                        {formatCurrencyINR(tender.estimatedValue)}
                        {tender.estimatedValue ? ` (${tender.estimatedValue.toLocaleString('en-IN')})` : ''}
                      </span>
                    } 
                  />
                  <DataRow label="Product Category" value={tender.productCategory} />
                  <DataRow label="Sub category" value={tender.subCategory} />
                  <DataRow label="Contract Type" value={tender.contractType} />
                  <DataRow label="Location" value={tender.location || 'As specified in NIT'} />
                  <DataRow label="Pincode" value={<span className="font-mono">{tender.pincode || 'N/A'}</span>} />
                  <DataRow label="Tenderer Class" value={tender.tendererClass} />
                  <DataRow label="NDA/Pre Qualification" value={tender.ndaPreQualification} />
                  <DataRow label="Independent External Monitor/Remarks" value={tender.independentExternalMonitorRemarks} />
                </div>
                <div className="space-y-0.5">
                  <DataRow label="Bid Validity(Days)" value={<span className="font-mono">{tender.bidValidityDays ? `${tender.bidValidityDays}` : 'N/A'}</span>} />
                  <DataRow label="Period Of Work(Days)" value={<span className="font-mono">{tender.periodOfWorkDays ? `${tender.periodOfWorkDays} Days` : 'N/A'}</span>} />
                  <DataRow 
                    label="Pre Bid Meeting Date" 
                    value={
                      tender.preBidMeetingPlace === 'NA' || !tender.preBidMeetingDate
                        ? 'NA' 
                        : <span className="font-mono">{formatDateTimeDisplay(parseDate(tender.preBidMeetingDate))}</span>
                    } 
                  />
                  <DataRow label="Pre Bid Meeting Place" value={tender.preBidMeetingPlace} />
                  <DataRow label="Pre Bid Meeting Address" value={tender.preBidMeetingAddress} />
                  <DataRow label="Bid Opening Place" value={tender.bidOpeningPlace} />
                  <DataRow label="Should Allow NDA Tender" value={tender.shouldAllowNDATender} />
                  <DataRow label="Allow Preferential Bidder" value={tender.allowPreferentialBidder} />
                </div>
              </div>
            </section>

            {/* Tender Inviting Authority */}
            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 sm:p-6 shadow-xs">
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-white mb-3 border-b border-slate-100 dark:border-slate-700 pb-2.5 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-dalBlue dark:text-blue-400" /> Tender Inviting Authority
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Designation / Inviting Officer
                  </span>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    {tender.invitingAuthorityName || 'Competent Authority / Executive Engineer'}
                  </p>
                </div>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Office Address / Jurisdiction
                  </span>
                  <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200">
                    {tender.invitingAuthorityAddress || tender.location || 'As specified in tender notice'}
                  </p>
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
                    <p>Fee Exemption: <strong className={tender.tenderFeeExemptionAllowed === 'Yes' ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-300'}>{tender.tenderFeeExemptionAllowed || 'No'}</strong></p>
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
                    <p>Payable At: <strong className="text-slate-700 dark:text-slate-300">{tender.emdPayableAt || 'N/A'}</strong></p>
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
                  <span className="text-slate-800 dark:text-slate-200 font-semibold">{formatDateTimeDisplay(tender.publishedDateStr || tender.publishedDate)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-sans text-[10px] font-semibold uppercase text-slate-500">Download Start</span>
                  <span className="text-slate-800 dark:text-slate-200">{formatDateTimeDisplay(tender.documentDownloadStartDateStr || tender.documentDownloadStartDate)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-sans text-[10px] font-semibold uppercase text-slate-500">Download End</span>
                  <span className="text-slate-800 dark:text-slate-200">{formatDateTimeDisplay(tender.documentDownloadEndDateStr || tender.documentDownloadEndDate)}</span>
                </div>
                {(tender.clarificationStartDateStr || tender.clarificationStartDate) && tender.clarificationStartDate !== 'NA' && (
                  <div className="flex justify-between py-1">
                    <span className="font-sans text-[10px] font-semibold uppercase text-slate-500">Clarification Start</span>
                    <span className="text-slate-800 dark:text-slate-200">{formatDateTimeDisplay(tender.clarificationStartDateStr || tender.clarificationStartDate)}</span>
                  </div>
                )}
                {(tender.clarificationEndDateStr || tender.clarificationEndDate) && tender.clarificationEndDate !== 'NA' && (
                  <div className="flex justify-between py-1">
                    <span className="font-sans text-[10px] font-semibold uppercase text-slate-500">Clarification End</span>
                    <span className="text-slate-800 dark:text-slate-200">{formatDateTimeDisplay(tender.clarificationEndDateStr || tender.clarificationEndDate)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 bg-emerald-50 dark:bg-emerald-950/30 px-2 rounded">
                  <span className="font-sans text-[10px] font-semibold uppercase text-emerald-800 dark:text-emerald-300">Bid Start</span>
                  <span className="text-emerald-800 dark:text-emerald-300 font-bold">{formatDateTimeDisplay(tender.bidSubmissionStartDateStr || tender.bidSubmissionStartDate)}</span>
                </div>
                <div className="flex justify-between py-1 bg-red-50 dark:bg-red-950/30 px-2 rounded">
                  <span className="font-sans text-[10px] font-semibold uppercase text-red-800 dark:text-red-300">Bid End</span>
                  <span className="text-red-800 dark:text-red-300 font-bold">{formatDateTimeDisplay(tender.bidSubmissionEndDateStr || tender.bidSubmissionEndDate)}</span>
                </div>
                <div className="flex justify-between py-1 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <span className="font-sans text-[10px] font-semibold uppercase text-slate-500">Bid Opening</span>
                  <span className="text-dalBlue dark:text-blue-400 font-bold">{formatDateTimeDisplay(tender.bidOpeningDateStr || tender.bidOpeningDate)}</span>
                </div>
              </div>
            </section>

            {/* Official Documents & Attachments Section */}
            <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2.5 mb-3.5">
                <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-dalBlue dark:text-blue-400" />
                  <span>Tender Documents &amp; Attachments</span>
                </h3>
                {totalDocsCount > 0 ? (
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-dalBlue dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    {totalDocsCount} {totalDocsCount === 1 ? 'file' : 'files'}
                  </span>
                ) : (
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Pending Release
                  </span>
                )}
              </div>
              
              <div className="space-y-4">
                {/* 1. Official Tender Notices & Corrigenda */}
                {nitDocs.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-chinarRed shrink-0" />
                        <span>Tender Notices &amp; Corrigenda ({nitDocs.length})</span>
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">PDF Format</span>
                    </div>

                    <div className="space-y-2">
                      {nitDocs.map((doc, index) => {
                        const docName = doc.documentName || `Tendernotice_${index + 1}.pdf`;
                        const sizeStr = doc.documentSizeKb 
                          ? (doc.documentSizeKb >= 1024 
                              ? `${(doc.documentSizeKb / 1024).toFixed(1)} MB` 
                              : `${doc.documentSizeKb} KB`)
                          : null;

                        return (
                          <div 
                            key={index} 
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/60 hover:border-dalBlue dark:hover:border-blue-500 transition-all"
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/50 text-chinarRed border border-red-200/80 dark:border-red-900/50 flex items-center justify-center shrink-0">
                                <FileText className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate" title={docName}>
                                  {docName}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {doc.description || `Notice Inviting Tender #${index + 1}`}
                                  {sizeStr && <span className="ml-1.5 font-mono text-slate-400">• {sizeStr}</span>}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                              <a 
                                href={doc.fileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-dalBlue hover:bg-dalBlue/90 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-xs transition-all cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View Notice</span>
                              </a>
                              <a 
                                href={doc.fileUrl} 
                                download={docName}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
                                title="Download Notice"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}                {/* 2. Work Item Documents & BOQ Archive (.zip) */}
                {zipUrl && (
                  <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <FolderArchive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>Work Item Documents &amp; BOQ Package</span>
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Direct ZIP Archive</span>
                    </div>

                    {/* Main ZIP Download & Action Card */}
                    <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-400 transition-all space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5 overflow-hidden min-w-0">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800 mt-0.5 sm:mt-0">
                            <FolderArchive className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate" title={tender.zipFileName || 'Work_Documents_and_BOQ.zip'}>
                                {tender.zipFileName || 'Work_Documents_and_BOQ.zip'}
                              </p>
                              <span className="text-[9px] font-sans font-bold px-1.5 py-0.2 rounded uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                                ZIP Archive
                              </span>
                              {tender.zipFileSizeKb && (
                                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                                  {tender.zipFileSizeKb >= 1024 
                                    ? `${(tender.zipFileSizeKb / 1024).toFixed(1)} MB` 
                                    : `${tender.zipFileSizeKb} KB`}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                              Contains official BOQ spreadsheets (.xls/.xlsx), technical drawings, and work specifications.
                            </p>
                          </div>
                        </div>

                        {/* Action Buttons: Direct ZIP Download + Unzip in Browser */}
                        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                          <a
                            href={zipUrl}
                            download={tender.zipFileName || 'Work_Documents_and_BOQ.zip'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-xs transition-all cursor-pointer"
                            title="Directly download the complete .zip file"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download ZIP</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => handleUnzip(zipUrl)}
                            disabled={isUnzipping}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                              extractedFiles
                                ? 'bg-emerald-100/60 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                          >
                            {isUnzipping ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                                <span>Unpacking...</span>
                              </>
                            ) : extractedFiles ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Unpacked ({extractedFiles.length} files)</span>
                              </>
                            ) : (
                              <>
                                <FolderArchive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Inspect &amp; Unzip Files</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Information note explaining on-demand unzipping */}
                      {!extractedFiles && !isUnzipping && (
                        <div className="flex items-start gap-2 p-2 rounded-lg bg-white/70 dark:bg-slate-900/50 border border-emerald-100 dark:border-emerald-900/40 text-[11px] text-slate-600 dark:text-slate-400">
                          <Info className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>
                            Looking for individual files without downloading the full archive? Click <strong>&quot;Inspect &amp; Unzip Files&quot;</strong> to unpack and download specific BOQ Excel sheets or PDFs directly in your browser. (Note: Extraction may take a few moments depending on archive size).
                          </span>
                        </div>
                      )}

                      {/* Unzipping In-Progress Loader */}
                      {isUnzipping && (
                        <div className="flex items-center justify-center gap-2.5 p-3 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-slate-700 dark:text-slate-300">
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400" />
                          <span>Unpacking archive contents in your browser... Please wait a moment.</span>
                        </div>
                      )}

                      {/* Unzip Error Message */}
                      {unzipError && (
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-chinarRed dark:text-red-300">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{unzipError}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setExtractedFiles(null); handleUnzip(zipUrl); }}
                            className="underline font-bold text-xs hover:text-red-800 cursor-pointer"
                          >
                            Retry
                          </button>
                        </div>
                      )}

                      {/* Extracted Files Explorer List */}
                      {extractedFiles && extractedFiles.length > 0 && (
                        <div className="pt-2 border-t border-emerald-200/80 dark:border-emerald-900/50 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Extracted Files Available for Download ({extractedFiles.length})</span>
                            </span>
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase">Ready in Browser</span>
                          </div>

                          <div className="space-y-1.5">
                            {extractedFiles.map((file, idx) => {
                              const isXls = file.type === 'BOQ';
                              const isPdf = file.type === 'PDF';

                              return (
                                <div
                                  key={idx}
                                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border bg-white dark:bg-slate-900/80 transition-all ${
                                    isXls
                                      ? 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-400'
                                      : isPdf
                                      ? 'border-blue-200 dark:border-blue-800 hover:border-blue-400'
                                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                                    <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                                      isXls
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                        : isPdf
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                    }`}>
                                      {isXls ? <FileSpreadsheet className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                                    </div>

                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate" title={file.name}>
                                          {file.name}
                                        </p>
                                        <span className={`text-[9px] font-sans font-bold px-1.5 py-0.2 rounded uppercase ${
                                          isXls 
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' 
                                            : isPdf 
                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' 
                                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                        }`}>
                                          {file.type}
                                        </span>
                                      </div>
                                      {file.sizeKb > 0 && (
                                        <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                          {file.sizeKb >= 1024 ? `${(file.sizeKb / 1024).toFixed(1)} MB` : `${file.sizeKb} KB`}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                                    {isPdf && (
                                      <a
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all cursor-pointer"
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>View</span>
                                      </a>
                                    )}
                                    <a
                                      href={file.url}
                                      download={file.name}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                                        isXls
                                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                                      }`}
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>{isXls ? 'Download BOQ' : 'Download'}</span>
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Legacy Extracted Work Item Documents Fallback (for older data) */}
                {!zipUrl && workDocs.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <FolderArchive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>Work Item Documents &amp; Attachments ({workDocs.length})</span>
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Extracted Files</span>
                    </div>

                    <div className="space-y-2">
                      {workDocs.map((doc, index) => {
                        const docName = doc.documentName || `Document_${index + 1}`;
                        const lowerName = docName.toLowerCase();
                        const isXls = lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx') || doc.documentType === 'BOQ';
                        const isPdf = lowerName.endsWith('.pdf') || doc.documentType === 'TECHNICAL_DOCUMENT';
                        const sizeStr = doc.documentSizeKb 
                          ? (doc.documentSizeKb >= 1024 
                              ? `${(doc.documentSizeKb / 1024).toFixed(1)} MB` 
                              : `${doc.documentSizeKb} KB`)
                          : null;

                        return (
                          <div 
                            key={index} 
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border transition-all ${
                              isXls 
                                ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/20 hover:border-emerald-400' 
                                : isPdf 
                                ? 'border-blue-200 dark:border-blue-800/70 bg-blue-50/50 dark:bg-blue-950/20 hover:border-blue-400'
                                : 'border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/60 hover:border-slate-400'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                                isXls 
                                  ? 'bg-emerald-100/70 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800' 
                                  : isPdf
                                  ? 'bg-blue-100/70 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800'
                                  : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                              }`}>
                                {isXls ? <FileSpreadsheet className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate" title={docName}>
                                    {docName}
                                  </p>
                                  <span className={`text-[9px] font-sans font-bold px-1.5 py-0.2 rounded uppercase ${
                                    isXls 
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' 
                                      : isPdf 
                                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' 
                                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                  }`}>
                                    {doc.documentType || (isXls ? 'BOQ' : isPdf ? 'Drawing/Spec' : 'Attachment')}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {doc.description || (isXls ? 'BOQ Work Schedule' : 'Enclosed Document from Zip Archive')}
                                  {sizeStr && <span className="ml-1.5 font-mono text-slate-400">• {sizeStr}</span>}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                              {isPdf ? (
                                <>
                                  <a 
                                    href={doc.fileUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-all cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>View Document</span>
                                  </a>
                                  <a 
                                    href={doc.fileUrl} 
                                    download={docName}
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
                                    title="Download File"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                </>
                              ) : isXls ? (
                                <a 
                                  href={doc.fileUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  download={docName}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-xs transition-all cursor-pointer"
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5" />
                                  <span>Download BOQ (.xls)</span>
                                </a>
                              ) : (
                                <a 
                                  href={doc.fileUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  download={docName}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition-all cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Download File</span>
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Fallback when no documents yet released */}
                {totalDocsCount === 0 && (
                  <div className="p-4 sm:p-5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 text-slate-800 dark:text-slate-200 space-y-3.5 shadow-xs">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 border border-amber-200 dark:border-amber-800">
                        <FileClock className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                          Tender Documents Not Available Yet
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                          Official tender documents (NIT notice, drawings, specifications, and BOQ schedule) have not been released by the department on the portal yet.
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-white/90 dark:bg-slate-900/80 border border-amber-200/80 dark:border-amber-900/60 space-y-1">
                      <span className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                        Document Availability Schedule
                      </span>
                      <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200">
                        {tender.documentDownloadStartDate ? (
                          <>
                            The documents will be available on{' '}
                            <strong className="font-mono text-dalBlue dark:text-blue-300 font-bold">
                              {formatDateTimeDisplay(parseDate(tender.documentDownloadStartDate))}
                            </strong>
                          </>
                        ) : (
                          'The documents will be available as soon as released on the official portal.'
                        )}
                      </p>
                    </div>

                    <div className="pt-1">
                      <Button 
                        onClick={handleOpenPortalModal}
                        className="w-full gap-1.5 bg-dalBlue hover:bg-dalBlue-700 text-white text-xs font-semibold py-2.5 shadow-xs"
                      >
                        Check Status on Official Portal <ExternalLink className="w-3.5 h-3.5" />
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