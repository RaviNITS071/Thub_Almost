/**
 * @file src/pages/Home.jsx
 * @description Classical, human-crafted public procurement portal for Jammu & Kashmir.
 * Features real-time statistics, authentic public works search, continuous moving carousel
 * of active department & sectoral feeds, and recent tender announcements.
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Search, 
  ArrowRight, 
  Landmark, 
  Building2, 
  Calendar, 
  IndianRupee, 
  MapPin, 
  FileText, 
  ArrowUpRight,
  Sparkles,
  Clock
} from 'lucide-react';

import { PreferenceModal } from '@/components/shared/PreferenceModal';
import { Button } from '@/components/ui/Button';
import { useTenderStats } from '@/hooks/useTenders';
import { formatCurrencyINR, formatDateDisplay, formatDateTimeDisplay } from '@/utils/formatters';

// Common regional sectors and districts for quick access
const quickLocations = [
  { label: 'Civil Works', query: 'Civil Works' },
  { label: 'Jal Shakti / PHE', query: 'Jal Shakti' },
  { label: 'PMGSY Roads', query: 'Roads' },
  { label: 'Electrical Works', query: 'Electrical Works' },
  { label: 'Baramulla', query: 'Baramulla' },
  { label: 'Srinagar', query: 'Srinagar' },
  { label: 'Bandipora', query: 'Bandipora' },
  { label: 'Anantnag', query: 'Anantnag' },
];

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  // Fetch real aggregated database statistics from backend
  const { data: stats, isLoading: isStatsLoading } = useTenderStats();

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/tenders?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate(`/tenders`);
    }
  };

  const handleQuickClick = (query) => {
    navigate(`/tenders?search=${encodeURIComponent(query)}`);
  };

  // Construct dynamic department cards from real live database metrics
  const departmentCards = (stats?.departmentBreakdown || []).map((dept) => ({
    title: dept.shortName.replace(/^(District\s+|Department\s+of\s+)/i, ''),
    subtitle: dept.rootOrg.includes('AGRICULTURE') 
      ? 'Agriculture Dept' 
      : dept.rootOrg.includes('DC-PDD') 
      ? 'Power Dept (PDD)' 
      : dept.rootOrg,
    count: `${dept.count} Active ${dept.count === 1 ? 'Notice' : 'Notices'}`,
    value: formatCurrencyINR(dept.totalValue),
    type: 'department',
    query: { organisation: dept.rootOrg, department: dept.shortName }
  }));

  // Construct dynamic domain/category cards from real live database metrics
  const domainCards = (stats?.domainBreakdown || []).map((domain) => ({
    title: domain.name,
    subtitle: 'Classified Work Sector',
    count: `${domain.count} Active ${domain.count === 1 ? 'Notice' : 'Notices'}`,
    value: formatCurrencyINR(domain.totalValue),
    type: 'category',
    query: { category: domain.name }
  }));

  // Fallback items based on real database records in case stats are still initialising
  const fallbackItems = [
    { title: 'District Baramulla Agriculture', subtitle: 'Agriculture Dept', count: '5 Active Notices', value: '₹16.09 Lakh', query: { department: 'Department of Agriculture District Baramulla' } },
    { title: 'Civil Works', subtitle: 'Civil Infrastructure', count: '14 Active Notices', value: '₹75.08 Lakh', query: { category: 'Civil Works' } },
    { title: 'CIRCLE II-Srinagar', subtitle: 'Power Dept (PDD)', count: '2 Active Notices', value: '₹12.00 Lakh', query: { department: 'CIRCLE II-Srinagar' } },
    { title: 'Electrical Works', subtitle: 'Transmission & Grid', count: '7 Active Notices', value: '₹2.01 Cr', query: { category: 'Electrical Works' } },
    { title: 'Soil Conservation Anantnag/Kulgam', subtitle: 'Agriculture Dept', count: '3 Active Notices', value: '₹43.19 Lakh', query: { department: 'Asstt Soil Conservation Officer Anantnag/Kulgam' } },
    { title: 'STD-II Jammu', subtitle: 'Power Dept (PDD)', count: '2 Active Notices', value: '₹1.19 Cr', query: { department: 'STD-II Jammu' } },
    { title: 'Water Equipments & Boring', subtitle: 'PHE & Jal Shakti', count: '4 Active Notices', value: 'Refer BOQ', query: { category: 'Water Equipments/ Meter/ Drilling/ Boring' } },
    { title: 'HADP / JKCIP Directorate', subtitle: 'Agriculture Mission', count: '8 Active Notices', value: 'Refer BOQ / Rate Contract', query: { department: 'Mission Directorate HADP' } }
  ];

  const rawCarousel = (departmentCards.length > 0 || domainCards.length > 0)
    ? [...departmentCards, ...domainCards]
    : fallbackItems;

  // Duplicate the array to achieve seamless, continuous infinite ticker loop
  const carouselItems = [...rawCarousel, ...rawCarousel];

  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <PreferenceModal />

      {/* Hero Section: Classical, Dignified & Authentic */}
      <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 pt-8 sm:pt-12 pb-12 sm:pb-16 px-3 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center space-y-4 sm:space-y-6">
          
          {/* Official Badge */}
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] sm:text-xs font-semibold border border-slate-200 dark:border-slate-700 max-w-full truncate">
            <Landmark className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400 shrink-0" />
            <span className="truncate">Jammu &amp; Kashmir Public Works &amp; e-Procurement</span>
          </div>

          {/* Primary Headline */}
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-display font-black text-dalBlue dark:text-white tracking-tight leading-tight">
            Explore Government Tenders Across Jammu &amp; Kashmir
          </h1>

          {/* Subtitle */}
          <p className="text-xs sm:text-base text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed font-normal">
            Track published civil infrastructure, irrigation, road works, electrical supplies, and municipal contracts across all 20 districts with verified official tender documents.
          </p>

          {/* Search Console */}
          <form 
            onSubmit={handleSearch}
            className="max-w-2xl mx-auto mt-4 sm:mt-6 flex flex-col sm:flex-row items-stretch sm:items-center bg-white dark:bg-slate-800 rounded-2xl p-1.5 sm:p-2 border border-slate-300 dark:border-slate-700 shadow-sm focus-within:border-dalBlue dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-dalBlue/10 transition-all gap-1.5 sm:gap-2"
          >
            <div className="flex items-center flex-1 px-2.5 py-1 min-w-0">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 shrink-0 mr-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tender name, department, or district..."
                className="w-full text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 bg-transparent focus:outline-none truncate"
              />
            </div>
            <Button
              type="submit"
              className="w-full sm:w-auto bg-dalBlue hover:bg-dalBlue-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-colors shrink-0"
            >
              Search Tenders
            </Button>
          </form>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pt-1 sm:pt-2">
            <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mr-1">Popular searches:</span>
            {quickLocations.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickClick(item.query)}
                className="px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Key Statistics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 pt-6 sm:pt-8 mt-6 sm:mt-8 border-t border-slate-200 dark:border-slate-800 text-left">
            <div className="p-3 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold text-dalBlue dark:text-white truncate">
                {isStatsLoading ? '...' : (stats?.activeTendersCount ?? 29)}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 truncate">
                Active Tender Notices
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold text-chinarRed truncate">
                {isStatsLoading ? '...' : formatCurrencyINR(stats?.totalValue ?? 30146323)}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 truncate">
                Total Estimated Value
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold text-dalBlue dark:text-white truncate">
                {isStatsLoading ? '...' : (stats?.authoritiesCount ?? 13)}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 truncate">
                State Departments
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold text-dalBlue dark:text-white">
                20
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 truncate">
                Districts Covered
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 🚀 Animated Infinite Moving Carousel Section: Active Departments & Procurement Domains */}
      <section className="bg-white dark:bg-slate-800/60 py-10 sm:py-12 border-b border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mb-5 sm:mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-chinarRed dark:text-red-400 uppercase tracking-wider mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Live Active Pipeline</span>
              </div>
              <h2 className="text-lg sm:text-2xl font-display font-bold text-dalBlue dark:text-white">
                Procurement Departments &amp; Domains
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Continuously moving feed of active government authorities, active tender counts, and estimated contract values.
              </p>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/tenders')}
              className="gap-1.5 text-xs hover:border-dalBlue shrink-0"
            >
              <span>Explore All Tenders</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Continuous Moving Track with Edge Gradient Masks */}
        <div className="relative w-full overflow-hidden group">
          {/* Gradient Edge Masks for Smooth Visual Fading */}
          <div className="absolute left-0 top-0 w-8 sm:w-20 lg:w-28 h-full bg-gradient-to-r from-white dark:from-slate-900 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 w-8 sm:w-20 lg:w-28 h-full bg-gradient-to-l from-white dark:from-slate-900 to-transparent z-10 pointer-events-none" />

          <motion.div
            className="flex gap-3 sm:gap-5 w-max py-2"
            animate={{ x: ["0%", "-50%"] }}
            transition={{
              repeat: Infinity,
              ease: "linear",
              duration: 35,
            }}
          >
            {carouselItems.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  const params = new URLSearchParams();
                  if (item.query.category) params.set('category', item.query.category);
                  if (item.query.organisation) params.set('organisation', item.query.organisation);
                  if (item.query.department) params.set('department', item.query.department);
                  navigate(`/tenders?${params.toString()}`);
                }}
                className="w-64 sm:w-80 bg-paper dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-dalBlue dark:hover:border-blue-400 p-4 sm:p-5 rounded-2xl cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-1 flex-shrink-0 flex flex-col justify-between group/card select-none"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-[10px] font-mono font-bold text-chinarRed dark:text-red-400 uppercase tracking-wider bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-2 py-0.5 rounded-md">
                      {item.count}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 truncate max-w-[110px] sm:max-w-[130px]" title={item.subtitle}>
                      {item.subtitle}
                    </span>
                  </div>

                  <h4 className="text-sm sm:text-base font-display font-bold text-slate-900 dark:text-white group-hover/card:text-dalBlue dark:group-hover/card:text-blue-300 transition-colors line-clamp-2 leading-snug">
                    {item.title}
                  </h4>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="block text-[9px] uppercase tracking-wider font-semibold text-slate-400">Total Value</span>
                    <span className="font-mono text-xs sm:text-sm font-bold text-dalBlue dark:text-blue-300">{item.value}</span>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 group-hover/card:bg-dalBlue group-hover/card:text-white transition-colors">
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/card:translate-x-0.5" />
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Recent Tender Announcements Section */}
      {stats?.latestTenders && stats.latestTenders.length > 0 && (
        <section className="py-10 sm:py-12 px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-bold text-dalBlue dark:text-white">
                Recent Tender Announcements
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Latest procurement notices published by public engineering divisions and municipal authorities.
              </p>
            </div>
            
            <Link
              to="/tenders"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-chinarRed hover:underline shrink-0"
            >
              <span>View All {stats?.activeTendersCount ?? 29} Tenders</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.latestTenders.map((tender) => {
              const orgParts = (tender.organisationChain || '').split('||').map((p) => p.trim());
              const primaryDept = orgParts[orgParts.length - 1] || orgParts[0] || 'Govt Authority';
              const cleanTitle = tender.title?.replace(/[[\]]/g, '') || 'Tender Notice';

              return (
                <div
                  key={tender._id}
                  onClick={() => navigate(`/tenders/${tender._id}`)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-dalBlue dark:hover:border-blue-400 rounded-xl p-4 sm:p-5 shadow-xs transition-all cursor-pointer flex flex-col justify-between hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] sm:text-xs font-semibold text-dalBlue dark:text-blue-300 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 truncate max-w-[160px]">
                        {tender.sourceTenderId}
                      </span>
                      <span className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                        {tender.productCategory || 'Works'}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-display font-bold text-slate-900 dark:text-white hover:text-dalBlue dark:hover:text-blue-400 transition-colors line-clamp-2 leading-snug">
                      {cleanTitle}
                    </h3>

                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{primaryDept}</span>
                      </div>
                      {(tender.publishedDateStr || tender.publishedDate) && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 shrink-0" title={`Published: ${formatDateTimeDisplay(tender.publishedDateStr || tender.publishedDate)}`}>
                          <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>{formatDateTimeDisplay(tender.publishedDateStr || tender.publishedDate)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 font-mono font-bold text-dalBlue dark:text-blue-300">
                      <IndianRupee className="w-3.5 h-3.5 shrink-0" />
                      <span>{formatCurrencyINR(tender.estimatedValue)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-[11px] sm:text-xs">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>Closing: {formatDateDisplay(tender.closingDate)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Work Categories Section */}
      <section className="bg-white dark:bg-slate-800/40 py-10 sm:py-12 border-t border-slate-200 dark:border-slate-800 px-3 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-dalBlue dark:text-white">
              Browse Tenders by Work Domain
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Select a classified public works domain to inspect current open bidding opportunities.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                title: 'Civil Works',
                desc: 'Road construction, building works, bridges, slope stabilization, and concrete infrastructure.',
                query: 'Civil Works'
              },
              {
                title: 'Water Supply & Jal Shakti',
                desc: 'Borewells, pump machinery, water filtration plants, distribution networks, and PHE pipelines.',
                query: 'Water'
              },
              {
                title: 'Electrical & Power Works',
                desc: 'Transformer installations, HT/LT transmission lines, campus electrification, and grid substations.',
                query: 'Electrical Works'
              },
              {
                title: 'Roads & Bridges (PMGSY/PWD)',
                desc: 'Rural road connectivity, macadamization, blacktopping, retaining walls, and culverts.',
                query: 'Roads'
              },
              {
                title: 'Mechanical & Transport',
                desc: 'Heavy machinery hiring, fleet maintenance, fabrication works, and mechanical spares.',
                query: 'Mechanical'
              },
              {
                title: 'General Supplies & Services',
                desc: 'Departmental store supplies, medical goods, logistics, and institutional service contracts.',
                query: 'Services'
              }
            ].map((domain, i) => (
              <div
                key={i}
                onClick={() => navigate(`/tenders?search=${encodeURIComponent(domain.query)}`)}
                className="bg-paper dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-dalBlue dark:hover:border-blue-400 rounded-xl p-5 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-display font-bold text-slate-900 dark:text-white group-hover:text-dalBlue dark:group-hover:text-blue-400 transition-colors">
                      {domain.title}
                    </h3>
                    <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-dalBlue transition-colors" />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {domain.desc}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs font-semibold text-dalBlue dark:text-blue-300">
                  <span>Explore Notices</span>
                  <span className="text-slate-400">→</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transparency & Official Verification Section */}
      <section className="py-14 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl font-display font-bold text-dalBlue dark:text-white">
            Procurement Integrity &amp; Verification
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Built specifically to assist local contractors, engineering firms, and suppliers with accurate, official bidding data.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xs">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 text-dalBlue dark:text-blue-400 flex items-center justify-center mb-4">
              <Landmark className="w-5 h-5" />
            </div>
            <h3 className="text-base font-display font-bold text-slate-900 dark:text-white mb-1.5">
              Official NIC Portal Direct
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              All announcements are synchronized directly with official government eProcurement portals (<span className="font-mono">jktenders.gov.in</span>), ensuring complete fidelity to published tenders.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xs">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 text-chinarRed flex items-center justify-center mb-4">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-base font-display font-bold text-slate-900 dark:text-white mb-1.5">
              Permanent Document Archives
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Official NIT PDFs and corrigenda are archived to secure cloud storage so you can review specifications without worrying about government server timeouts.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xs">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 text-emerald-600 flex items-center justify-center mb-4">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="text-base font-display font-bold text-slate-900 dark:text-white mb-1.5">
              Clear Work Site Locations
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Detailed site identification and district mapping help contractors quickly determine project proximity, terrain parameters, and logistics feasibility.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}