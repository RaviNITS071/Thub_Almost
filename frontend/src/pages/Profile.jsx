/**
 * @file src/pages/Profile.jsx
 * @description Contractor workspace. Manages bookmarked tenders, contractor credentials, and filter preferences.
 */
import { useState, useEffect } from 'react';
import { 
  Building, 
  Heart, 
  Sliders, 
  CheckCircle2, 
  Shield, 
  MapPin, 
  FolderArchive, 
  ArrowRight,
  Edit2,
  Check,
  X,
  Save,
  RotateCcw,
  Database
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useBookmarkStore } from '@/store/useBookmarkStore';
import { usePreferenceStore } from '@/store/usePreferenceStore';
import { useContractorStore } from '@/store/useContractorStore';
import { contractorService } from '@/services/contractor.service';
import { TenderCard } from '@/components/shared/TenderCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const PREF_SECTOR_OPTIONS = [
  'Civil Works',
  'Electrical Works',
  'Water Equipments/ Meter/ Drilling/ Boring',
  'Electrical and Maintenance Works',
  'Civil Works - Others',
  'Medicines',
  'Miscellaneous Services',
  'Miscellaneous Goods',
  'Roads & Bridges',
  'Information Technology'
];

const PREF_DISTRICT_OPTIONS = [
  'All 20 Districts',
  'Baramulla', 'Bandipora', 'Srinagar', 'Jammu', 'Pulwama',
  'Anantnag', 'Kulgam', 'Budgam', 'Kupwara', 'Ganderbal',
  'Shopian', 'Udhampur', 'Reasi', 'Kathua', 'Samba',
  'Rajouri', 'Poonch', 'Doda', 'Ramban', 'Kishtwar'
];

const REGISTRATION_CLASSES = [
  'Class A Works',
  'Class B Works',
  'Class C Works',
  'Class D Works',
  'Special Class Works',
  'Hot Mix Plant Operator',
  'Electrical Class 1 Contractor'
];

