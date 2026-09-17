/**
 * @file src/components/layout/Navbar.jsx
 * @description Classical, human-crafted top navigation with reliable theme toggle,
 * clear institutional branding, and responsive mobile navigation.
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Landmark, Heart, User, Menu, X, Sun, Moon, LogIn, LogOut } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { useBookmarkStore } from '@/store/useBookmarkStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/context/ThemeProvider';

export function Navbar() {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Subscribe to global stores
  const savedTenders = useBookmarkStore((state) => state.savedTenders);
  const { user, isAuthenticated, logout } = useAuthStore();

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'Browse Tenders', path: '/tenders' },
    { label: 'Pricing & Plans', path: '/pricing' },
    { label: 'About Platform', path: '/about' },
    { label: 'Contact', path: '/contact' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Institutional Brand Identity */}
        <Link to="/" className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-dalBlue text-white flex items-center justify-center shadow-xs shrink-0">
            <Landmark className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-lg font-display font-black tracking-tight text-dalBlue dark:text-white leading-none">
                Tender<span className="text-chinarRed">Hub</span>
              </span>
              <span className="text-[9px] sm:text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                J&amp;K
              </span>
            </div>
            <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium tracking-normal mt-0.5 hidden sm:block">
              Public Works &amp; Procurement
            </span>
          </div>
        </Link>

        {/* Desktop & Tablet Navigation */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-1.5">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`px-2.5 lg:px-3.5 py-1.5 rounded-xl text-[11px] lg:text-xs font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-chinarRed ${
                  isActive
                    ? 'bg-dalBlue/10 dark:bg-blue-500/25 text-dalBlue dark:text-blue-200 font-bold border border-dalBlue/30 dark:border-blue-400/40 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-dalBlue dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-600 border border-transparent'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Action Center: Theme, Saved & Contractor Workspace / Auth */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Dependable Light/Dark Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-transparent hover:border-slate-300 dark:hover:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-dalBlue dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-chinarRed"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle theme"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>

          {/* Saved Tenders Indicator */}
          <Link
            to="/profile"
            className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-transparent hover:border-red-200 dark:hover:border-red-900 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-chinarRed dark:hover:text-red-400 hover:bg-red-50/60 dark:hover:bg-red-950/30 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-chinarRed"
            title="Saved Tenders"
          >
            <Heart className="w-4 h-4" />
            {savedTenders.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-chinarRed text-white text-[9px] font-mono font-bold flex items-center justify-center shadow-xs">
                {savedTenders.length}
              </span>
            )}
          </Link>

          {/* User Auth / Contractor Workspace */}
          {isAuthenticated ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                to="/profile"
                className="hidden sm:inline-flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-dalBlue dark:text-slate-200 hover:border-dalBlue dark:hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-chinarRed"
                title={user?.email}
              >
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name || 'User'}
                    className="w-4 h-4 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-dalBlue/10 dark:bg-blue-500/20 text-dalBlue dark:text-blue-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {(user?.name || user?.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <span className="max-w-[70px] md:max-w-[100px] lg:max-w-[130px] truncate">
                  {user?.name || user?.email?.split('@')[0] || 'Contractor'}
                </span>
              </Link>

              <button
                onClick={logout}
                title="Sign Out"
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-transparent hover:border-red-200 dark:hover:border-red-900 flex items-center justify-center text-slate-500 hover:text-chinarRed dark:hover:text-red-400 hover:bg-red-50/60 dark:hover:bg-red-950/20 transition-all cursor-pointer focus:outline-none"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Link
                to="/signup"
                className="hidden sm:inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-all"
              >
                <span>Register</span>
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-dalBlue hover:bg-dalBlue/90 text-white text-xs font-bold shadow-xs hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-chinarRed cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </Link>
            </div>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* Mobile Drawer Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4 space-y-2 overflow-hidden"
          >
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`min-h-[42px] flex items-center px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  location.pathname === link.path
                    ? 'bg-dalBlue/10 dark:bg-blue-500/20 text-dalBlue dark:text-blue-300 font-bold border border-dalBlue/20 dark:border-blue-500/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                }`}
              >
                {link.label}
              </Link>
            ))}

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-[42px] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-dalBlue dark:text-white bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60"
              >
                <User className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Contractor Workspace</span>
              </Link>

              {isAuthenticated ? (
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 min-h-[44px]">
                  <div className="flex items-center gap-2 min-w-0">
                    {user?.picture ? (
                      <img
                        src={user.picture}
                        alt="Profile"
                        className="w-6 h-6 rounded-full object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-dalBlue text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {(user?.name || user?.email || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                      {user?.email}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer py-1 px-2 rounded-lg"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="min-h-[42px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In</span>
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setMobileMenuOpen(false)}
                    className="min-h-[42px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-dalBlue hover:bg-dalBlue/90 shadow-xs"
                  >
                    <span>Register</span>
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}