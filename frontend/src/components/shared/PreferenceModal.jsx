/**
 * @file src/components/shared/PreferenceModal.jsx
 * @description Initial contractor intake modal utilizing custom Dialog primitives with dark mode styling.
 */
import { useState } from 'react';
import { usePreferenceStore } from '@/store/usePreferenceStore';
import { Sliders, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function PreferenceModal() {
  const { preferences, updatePreferences } = usePreferenceStore();

  const [sectors, setSectors] = useState(['Civil Works']);
  const [location, setLocation] = useState('Baramulla');
  const [minVal, setMinVal] = useState('200000');
  const [preferEmd, setPreferEmd] = useState(false);

  if (preferences.isConfigured) return null;

  const sectorOptions = [
    'Civil Works', 'Electrical Works', 'Pipes & Water Supply', 
    'Roads & Bridges', 'Information Technology', 'Mechanical Works'
  ];

  const toggleSector = (sec) => {
    setSectors(prev => prev.includes(sec) ? prev.filter(s => s !== sec) : [...prev, sec]);
  };

  const handleSave = (e) => {
    e.preventDefault();
    updatePreferences({
      targetSectors: sectors,
      preferredLocations: location ? [location] : [],
      minTenderValue: Number(minVal) || 0,
      preferEmdExemption: preferEmd,
    });
  };

  return (
    <Dialog open={!preferences.isConfigured}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="mb-4 sm:mb-6 flex flex-row items-start sm:items-center gap-3 sm:gap-4 text-left">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-dalBlue/10 dark:bg-blue-500/20 text-dalBlue dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
            <Sliders className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <DialogTitle className="text-lg sm:text-xl">Tailor Your Tender Radar</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">Configure your business scope to prioritize high-value contract feeds.</DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-charcoal/70 dark:text-slate-300 mb-2">
              Work Domains
            </label>
            <div className="flex flex-wrap gap-2">
              {sectorOptions.map((sec) => (
                <button
                  type="button"
                  key={sec}
                  onClick={() => toggleSector(sec)}
                  className={`text-xs px-3 py-1.5 rounded-xl border font-bold transition-all ${
                    sectors.includes(sec)
                      ? 'bg-dalBlue text-white border-dalBlue shadow-xs'
                      : 'bg-paper dark:bg-slate-900 text-charcoal/70 dark:text-slate-300 border-border dark:border-slate-800 hover:border-dalBlue/40'
                  }`}
                >
                  {sec}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-charcoal/70 dark:text-slate-300 mb-1">
              Preferred District / Base
            </label>
            <Input 
              value={location} onChange={(e) => setLocation(e.target.value)} 
              placeholder="e.g. Srinagar, Baramulla, Jammu" 
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-charcoal/70 dark:text-slate-300 mb-1">
              Minimum Contract Threshold (INR)
            </label>
            <Input 
              type="number" value={minVal} onChange={(e) => setMinVal(e.target.value)} 
              placeholder="e.g. 500000" 
            />
          </div>

          <div className="flex items-center gap-2.5 pt-2">
            <input
              type="checkbox" id="emdOpt" checked={preferEmd} onChange={(e) => setPreferEmd(e.target.checked)}
              className="w-4 h-4 rounded border-border dark:border-slate-700 text-dalBlue focus:ring-dalBlue accent-dalBlue cursor-pointer"
            />
            <label htmlFor="emdOpt" className="text-xs text-charcoal dark:text-slate-200 font-bold cursor-pointer">
              Prioritize MSME / EMD Exempt Tenders
            </label>
          </div>

          <div className="pt-4 border-t border-border dark:border-slate-800 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-6">
            <Button variant="ghost" onClick={() => updatePreferences({ isConfigured: true })} className="w-full sm:w-auto text-xs sm:text-sm">
              Skip for Now
            </Button>
            <Button type="submit" variant="default" className="w-full sm:w-auto bg-chinarRed hover:bg-chinarRed-700 text-white gap-2 text-xs sm:text-sm">
              Apply Filters <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}