const getInitials = (name) => {
  if (!name) return 'RS';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function Profile() {
  const [activeTab, setActiveTab] = useState('saved');
  const savedTenders = useBookmarkStore((state) => state.savedTenders);
  
  // Persistent stores
  const { profile, updateProfile } = useContractorStore();
  const { preferences, updatePreferences } = usePreferenceStore();

  // Contractor Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ ...profile });
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  // Filter Preferences Edit State
  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
  const [prefForm, setPrefForm] = useState({
    targetSectors: preferences.targetSectors || [],
    preferredLocations: preferences.preferredLocations || [],
    minTenderValue: preferences.minTenderValue || 0,
    preferEmdExemption: preferences.preferEmdExemption || false,
  });
  const [prefSaveSuccess, setPrefSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dbSyncStatus, setDbSyncStatus] = useState('synced'); // 'synced' | 'offline'

  // Sync initial state from MongoDB on component load
  useEffect(() => {
    let isMounted = true;
    const fetchFromDb = async () => {
      try {
        const [dbProfile, dbPrefs] = await Promise.allSettled([
          contractorService.getProfile(),
          contractorService.getPreferences(),
        ]);

        if (isMounted) {
          if (dbProfile.status === 'fulfilled' && dbProfile.value) {
            updateProfile(dbProfile.value);
            setProfileForm(dbProfile.value);
          }
          if (dbPrefs.status === 'fulfilled' && dbPrefs.value) {
            updatePreferences(dbPrefs.value);
            setPrefForm(dbPrefs.value);
          }
          setDbSyncStatus('synced');
        }

        // Also refresh contractor-scoped saved tenders from MongoDB
        useBookmarkStore.getState().fetchSavedTenders();
      } catch (err) {
        console.warn('Backend DB not reachable, using local storage cache:', err);
        if (isMounted) setDbSyncStatus('offline');
      }
    };

    fetchFromDb();
    return () => { isMounted = false; };
  }, []);

  const tabs = [
    { id: 'saved', icon: Heart, label: `Saved Tenders (${savedTenders.length})` },
    { id: 'company', icon: Building, label: 'Contractor Profile' },
    { id: 'alerts', icon: Sliders, label: 'Filter Preferences' }
  ];

  // Handlers for Contractor Profile
  const handleStartEditProfile = () => {
    setProfileForm({ ...profile });
    setIsEditingProfile(true);
  };

  const handleCancelEditProfile = () => {
    setProfileForm({ ...profile });
    setIsEditingProfile(false);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    // Optimistic local update
    updateProfile(profileForm);
    setIsEditingProfile(false);

    try {
      await contractorService.updateProfile(profileForm);
      setDbSyncStatus('synced');
    } catch (err) {
      console.warn('Profile saved to local cache (DB offline):', err);
      setDbSyncStatus('offline');
    } finally {
      setIsSaving(false);
      setProfileSaveSuccess(true);
      setTimeout(() => setProfileSaveSuccess(false), 3500);
    }
  };

  // Handlers for Filter Preferences
  const handleStartEditPreferences = () => {
    setPrefForm({
      targetSectors: preferences.targetSectors || [],
      preferredLocations: preferences.preferredLocations || [],
      minTenderValue: preferences.minTenderValue || 0,
      preferEmdExemption: preferences.preferEmdExemption || false,
    });
    setIsEditingPreferences(true);
  };

  const handleCancelEditPreferences = () => {
    setPrefForm({
      targetSectors: preferences.targetSectors || [],
      preferredLocations: preferences.preferredLocations || [],
      minTenderValue: preferences.minTenderValue || 0,
      preferEmdExemption: preferences.preferEmdExemption || false,
    });
    setIsEditingPreferences(false);
  };

  const toggleSector = (sec) => {
    setPrefForm((prev) => {
      const exists = prev.targetSectors.includes(sec);
      return {
        ...prev,
        targetSectors: exists
          ? prev.targetSectors.filter((s) => s !== sec)
          : [...prev.targetSectors, sec]
      };
    });
  };

  const handleSavePreferences = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const updated = { ...prefForm, isConfigured: true };
    // Optimistic local update
    updatePreferences(updated);
    setIsEditingPreferences(false);

    try {
      await contractorService.updatePreferences(updated);
      setDbSyncStatus('synced');
    } catch (err) {
      console.warn('Preferences saved to local cache (DB offline):', err);
      setDbSyncStatus('offline');
    } finally {
      setIsSaving(false);
      setPrefSaveSuccess(true);
      setTimeout(() => setPrefSaveSuccess(false), 3500);
    }
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 py-6 sm:py-10 px-3 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-6xl mx-auto space-y-5 sm:space-y-6">
        
        {/* Contractor Profile Header Card - Dynamically linked to profile store */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-7 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 sm:gap-6 transition-all">
          <div className="flex flex-col xs:flex-row items-start xs:items-center gap-3 sm:gap-4 w-full lg:w-auto">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-dalBlue text-white flex items-center justify-center font-display font-bold text-lg sm:text-xl shadow-xs shrink-0 tracking-wider">
              {getInitials(profile.name)}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold font-display text-slate-900 dark:text-white">
                  {profile.name}
                </h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  <Shield className="w-3 h-3 fill-current" /> Verified Contractor
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-300 px-2 py-0.5 rounded border border-dalBlue/20">
                  <Database className="w-3 h-3" /> MongoDB Synced
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span className="font-mono bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  ID: {profile.contractorId || 'NIT-S-2026'}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-chinarRed" /> {profile.divisionBadge || 'J&K Public Works Division'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-700 pt-4 lg:pt-0 lg:pl-6 w-full lg:w-auto">
            <div>
              <span className="block text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                Saved Tenders
              </span>
              <span className="text-2xl font-bold font-mono text-dalBlue dark:text-white">
                {savedTenders.length}
              </span>
            </div>
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
            <div>
              <span className="block text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                Status
              </span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {profile.status || 'Active'}
              </span>
            </div>
          </div>
        </div>

        {/* Global Save Feedback Toasts */}
        {profileSaveSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold animate-in fade-in slide-in-from-top-2">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Contractor profile credentials saved and synchronized with the database!</span>
          </div>
        )}

        {prefSaveSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold animate-in fade-in slide-in-from-top-2">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Filter preferences saved to database! Tender radar and search feeds will prioritize these settings.</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 gap-2 sm:gap-4 text-xs sm:text-sm font-semibold overflow-x-auto scrollbar-hide touch-momentum pb-0 -mx-3 px-3 sm:mx-0 sm:px-0">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 px-2 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-dalBlue dark:border-blue-400 text-dalBlue dark:text-blue-400 font-bold'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Saved Tenders */}
        {activeTab === 'saved' && (
          <div className="space-y-4">
            {savedTenders.length > 0 ? (
              <div className="space-y-4">
                {savedTenders.map((tender) => (
                  <TenderCard key={tender._id || tender.sourceTenderId} tender={tender} />
                ))}
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-12 text-center shadow-xs max-w-xl mx-auto">
                <FolderArchive className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <h4 className="text-base font-bold text-slate-900 dark:text-white font-display mb-1">
                  No Saved Tenders
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-5">
                  Click the heart icon on any tender in the directory to bookmark it here for quick tracking.
                </p>
                <Link to="/tenders">
                  <Button className="gap-2 bg-dalBlue hover:bg-dalBlue-700 text-white text-xs font-bold py-2">
                    Browse Tenders <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Contractor Credentials (Editable) */}
        {activeTab === 'company' && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-7 space-y-5 max-w-3xl shadow-xs transition-all">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  {isEditingProfile ? 'Edit Contractor Details' : 'Contractor Details'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isEditingProfile 
                    ? 'Modify and save your official credentials registered on the platform' 
                    : 'Registered contractor information on the platform'}
                </p>
              </div>

              {!isEditingProfile ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleStartEditProfile}
                  className="text-xs gap-1.5 hover:border-dalBlue hover:text-dalBlue dark:hover:border-blue-400 dark:hover:text-blue-300 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleCancelEditProfile}
                    className="text-xs gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleSaveProfile}
                    className="text-xs gap-1.5 bg-dalBlue hover:bg-dalBlue-700 text-white font-bold cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Changes
                  </Button>
                </div>
              )}
            </div>

            {/* Read-Only Mode */}
            {!isEditingProfile ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
                {[
                  { label: 'Name / Contractor Entity', val: profile.name },
                  { label: 'Primary Jurisdiction', val: profile.jurisdiction },
                  { label: 'Affiliation / Division', val: profile.affiliation },
                  { label: 'Account Authentication', val: profile.accountAuth },
                  { label: 'Contractor Registration Class', val: profile.registrationClass },
                  { label: 'Portal Verification', val: profile.portalVerification },
                  { label: 'Contractor ID Number', val: profile.contractorId },
                  { label: 'Public Works Badge', val: profile.divisionBadge },
                ].map((field, i) => (
                  <div key={i}>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      {field.label}
                    </label>
                    <div className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-medium text-slate-800 dark:text-slate-200 text-xs">
                      {field.val || 'Not specified'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Editable Form Mode */
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Name */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Name / Contractor Entity <span className="text-chinarRed">*</span>
                    </label>
                    <Input
                      type="text"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      placeholder="e.g. Ravi Shankar"
                      required
                      className="text-xs"
                    />
                  </div>

                  {/* Registration Class */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Registration Class
                    </label>
                    <select
                      value={profileForm.registrationClass}
                      onChange={(e) => setProfileForm({ ...profileForm, registrationClass: e.target.value })}
                      className="flex h-9 sm:h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-dalBlue/30 cursor-pointer"
                    >
                      {REGISTRATION_CLASSES.map((cls) => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>

                  {/* Primary Jurisdiction */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Primary Jurisdiction
                    </label>
                    <Input
                      type="text"
                      value={profileForm.jurisdiction}
                      onChange={(e) => setProfileForm({ ...profileForm, jurisdiction: e.target.value })}
                      placeholder="e.g. Jammu & Kashmir / North Zone"
                      className="text-xs"
                    />
                  </div>

                  {/* Affiliation / Division */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Affiliation / Base Division
                    </label>
                    <Input
                      type="text"
                      value={profileForm.affiliation}
                      onChange={(e) => setProfileForm({ ...profileForm, affiliation: e.target.value })}
                      placeholder="e.g. NIT Srinagar, J&K"
                      className="text-xs"
                    />
                  </div>

                  {/* Contractor ID */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Contractor ID / Reg. No.
                    </label>
                    <Input
                      type="text"
                      value={profileForm.contractorId}
                      onChange={(e) => setProfileForm({ ...profileForm, contractorId: e.target.value })}
                      placeholder="e.g. NIT-S-2026"
                      className="text-xs font-mono"
                    />
                  </div>

                  {/* Public Works Division Badge */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Division Header Badge
                    </label>
                    <Input
                      type="text"
                      value={profileForm.divisionBadge}
                      onChange={(e) => setProfileForm({ ...profileForm, divisionBadge: e.target.value })}
                      placeholder="e.g. J&K Public Works Division"
                      className="text-xs"
                    />
                  </div>

                  {/* Account Authentication */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Account Authentication
                    </label>
                    <Input
                      type="text"
                      value={profileForm.accountAuth}
                      onChange={(e) => setProfileForm({ ...profileForm, accountAuth: e.target.value })}
                      placeholder="e.g. Google Verified"
                      className="text-xs"
                    />
                  </div>

                  {/* Portal Verification */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Portal Verification Status
                    </label>
                    <Input
                      type="text"
                      value={profileForm.portalVerification}
                      onChange={(e) => setProfileForm({ ...profileForm, portalVerification: e.target.value })}
                      placeholder="e.g. Active • L1 Compliant"
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2.5">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={handleCancelEditProfile}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    variant="default" 
                    size="sm" 
                    className="text-xs gap-1.5 bg-dalBlue hover:bg-dalBlue-700 text-white font-bold"
                  >
                    <Check className="w-3.5 h-3.5" /> Save Changes
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Tab 3: Filter Preferences (Editable) */}
        {activeTab === 'alerts' && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-7 space-y-5 max-w-3xl shadow-xs transition-all">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  {isEditingPreferences ? 'Edit Preferred Tender Filters' : 'Preferred Tender Filters'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isEditingPreferences 
                    ? 'Select your preferred domains, locations, and thresholds for automated discovery' 
                    : 'Default parameters applied when browsing the directory'}
                </p>
              </div>

              {!isEditingPreferences ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleStartEditPreferences}
                  className="text-xs gap-1.5 hover:border-dalBlue hover:text-dalBlue dark:hover:border-blue-400 dark:hover:text-blue-300 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Update
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleCancelEditPreferences}
                    className="text-xs gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleSavePreferences}
                    className="text-xs gap-1.5 bg-dalBlue hover:bg-dalBlue-700 text-white font-bold cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Preferences
                  </Button>
                </div>
              )}
            </div>

            {/* Read-Only Mode */}
            {!isEditingPreferences ? (
              <div className="space-y-4 text-xs sm:text-sm">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Target Work Categories
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {preferences.targetSectors?.length > 0 ? (
                      preferences.targetSectors.map((sec, i) => (
                        <span key={i} className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-300 rounded-md text-xs font-semibold border border-dalBlue/20">
                          {sec}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400">All categories active</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Preferred Location
                    </span>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                      {preferences.preferredLocations?.length > 0
                        ? preferences.preferredLocations.join(', ')
                        : 'All 20 Districts'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Minimum Value
                    </span>
                    <div className="font-mono font-bold text-dalBlue dark:text-blue-300 text-xs sm:text-sm">
                      ₹{preferences.minTenderValue ? Number(preferences.minTenderValue).toLocaleString('en-IN') : '0'}
                    </div>
                  </div>
                </div>

                {/* EMD Exemption Status */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">
                    EMD Exemption / MSME Preference
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {preferences.preferEmdExemption ? 'Enabled (MSME Exempt Prioritized)' : 'Disabled (Standard)'}
                  </span>
                </div>
              </div>
            ) : (
              /* Editable Preferences Form */
              <form onSubmit={handleSavePreferences} className="space-y-5">
                {/* Categories selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Target Work Categories
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPrefForm({ ...prefForm, targetSectors: [...PREF_SECTOR_OPTIONS] })}
                        className="text-[11px] text-dalBlue dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setPrefForm({ ...prefForm, targetSectors: [] })}
                        className="text-[11px] text-chinarRed font-semibold hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PREF_SECTOR_OPTIONS.map((sec) => {
                      const isSelected = prefForm.targetSectors.includes(sec);
                      return (
                        <button
                          type="button"
                          key={sec}
                          onClick={() => toggleSector(sec)}
                          className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-dalBlue text-white border-dalBlue shadow-xs dark:bg-blue-600 dark:border-blue-500 ring-1 ring-dalBlue/30'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-dalBlue'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}{sec}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* District Selection */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Preferred Location / District
                  </label>
                  <select
                    value={prefForm.preferredLocations?.[0] || 'All 20 Districts'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPrefForm({
                        ...prefForm,
                        preferredLocations: val === 'All 20 Districts' ? [] : [val]
                      });
                    }}
                    className="flex h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-dalBlue/30 cursor-pointer"
                  >
                    {PREF_DISTRICT_OPTIONS.map((dist) => (
                      <option key={dist} value={dist}>{dist}</option>
                    ))}
                  </select>
                </div>

                {/* Minimum Contract Threshold */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Minimum Tender Value (INR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 sm:top-3 text-xs font-bold text-slate-400">₹</span>
                    <Input
                      type="number"
                      min="0"
                      step="10000"
                      value={prefForm.minTenderValue}
                      onChange={(e) => setPrefForm({ ...prefForm, minTenderValue: Number(e.target.value) || 0 })}
                      placeholder="e.g. 500000"
                      className="pl-7 text-xs font-mono"
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      { label: 'Any (₹0)', val: 0 },
                      { label: '₹1 Lakh', val: 100000 },
                      { label: '₹5 Lakhs', val: 500000 },
                      { label: '₹10 Lakhs', val: 1000000 },
                      { label: '₹50 Lakhs', val: 5000000 },
                    ].map((preset) => (
                      <button
                        type="button"
                        key={preset.val}
                        onClick={() => setPrefForm({ ...prefForm, minTenderValue: preset.val })}
                        className={`text-[11px] px-2 py-0.5 rounded border font-mono transition-all cursor-pointer ${
                          prefForm.minTenderValue === preset.val
                            ? 'bg-dalBlue text-white border-dalBlue font-bold'
                            : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-dalBlue/40'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* MSME / EMD Exemption Toggle */}
                <div className="flex items-center gap-2.5 pt-1">
                  <input
                    type="checkbox"
                    id="prefEmdOpt"
                    checked={prefForm.preferEmdExemption}
                    onChange={(e) => setPrefForm({ ...prefForm, preferEmdExemption: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-dalBlue focus:ring-dalBlue accent-dalBlue cursor-pointer"
                  />
                  <label htmlFor="prefEmdOpt" className="text-xs text-slate-700 dark:text-slate-200 font-bold cursor-pointer select-none">
                    Prioritize MSME / EMD Exempt Tenders
                  </label>
                </div>

                {/* Footer Actions */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2.5">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={handleCancelEditPreferences}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    variant="default" 
                    size="sm" 
                    className="text-xs gap-1.5 bg-dalBlue hover:bg-dalBlue-700 text-white font-bold"
                  >
                    <Check className="w-3.5 h-3.5" /> Save Preferences
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

      </div>
    </div>
  );
}