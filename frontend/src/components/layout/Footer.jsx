/**
 * @file src/components/layout/Footer.jsx
 * @description Classical platform footer containing official portal links,
 * regional operations desk information, and directory shortcuts.
 */
import { Link } from 'react-router-dom';
import { Landmark, Mail, MapPin, ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-slate-900 text-white pt-12 pb-8 border-t border-slate-800 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-6 lg:gap-8">
          
          {/* Brand & Description */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-dalBlue text-white flex items-center justify-center shrink-0">
                <Landmark className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-display font-bold tracking-tight text-white">
                Tender<span className="text-chinarRed">Hub</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed font-normal">
              Public procurement information system for Jammu &amp; Kashmir. Synchronizing published tender notices, technical documents, and BOQ schedules across state engineering divisions.
            </p>
          </div>

          {/* Monitored Portals */}
          <div>
            <h4 className="text-xs font-display font-bold uppercase tracking-wider text-slate-300 mb-3">
              Official Portals
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <a 
                  href="https://jktenders.gov.in" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <span>JK eProcurement Portal</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </li>
              <li>
                <a 
                  href="https://eprocure.gov.in" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <span>Central Public Procurement (CPPP)</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </li>
              <li>
                <a 
                  href="https://gem.gov.in" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <span>Government e-Marketplace (GeM)</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </li>
            </ul>
          </div>

          {/* Navigation Links */}
          <div>
            <h4 className="text-xs font-display font-bold uppercase tracking-wider text-slate-300 mb-3">
              Directory
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link to="/tenders" className="hover:text-white transition-colors">
                  Browse Active Tenders
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-white transition-colors">
                  Contractor Plans
                </Link>
              </li>
              <li>
                <Link to="/profile" className="hover:text-white transition-colors">
                  Contractor Workspace
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-white transition-colors">
                  About Platform
                </Link>
              </li>
            </ul>
          </div>

          {/* Regional Operations Desk */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-display font-bold uppercase tracking-wider text-slate-300 mb-3">
              Regional Desk
            </h4>
            <div className="flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
              <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>NIT Campus, Hazratbal, Srinagar, J&amp;K 190006</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Mail className="w-4 h-4 text-slate-500 shrink-0" />
              <span>support@tenderhub.in</span>
            </div>
          </div>
        </div>

        {/* Bottom Legal Bar */}
        <div className="mt-10 pt-5 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-3 text-center sm:text-left">
          <p>© {new Date().getFullYear()} TenderHub. Official tender notices remain the copyright of their respective issuing government authorities.</p>
          <div className="flex gap-4">
            <Link to="/about" className="hover:text-slate-300 transition-colors">Privacy</Link>
            <Link to="/contact" className="hover:text-slate-300 transition-colors">Contact</Link>
            <span className="text-slate-600 font-mono">v1.2.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
}