/**
 * @file src/pages/Tenders.jsx
 * @description Official public procurement directory for Jammu & Kashmir.
 * Features structured dropdown filters (Districts, Categories, Authorities, Divisions),
 * prominent interactive focus and selection states, and live notice analytics.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, 
  RotateCcw, 
  Filter, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Clock, 
  Archive, 
  ArrowUpDown,
  MapPin,
  Layers,
  Building2,
  Calendar,
  X
} from 'lucide-react';

import { useTenders } from '@/hooks/useTenders';
import { useDebounce } from '@/hooks/useDebounce';
import { TenderCard } from '@/components/shared/TenderCard';
import { Input } from '@/components/ui/Input';
import { Select, SelectTrigger, SelectItem } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

// Static filter datasets mapped to government e-procurement nomenclature
const DISTRICT_OPTIONS = [
  { label: 'All Districts & Regions', value: '' },
  { label: 'Baramulla', value: 'Baramulla' },
  { label: 'Bandipora', value: 'Bandipora' },
  { label: 'Srinagar', value: 'Srinagar' },
  { label: 'Jammu', value: 'Jammu' },
  { label: 'Pulwama', value: 'Pulwama' },
  { label: 'Anantnag', value: 'Anantnag' },
  { label: 'Kulgam', value: 'Kulgam' },
  { label: 'Budgam', value: 'Budgam' },
  { label: 'Kupwara', value: 'Kupwara' },
  { label: 'Ganderbal', value: 'Ganderbal' },
  { label: 'Shopian', value: 'Shopian' },
  { label: 'Udhampur', value: 'Udhampur' },
  { label: 'Reasi', value: 'Reasi' },
  { label: 'Kathua', value: 'Kathua' },
  { label: 'Samba', value: 'Samba' },
  { label: 'Rajouri', value: 'Rajouri' },
  { label: 'Poonch', value: 'Poonch' },
  { label: 'Doda', value: 'Doda' },
  { label: 'Ramban', value: 'Ramban' },
  { label: 'Kishtwar', value: 'Kishtwar' },
];

const CATEGORY_OPTIONS = [
  { label: 'All Work Categories', value: '' },
  { label: 'Civil Works', value: 'Civil Works' },
  { label: 'Electrical Works', value: 'Electrical Works' },
  { label: 'Water Equipments & Boring', value: 'Water Equipments/ Meter/ Drilling/ Boring' },
  { label: 'Electrical & Maintenance', value: 'Electrical and Maintenance Works' },
  { label: 'Civil Works - Others', value: 'Civil Works - Others' },
  { label: 'Medicines & Health Supplies', value: 'Medicines' },
  { label: 'Miscellaneous Services', value: 'Miscellaneous Services' },
  { label: 'Miscellaneous Goods', value: 'Miscellaneous Goods' },
];

const AUTHORITY_OPTIONS = [
  { label: 'All Government Authorities', value: '' },
  { label: 'Rural Development & Panchayati Raj', value: 'Rural Development' },
  { label: 'Public Works Department (PWD)', value: 'PWD' },
  { label: 'Housing & Urban Development (HAUDD)', value: 'HAUDD' },
  { label: 'Irrigation & Flood Control (I and FC)', value: 'I and FC' },
  { label: 'Power Development Dept (DC-PDD)', value: 'DC-PDD' },
  { label: 'Jal Shakti / PHE Department', value: 'PHE' },
  { label: 'Forest Department', value: 'FOREST DEPARTMENT' },
  { label: 'Health & Medical Education', value: 'Health and Medical Education' },
  { label: 'Soil & Water Conservation Dept', value: 'Soil and Water Conservation' },
  { label: 'Power Development Corp (JKSPDC)', value: 'JKSPDC' },
  { label: 'Universities & Higher Education', value: 'University Department' },
  { label: 'SKUAST Agriculture University', value: 'SKUAST' },
  { label: 'Police Headquarters (DGP-JK)', value: 'DGP-JK' },
  { label: 'Forest Development Corp (JKSFC)', value: 'JKSFC' },
  { label: 'Shri Mata Vaishno Devi Shrine Board', value: 'SHRI MATA VAISHNO DEVI' },
  { label: 'Tourism Department', value: 'Tourism' },
  { label: 'Agriculture Production Department', value: 'AGRICULTURE PRODUCTION' },
  { label: 'Industries & Commerce (SICOP)', value: 'SICOP' },
  { label: 'J&K Sports Council', value: 'Sports Council' },
  { label: 'Horticulture Production Dept', value: 'Horticulture' },
];

const DIVISION_OPTIONS = [
  { label: 'All Divisions & Wings', value: '' },
  { label: 'Directorate Agriculture Kashmir', value: 'Directorate Agriculture Kashmir' },
  { label: 'Agriculture District Baramulla', value: 'Department of Agriculture District Baramulla' },
  { label: 'Command Area Development Pulwama', value: 'CAD Division Pulwama' },
  { label: 'Soil Conservation Anantnag/Kulgam', value: 'Asstt Soil Conservation Officer Anantnag' },
  { label: 'HADP / JKCIP Directorate', value: 'Mission Directorate HADP' },
  { label: 'CE-M & RE Wing Kashmir', value: 'CE-M and RE Wing Kashmir' },
  { label: 'CIRCLE II-Srinagar (ED-3rd)', value: 'CIRCLE II-Srinagar' },
  { label: 'ED-Anantnag & Bijbehara', value: 'ED-Anantnag' },
  { label: 'ED-Kulgam', value: 'ED-Kulgam' },
  { label: 'ED-Pulwama & Shopian', value: 'South Pulwama' },
  { label: 'CE-M & RE Wing Jammu', value: 'CE-M and RE Wing Jammu' },
  { label: 'STD-II Jammu', value: 'STD-II Jammu' },
  { label: 'ED-Rajouri & Batote', value: 'ED-Rajouri' },
  { label: 'ED-Udhampur', value: 'ED-Udhampur' },
  { label: 'Animal Husbandry Jammu', value: 'Animal Husbandry Jammu' },
  { label: 'Director Fisheries', value: 'DIRECTOR FISHERIES' },
];

const DEADLINE_OPTIONS = [
  { label: 'All Closing Deadlines', value: '' },
  { label: 'Closing in 3 Days (Urgent)', value: '3' },
  { label: 'Closing in 7 Days', value: '7' },
  { label: 'Closing in 15 Days', value: '15' },
  { label: 'Closing in 30 Days', value: '30' },
];

export default function Tenders() {
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. Initial State from URL params
  const initialSearch = searchParams.get('search') || '';
  const initialCategory = searchParams.get('category') || '';

  const [advancedSearch, setAdvancedSearch] = useState(initialSearch);
  const debouncedSearch = useDebounce(advancedSearch, 500);

  const [category, setCategory] = useState(initialCategory);
  const [location, setLocation] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [department, setDepartment] = useState('');
  const [closingDate, setClosingDate] = useState('');
  
  // Tab State: Latest vs Archived Tenders
  const [status, setStatus] = useState('active');
  const [sortBy, setSortBy] = useState('arrival');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Active filter count for badge
  const activeFilterCount = [
    Boolean(advancedSearch),
    Boolean(category),
    Boolean(location),
    Boolean(organisation),
    Boolean(department),
    Boolean(closingDate),
  ].filter(Boolean).length;

  // 2. Construct API Query
  const queryFilters = {
    search: debouncedSearch,
    category: category,
    organisation: organisation,
    department: department,
    location: location,
    closingDays: closingDate,
    status: status,
    sortBy: sortBy,
    page: currentPage,
    limit: 10,
  };

  const { data, isLoading, isError, error } = useTenders(queryFilters);

  const tenders = data?.data || [];
  const totalCount = data?.meta?.total || 0;
  const activeCount = data?.meta?.activeCount ?? 0;
  const archivedCount = data?.meta?.archivedCount ?? 0;
  const totalPages = Math.ceil(totalCount / 10) || 1;

  // 3. Handlers
  const handleReset = () => {
    setAdvancedSearch('');
    setCategory('');
    setOrganisation('');
    setDepartment('');
    setLocation('');
    setClosingDate('');
    setStatus('active');
    setSortBy('arrival');
    setCurrentPage(1);
    setSearchParams({});
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 py-6 sm:py-8 px-3 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto">
        
        {/* Page Title & Reset Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-5 sm:mb-6">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold font-display text-slate-900 dark:text-white tracking-tight">
              Tender Notice Directory
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Official public works, civil contracts, and procurement notices published across J&amp;K.
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={handleReset} 
            className="gap-1.5 text-xs self-start sm:self-auto hover:border-chinarRed hover:text-chinarRed transition-colors shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
          </Button>
        </div>

        {/* Mobile/Tablet Filter Accordion Toggle (< lg) */}
        <div className="lg:hidden mb-4">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className="w-full flex items-center justify-between p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs text-xs font-bold text-dalBlue dark:text-blue-300 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-dalBlue dark:text-blue-400 shrink-0" />
              <span>{mobileFiltersOpen ? 'Hide Search Filters' : 'Show Search Filters'}</span>
              {activeFilterCount > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-dalBlue text-white dark:bg-blue-600">
                  {activeFilterCount} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <span 
                  onClick={(e) => { e.stopPropagation(); handleReset(); }}
                  className="text-[11px] text-chinarRed hover:underline font-semibold"
                >
                  Reset
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${mobileFiltersOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* ---------------- FILTER SIDEBAR ---------------- */}
          <aside className={`lg:col-span-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs lg:sticky lg:top-20 flex flex-col max-h-[520px] sm:max-h-[560px] lg:max-h-[calc(100vh-6rem)] overflow-hidden transition-all ${
            mobileFiltersOpen ? 'flex mb-4 lg:mb-0' : 'hidden lg:flex'
          }`}>
            {/* Pinned Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/80 text-dalBlue dark:text-blue-400 bg-white dark:bg-slate-800 shrink-0 select-none">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <h2 className="text-xs font-bold uppercase tracking-wider">Search Filters</h2>
              </div>
              {activeFilterCount > 0 && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-dalBlue text-white dark:bg-blue-600 shadow-xs animate-in fade-in">
                  {activeFilterCount} active
                </span>
              )}
            </div>

            {/* Scrollable Filters Body with Dedicated Vertical Scrollbar */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4 filter-scrollbar overscroll-contain">
              {/* Keyword Search Input */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span>Keyword / NIT No.</span>
                  {advancedSearch && (
                    <button 
                      onClick={() => { setAdvancedSearch(''); setCurrentPage(1); }}
                      className="text-[10px] text-slate-400 hover:text-chinarRed"
                    >
                      Clear
                    </button>
                  )}
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 sm:top-3" />
                  <Input
                    type="text"
                    value={advancedSearch}
                    onChange={(e) => {
                      setAdvancedSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="e.g. Borewell, NIT No, Road..."
                    className="pl-9 text-xs"
                  />
                </div>
              </div>

              {/* District / Location Dropdown */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-chinarRed" /> District / Region
                  </span>
                  {location && (
                    <button 
                      onClick={() => { setLocation(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={location} onValueChange={(val) => { setLocation(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {DISTRICT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              {/* Work Category Dropdown */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" /> Work Domain / Category
                  </span>
                  {category && (
                    <button 
                      onClick={() => { setCategory(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={category} onValueChange={(val) => { setCategory(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              {/* Government Authority Dropdown */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" /> Procuring Authority
                  </span>
                  {organisation && (
                    <button 
                      onClick={() => { setOrganisation(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={organisation} onValueChange={(val) => { setOrganisation(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {AUTHORITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              {/* Division / Sub-Department Dropdown */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span>Executive Division / Wing</span>
                  {department && (
                    <button 
                      onClick={() => { setDepartment(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={department} onValueChange={(val) => { setDepartment(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {DIVISION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              {/* Closing Date Window */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" /> Submission Deadline
                  </span>
                  {closingDate && (
                    <button 
                      onClick={() => { setClosingDate(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={closingDate} onValueChange={(val) => { setClosingDate(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {DEADLINE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
            </div>

            {/* Pinned Quick Reset in Sidebar Footer */}
            {activeFilterCount > 0 && (
              <div className="px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-900/60 shrink-0">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleReset}
                  className="w-full text-xs text-chinarRed border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold"
                >
                  Clear All Filters ({activeFilterCount})
                </Button>
              </div>
            )}
          </aside>

          {/* ---------------- MAIN RESULTS FEED ---------------- */}
          <main className="lg:col-span-3 space-y-4">
            
            {/* Top Tab Bar: Latest vs Archived Notices + Sorting */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 sm:p-2.5 rounded-2xl shadow-xs">
              {/* Menu Tabs with High-Contrast Active States */}
              <div className="grid grid-cols-2 sm:flex items-center gap-1 sm:gap-1.5 bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setStatus('active');
                    setCurrentPage(1);
                  }}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-chinarRed ${
                    status === 'active'
                      ? 'bg-dalBlue text-white shadow-sm font-bold border border-dalBlue dark:bg-blue-600 dark:border-blue-500 ring-2 ring-dalBlue/20 dark:ring-blue-400/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-dalBlue dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 font-medium'
                  }`}
                >
                  <Clock className={`w-3.5 h-3.5 shrink-0 ${status === 'active' ? 'text-white' : 'text-dalBlue dark:text-blue-400'}`} />
                  <span className="truncate">Latest Notices</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold shrink-0 ${
                    status === 'active' 
                      ? 'bg-white/20 text-white' 
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}>
                    {activeCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatus('archived');
                    setCurrentPage(1);
                  }}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-chinarRed ${
                    status === 'archived'
                      ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-sm font-bold border border-slate-800 dark:border-slate-600 ring-2 ring-slate-800/20 dark:ring-slate-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 font-medium'
                  }`}
                >
                  <Archive className={`w-3.5 h-3.5 shrink-0 ${status === 'archived' ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">Archived</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold shrink-0 ${
                    status === 'archived' 
                      ? 'bg-white/20 text-white' 
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}>
                    {archivedCount}
                  </span>
                </button>
              </div>

              {/* Sorting Selector */}
              <div className="flex items-center justify-between sm:justify-start gap-2 px-1 sm:px-2 w-full sm:w-auto">
                <div className="flex items-center gap-1.5 shrink-0">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Sort:</span>
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="flex-1 sm:flex-none bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-white hover:border-dalBlue dark:hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-dalBlue/30 focus:border-dalBlue cursor-pointer shadow-xs transition-all truncate"
                >
                  <option value="arrival">Latest Published (Newest First)</option>
                  <option value="publishedAsc">Oldest Published First</option>
                  <option value="closingAsc">Closing Deadline (Soonest First)</option>
                  <option value="closingDesc">Closing Deadline (Furthest First)</option>
                  <option value="valueDesc">Estimated Value (High to Low)</option>
                  <option value="valueAsc">Estimated Value (Low to High)</option>
                </select>
              </div>
            </div>

            {/* Active Filter Chips Bar */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs shadow-xs">
                <span className="font-semibold text-slate-400 dark:text-slate-500 uppercase text-[10px] mr-1">Active:</span>
                
                {advancedSearch && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <span>Search: &quot;{advancedSearch}&quot;</span>
                    <button onClick={() => setAdvancedSearch('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {location && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <MapPin className="w-3 h-3 text-chinarRed" />
                    <span>District: {location}</span>
                    <button onClick={() => setLocation('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {category && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <Layers className="w-3 h-3" />
                    <span>Category: {category}</span>
                    <button onClick={() => setCategory('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {organisation && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <Building2 className="w-3 h-3" />
                    <span className="truncate max-w-[160px]">Authority: {organisation}</span>
                    <button onClick={() => setOrganisation('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {department && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <span className="truncate max-w-[160px]">Division: {department}</span>
                    <button onClick={() => setDepartment('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {closingDate && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <Calendar className="w-3 h-3" />
                    <span>Deadline: &le; {closingDate} days</span>
                    <button onClick={() => setClosingDate('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                <button
                  onClick={handleReset}
                  className="text-chinarRed font-bold hover:underline text-xs ml-auto cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            )}

            {/* Total Results Summary */}
            <div className="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-xl text-xs text-slate-600 dark:text-slate-400 shadow-xs">
              <span>
                Showing <strong className="font-mono text-sm text-dalBlue dark:text-blue-400 font-bold">{totalCount}</strong> {status === 'archived' ? 'archived notices' : 'active notices'}
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Page {currentPage} of {totalPages}
              </span>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center space-y-3 shadow-xs">
                <div className="w-8 h-8 rounded-full border-3 border-dalBlue border-t-transparent animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Loading tender notices...</p>
              </div>
            )}

            {/* Error State */}
            {isError && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl p-6 text-center text-red-700 dark:text-red-300 text-xs space-y-1">
                <p className="font-bold text-sm">Unable to load tender directory.</p>
                <p>{error?.message || 'Please verify database connection.'}</p>
              </div>
            )}

            {/* Tender Feed */}
            {!isLoading && !isError && tenders.length > 0 && (
              <div className="space-y-4">
                {tenders.map((tender) => (
                  <TenderCard key={tender._id || tender.sourceTenderId} tender={tender} />
                ))}

                {/* Standard Pagination */}
                <div className="flex flex-col sm:flex-row items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-2xl mt-6 shadow-xs gap-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Page <strong className="text-slate-800 dark:text-white font-mono">{currentPage}</strong> of <strong className="text-slate-800 dark:text-white font-mono">{totalPages}</strong>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => handlePageChange(Math.max(currentPage - 1, 1))} disabled={currentPage === 1}
                      className="px-2.5 text-xs"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
                    </Button>
                    
                    <div className="h-8 px-3 flex items-center justify-center bg-dalBlue text-white dark:bg-blue-600 rounded-lg text-xs font-mono font-bold shadow-xs border border-dalBlue dark:border-blue-500">
                      {currentPage}
                    </div>

                    <Button
                      variant="outline" size="sm"
                      onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))} disabled={currentPage === totalPages}
                      className="px-2.5 text-xs"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !isError && tenders.length === 0 && (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center space-y-3 shadow-xs">
                <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                <h4 className="text-base font-bold text-slate-800 dark:text-white">
                  {status === 'archived' ? 'No Archived Notices Found' : 'No Matching Tender Notices'}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  {status === 'archived'
                    ? 'No expired notices match your current filters. Adjust your criteria or switch to Latest Notices.'
                    : 'Try clearing specific department, category, or district filters to broaden your search results.'}
                </p>
                <div className="pt-2">
                  <Button variant="outline" onClick={handleReset} className="text-xs hover:border-dalBlue">
                    Reset All Filters
                  </Button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}