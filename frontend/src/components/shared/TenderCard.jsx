/**
 * @file src/components/shared/TenderCard.jsx
 * @description Clean, human-crafted tender notice card with high legibility,
 * clear submission timeline, financial metrics, and district location tag.
 */
import { useNavigate } from 'react-router-dom';
import { Clock, MapPin, Heart, ArrowRight, FileSpreadsheet, Building2, Calendar, FileText } from 'lucide-react';

import { formatCurrencyINR, formatDateDisplay, formatDateTimeDisplay, extractFamousLocation } from '@/utils/formatters';
import { useBookmarkStore } from '@/store/useBookmarkStore';

export function TenderCard({ tender }) {
  const { toggleBookmark, isBookmarked } = useBookmarkStore();
  const navigate = useNavigate();
  
  const tenderId = tender._id || tender.sourceTenderId;
  const bookmarked = isBookmarked(tenderId);
  
  // Extract department hierarchy
  const orgParts = (tender.organisationChain || '').split('||').map((p) => p.trim());
  const issuingDept = orgParts[0] || tender.department || 'Government Authority';
  const subDept = orgParts.length > 1 ? orgParts[orgParts.length - 1] : '';

  // Calculate days remaining to bid submission deadline
  const calculateDaysLeft = (closingDateStr) => {
    if (!closingDateStr) return null;
    const diff = new Date(closingDateStr).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };
  const daysLeft = calculateDaysLeft(tender.bidSubmissionEndDate?.$date || tender.closingDate);

  const isCritical = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
  const isWarning = daysLeft !== null && daysLeft > 3 && daysLeft <= 7;

  return (
    <article className="group bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 hover:border-dalBlue dark:hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 rounded-2xl p-4 sm:p-6 shadow-xs transition-all duration-200 flex flex-col justify-between focus-within:border-dalBlue dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-dalBlue/20 dark:focus-within:ring-blue-400/20">
      
      {/* Header Row: Tender ID, Authority & Save Heart */}
      <div>
        <div className="flex items-start justify-between gap-2.5 mb-2 sm:mb-2.5">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="font-mono text-[11px] sm:text-xs font-semibold text-dalBlue dark:text-blue-300 bg-slate-100 dark:bg-slate-900 group-hover:bg-blue-50/60 dark:group-hover:bg-blue-950/40 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 group-hover:border-dalBlue/30 transition-colors shrink-0">
              {tender.sourceTenderId || tender.tenderReferenceNumber || 'NIT-ACTIVE'}
            </span>

            <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[140px] xs:max-w-[200px] sm:max-w-[280px]" title={issuingDept}>
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{issuingDept}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => toggleBookmark(tender)}
            className={`p-1.5 rounded-xl border transition-all shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-chinarRed ${
              bookmarked
                ? 'bg-red-50 border-red-200 text-chinarRed dark:bg-red-950/40 dark:border-red-800 shadow-xs'
                : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-chinarRed hover:border-chinarRed/50 hover:bg-red-50/50 dark:hover:bg-red-950/20 bg-white dark:bg-slate-800'
            }`}
            title={bookmarked ? 'Remove from Saved' : 'Save this Tender'}
            aria-label="Bookmark Tender"
          >
            <Heart className={`w-4 h-4 transition-transform active:scale-125 ${bookmarked ? 'fill-current text-chinarRed' : ''}`} />
          </button>
        </div>

        {/* Title */}
        <h3 
          onClick={() => navigate(`/tenders/${tenderId}`)}
          className="text-sm sm:text-base lg:text-lg font-display font-bold text-slate-900 dark:text-white group-hover:text-dalBlue dark:group-hover:text-blue-300 hover:underline decoration-dalBlue/30 underline-offset-2 transition-colors leading-snug line-clamp-2 cursor-pointer mb-1.5"
        >
          {tender.title?.replace(/[[\]]/g, '') || 'Tender Notice'}
        </h3>

        {/* Sub-header: Division & Published Time */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-2 sm:mb-2.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
          {subDept && (
            <span className="truncate max-w-[260px] font-normal">
              Division: <span className="font-medium text-slate-700 dark:text-slate-300">{subDept}</span>
            </span>
          )}
          {subDept && (tender.publishedDate || tender.createdAt) && (
            <span className="text-slate-300 dark:text-slate-600 hidden xs:inline">•</span>
          )}
          {(tender.publishedDate || tender.createdAt) && (
            <span className="inline-flex items-center gap-1 font-normal text-slate-600 dark:text-slate-300 shrink-0">
              <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Published:</span>
              <strong className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                {formatDateTimeDisplay(tender.publishedDate || tender.createdAt)}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* Middle Financials & Timeline Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 py-2.5 sm:py-3 my-2.5 sm:my-3 border-y border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-900/40 rounded-xl px-3 sm:px-3.5">
        <div>
          <span className="block text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider truncate">
            Estimated Value
          </span>
          <span className="font-mono text-xs sm:text-sm lg:text-base font-bold text-dalBlue dark:text-blue-300 truncate block">
            {formatCurrencyINR(tender.estimatedValue)}
          </span>
        </div>

        <div>
          <span className="block text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider truncate">
            EMD Deposit
          </span>
          <div className="flex flex-wrap items-center gap-1 font-mono text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
            <span className="truncate">{formatCurrencyINR(tender.emdAmount)}</span>
            {tender.emdExemptionAllowed === 'Yes' && (
              <span className="text-[9px] font-sans text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/50 px-1 py-0.2 rounded border border-emerald-200 dark:border-emerald-800 shrink-0" title="Exemption Allowed">
                Exempt
              </span>
            )}
          </div>
        </div>

        <div>
          <span className="block text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider truncate">
            Published Time
          </span>
          <span className="font-mono text-[11px] sm:text-xs lg:text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 truncate" title={formatDateTimeDisplay(tender.publishedDate || tender.createdAt)}>
            <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">{formatDateTimeDisplay(tender.publishedDate || tender.createdAt)}</span>
          </span>
        </div>

        <div>
          <span className="block text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider truncate">
            Closing Date
          </span>
          <span className="font-mono text-[11px] sm:text-xs lg:text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 truncate">
            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{formatDateDisplay(tender.bidSubmissionEndDate?.$date || tender.closingDate)}</span>
          </span>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <span className="block text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider truncate">
            Status
          </span>
          {daysLeft !== null && daysLeft >= 0 ? (
            <span className={`inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-2 py-0.5 rounded truncate ${
              isCritical
                ? 'text-red-700 bg-red-50 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900'
                : isWarning
                ? 'text-amber-800 bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900'
                : 'text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
            }`}>
              <Clock className="w-3 h-3 shrink-0" />
              <span className="truncate">{daysLeft === 0 ? 'Closes Today' : `${daysLeft} days left`}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 truncate">
              Closed
            </span>
          )}
        </div>
      </div>

      {/* Bottom Row: Location, Category & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Famous Location */}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] sm:text-xs font-medium border border-slate-200 dark:border-slate-700">
            <MapPin className="w-3 h-3 text-chinarRed shrink-0" />
            <span className="truncate max-w-[130px] sm:max-w-[170px]" title={extractFamousLocation(tender)}>
              {extractFamousLocation(tender)}
            </span>
          </span>

          {/* Category */}
          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] sm:text-xs font-medium truncate max-w-[130px] sm:max-w-[180px]">
            {tender.productCategory || tender.tenderCategory || 'Works'}
          </span>

          {/* Multiple Notices Tag */}
          {((tender.nitDocuments?.length > 1) || (tender.pdfUrls?.length > 1)) && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-50 dark:bg-red-950/40 text-chinarRed dark:text-red-300 text-[10px] font-mono font-semibold rounded border border-red-200 dark:border-red-800" title={`${tender.nitDocuments?.length || tender.pdfUrls?.length} Official Notices Available`}>
              <FileText className="w-3 h-3 shrink-0" />
              <span>{tender.nitDocuments?.length || tender.pdfUrls?.length} Notices</span>
            </span>
          )}

          {/* BOQ / Work Item Documents Badge */}
          {(tender.boqZipUrl || tender.boqFileUrl || tender.workItemDocuments?.length > 0 || tender.coversInfo?.some((c) => c.documentType === '.xls')) && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-semibold rounded border border-emerald-200 dark:border-emerald-800" title="BOQ & Work Documents Archive">
              <FileSpreadsheet className="w-3 h-3 shrink-0" />
              <span>{tender.boqZipUrl ? 'BOQ ZIP' : (tender.workItemDocuments?.length > 1 ? `${tender.workItemDocuments.length} Work Docs` : 'BOQ')}</span>
            </span>
          )}
        </div>

        <div className="w-full sm:w-auto">
          <button
            type="button"
            onClick={() => navigate(`/tenders/${tenderId}`)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-dalBlue hover:bg-chinarRed text-white rounded-xl transition-all duration-150 shadow-xs hover:shadow-md hover:ring-2 hover:ring-chinarRed/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-chinarRed cursor-pointer group/btn"
          >
            <span>View Notice</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" />
          </button>
        </div>
      </div>

    </article>
  );
}