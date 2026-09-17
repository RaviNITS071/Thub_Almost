/**
 * @file src/pages/About.jsx
 * @description Information regarding platform architecture, data synchronization with jktenders.gov.in, and engineering standards.
 */
import { Link } from 'react-router-dom';
import { Database, ArrowRight, Landmark, FileText, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function About() {
  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 py-10 sm:py-16 px-3 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        
        {/* Mission Statement Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 sm:p-10 shadow-xs space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] sm:text-xs font-semibold border border-slate-200 dark:border-slate-600">
            <Landmark className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400 shrink-0" />
            <span>Platform Background</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
            Supporting Public Procurement Transparency in Jammu &amp; Kashmir
          </h1>

          <p className="text-xs sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Public works contracts published across Jammu and Kashmir represent thousands of critical infrastructure, rural water supply, road macadamization, and power grid projects. Historically, navigating these tenders required traversing fragmented portals with short-lived session timeouts and unindexed attachments.
          </p>
          <p className="text-xs sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            TenderHub was established to provide contractors, civil engineers, and suppliers with a reliable, structured repository of official public tenders. We systematically index gazettes, verify document links, and provide clear work site clarity so local bidders can make informed decisions.
          </p>
        </div>

        {/* 3 Core Operating Standards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 sm:p-6 shadow-xs space-y-2">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 text-dalBlue dark:text-blue-400 flex items-center justify-center mb-3">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-base font-display font-bold text-slate-900 dark:text-white">
              Official Data Integrity
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Every listing maintains a direct reference back to the official Tender Reference Number and issuing government division.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xs space-y-2">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 text-chinarRed flex items-center justify-center mb-3">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-base font-display font-bold text-slate-900 dark:text-white">
              Document Archiving
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Official NIT documents and tender notices are cached to edge cloud vaults so contractors can inspect specifications without session timeouts.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xs space-y-2">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 text-emerald-600 flex items-center justify-center mb-3">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="text-base font-display font-bold text-slate-900 dark:text-white">
              Work Site Proximity
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Clear city, district, and project location details help contractors assess geographical logistics and site access requirements.
            </p>
          </div>
        </div>

        {/* CTA Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center shadow-xs">
          <div className="max-w-xl mx-auto space-y-3">
            <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
              Explore Active Tender Notices
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Browse current open notices published by the Department of Public Works (R&amp;B), Jal Shakti, and regional development authorities.
            </p>
            <div className="pt-2">
              <Link to="/tenders">
                <Button className="gap-2 text-xs font-bold py-2.5 px-5 bg-dalBlue hover:bg-dalBlue-700 text-white rounded-lg">
                  Browse Active Tenders <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}