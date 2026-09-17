/**
 * @file frontend/src/pages/Login.jsx
 * @description Production-ready authentication page with strict separation between:
 * 1. Login (for existing contractors)
 * 2. Signup (for new contractors only, with optional profile & preference onboarding fields)
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { 
  Landmark, 
  Mail, 
  ShieldCheck, 
  ArrowRight, 
  RotateCcw, 
  AlertCircle, 
  CheckCircle2, 
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Building,
  User,
  MapPin,
  Sliders,
  BadgeCheck
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const REGISTRATION_CLASSES = [
  'Class A Works',
  'Class B Works',
  'Class C Works',
  'Class D Works',
  'Special Class Works',
  'Hot Mix Plant Operator',
  'Electrical Class 1 Contractor'
];

const PREF_DISTRICT_OPTIONS = [
  'All 20 Districts',
  'Baramulla', 'Bandipora', 'Srinagar', 'Jammu', 'Pulwama',
  'Anantnag', 'Kulgam', 'Budgam', 'Kupwara', 'Ganderbal',
  'Shopian', 'Udhampur', 'Reasi', 'Kathua', 'Samba',
  'Rajouri', 'Poonch', 'Doda', 'Ramban', 'Kishtwar'
];

const PREF_SECTOR_OPTIONS = [
  'Civil Works',
  'Electrical Works',
  'Water Equipments/ Meter/ Drilling/ Boring',
  'Electrical and Maintenance Works',
  'Civil Works - Others',
  'Roads & Bridges',
  'Information Technology'
];

export default function Login({ defaultMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Mode: 'login' | 'signup'
  const initialMode = defaultMode || (location.pathname === '/signup' ? 'signup' : 'login');
  const [mode, setMode] = useState(initialMode);

  const { 
    isAuthenticated, 
    sendOtp, 
    verifyOtp, 
    loginWithGoogle, 
    error: storeError, 
    clearError 
  } = useAuthStore();

  // Multi-step State: 'email' | 'otp'
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [errorContext, setErrorContext] = useState(null); // 'not_found' | 'already_exists'
  const [cooldown, setCooldown] = useState(0);

  // Optional contractor onboarding details during signup
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [profileDetails, setProfileDetails] = useState({
    name: '',
    affiliation: '',
    contractorId: '',
    registrationClass: 'Class A Works',
    jurisdiction: 'Jammu & Kashmir / North Zone',
    preferences: {
      preferredLocations: ['All 20 Districts'],
      targetSectors: ['Civil Works'],
      minTenderValue: 0,
      preferEmdExemption: false,
    },
  });

  const otpInputsRef = useRef([]);

  // Check URL parameters for OAuth errors, mode, or callbacks
  useEffect(() => {
    const oauthError = searchParams.get('error');
    const emailParam = searchParams.get('email');
    if (emailParam) setEmail(emailParam);

    if (oauthError) {
      if (oauthError === 'no_account') {
        setLocalError('No account found for this Google email. Please create your contractor account.');
        setMode('signup');
      } else if (oauthError === 'account_exists') {
        setLocalError('An account with this Google email already exists. Please sign in.');
        setMode('login');
      } else if (oauthError === 'google_cancelled') {
        setLocalError('Google authentication was cancelled.');
      } else if (oauthError === 'invalid_oauth_state') {
        setLocalError('Authentication session expired. Please try again.');
      } else {
        setLocalError('Google authentication failed. Please try Email OTP.');
      }
    }

    if (searchParams.get('auth') === 'success' || isAuthenticated) {
      navigate('/profile', { replace: true });
    }
  }, [searchParams, isAuthenticated, navigate]);

  // Sync mode with route changes
  useEffect(() => {
    if (location.pathname === '/signup') setMode('signup');
    else if (location.pathname === '/login') setMode('login');
  }, [location.pathname]);

  // Resend countdown timer
  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const switchMode = (newMode) => {
    setMode(newMode);
    setStep('email');
    setLocalError('');
    setErrorContext(null);
    clearError();
  };

  // Handle Send OTP
  const handleSendOtp = async (e) => {
    e?.preventDefault();
    if (!email || !email.includes('@')) {
      setLocalError('Please enter a valid email address.');
      return;
    }

    setLocalError('');
    setErrorContext(null);
    clearError();
    setIsSubmitting(true);

    const result = await sendOtp(email.trim(), mode);
    setIsSubmitting(false);

    if (result.success) {
      setStep('otp');
      setCooldown(result.data?.cooldownSeconds || 60);
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 100);
    } else {
      setLocalError(result.error);
      if (result.notFound) setErrorContext('not_found');
      if (result.alreadyExists) setErrorContext('already_exists');
    }
  };

  // Handle OTP digit box input
  const handleDigitChange = (index, value) => {
    const sanitized = value.replace(/\D/g, '');
    if (!sanitized) {
      const updated = [...otpDigits];
      updated[index] = '';
      setOtpDigits(updated);
      return;
    }

    // If pasted full 6 digits
    if (sanitized.length > 1) {
      const digits = sanitized.slice(0, 6).split('');
      const updated = [...otpDigits];
      digits.forEach((d, i) => {
        if (i < 6) updated[i] = d;
      });
      setOtpDigits(updated);
      const nextIndex = Math.min(digits.length, 5);
      otpInputsRef.current[nextIndex]?.focus();
      return;
    }

    const updated = [...otpDigits];
    updated[index] = sanitized[0];
    setOtpDigits(updated);

    // Auto advance to next box
    if (index < 5 && sanitized) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  // Handle Backspace navigation across OTP boxes
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  // Handle Verify OTP
  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    const fullOtp = otpDigits.join('');

    if (fullOtp.length !== 6) {
      setLocalError('Please enter the complete 6-digit verification code.');
      return;
    }

    setLocalError('');
    clearError();
    setIsSubmitting(true);

    const result = await verifyOtp(
      email.trim(), 
      fullOtp, 
      mode, 
      mode === 'signup' ? profileDetails : {}
    );
    setIsSubmitting(false);

    if (result.success) {
      navigate('/profile', { replace: true });
    } else {
      setLocalError(result.error);
    }
  };

  const errorMessage = localError || storeError;

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-8 sm:py-12 px-3 sm:px-6 lg:px-8 bg-paper dark:bg-slate-900 transition-colors duration-200">
      <div className="w-full max-w-lg space-y-5 sm:space-y-6">
        
        {/* Brand Card Header */}
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2.5 mx-auto">
            <div className="w-10 h-10 rounded-xl bg-dalBlue text-white flex items-center justify-center shadow-xs">
              <Landmark className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-display font-black tracking-tight text-dalBlue dark:text-white leading-none">
              Tender<span className="text-chinarRed">Hub</span>
            </span>
            <span className="text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
              J&amp;K
            </span>
          </Link>
          <h2 className="text-xl font-bold font-display text-slate-900 dark:text-white pt-2">
            {step === 'otp' 
              ? 'Check Your Email'
              : mode === 'signup' 
                ? 'Create Contractor Account' 
                : 'Sign In to Workspace'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {step === 'otp'
              ? `We sent a 6-digit verification code to ${email}`
              : mode === 'signup'
                ? 'Register your profile to track civil works, set alert radars, and bookmark tenders across J&K.'
                : 'Access your saved tenders, alerts, and verified J&K public works procurement.'}
          </p>
        </div>

        {/* Main Authentication Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl sm:rounded-3xl p-4 xs:p-5 sm:p-8 shadow-xs space-y-4 sm:space-y-5">
          
          {/* Mode Selector Tabs (only shown on email step) */}
          {step === 'email' && (
            <div className="flex rounded-2xl bg-slate-100 dark:bg-slate-900/80 p-1 border border-slate-200 dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white dark:bg-slate-800 text-dalBlue dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-white dark:bg-slate-800 text-dalBlue dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Create Account (New User)
              </button>
            </div>
          )}

          {/* Error Banner with helpful cross-mode suggestions */}
          {errorMessage && (
            <div className="space-y-2">
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <span>{errorMessage}</span>
                  {errorContext === 'not_found' && (
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="block font-bold text-dalBlue dark:text-blue-300 underline hover:no-underline cursor-pointer pt-0.5"
                    >
                      Click here to create a new account with this email →
                    </button>
                  )}
                  {errorContext === 'already_exists' && (
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="block font-bold text-dalBlue dark:text-blue-300 underline hover:no-underline cursor-pointer pt-0.5"
                    >
                      Click here to sign in with this email →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ---------------- STEP 1: EMAIL & CREDENTIALS ---------------- */}
          {step === 'email' && (
            <div className="space-y-5">
              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={() => loginWithGoogle(mode)}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold shadow-xs hover:border-slate-400 dark:hover:border-slate-600 transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-dalBlue/30"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.29 21.39 7.35 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.99 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.29 2.61 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>{mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}</span>
              </button>

              {/* Clean Divider */}
              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 dark:border-slate-700 w-full" />
                <span className="bg-white dark:bg-slate-800 px-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider whitespace-nowrap">
                  Or use Email OTP
                </span>
                <div className="border-t border-slate-200 dark:border-slate-700 w-full" />
              </div>

              {/* Form */}
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Official Email Address <span className="text-chinarRed">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 sm:top-3" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contractor@domain.com"
                      required
                      className="pl-9 text-xs sm:text-sm h-10 sm:h-11"
                    />
                  </div>
                </div>

                {/* SIGNUP ONLY: Optional Contractor Onboarding Details */}
                {mode === 'signup' && (
                  <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-900/40 space-y-3.5">
                    <button
                      type="button"
                      onClick={() => setShowOptionalFields(!showOptionalFields)}
                      className="w-full flex items-center justify-between text-left cursor-pointer focus:outline-none"
                    >
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-dalBlue dark:text-blue-400" />
                        <div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Contractor Profile &amp; Preferences
                          </span>
                          <span className="ml-2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                            All Optional
                          </span>
                        </div>
                      </div>
                      {showOptionalFields ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Customize your radar and contractor workspace now, or fill these out anytime later in your profile.
                    </p>

                    {showOptionalFields && (
                      <div className="space-y-3 pt-2 border-t border-slate-200/80 dark:border-slate-700/60 animate-in fade-in duration-150">
                        {/* Contractor Full Name */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Representative / Full Name
                          </label>
                          <Input
                            type="text"
                            value={profileDetails.name}
                            onChange={(e) => setProfileDetails({ ...profileDetails, name: e.target.value })}
                            placeholder="e.g. Ravi Shankar"
                            className="text-xs h-9"
                          />
                        </div>

                        {/* Firm / Company Affiliation */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Firm / Affiliation / Department
                          </label>
                          <Input
                            type="text"
                            value={profileDetails.affiliation}
                            onChange={(e) => setProfileDetails({ ...profileDetails, affiliation: e.target.value })}
                            placeholder="e.g. M/S Valley Infratech / NIT Srinagar"
                            className="text-xs h-9"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Contractor Registration ID */}
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                              Contractor ID / Reg. No.
                            </label>
                            <Input
                              type="text"
                              value={profileDetails.contractorId}
                              onChange={(e) => setProfileDetails({ ...profileDetails, contractorId: e.target.value })}
                              placeholder="e.g. JK-PWD-2026"
                              className="text-xs h-9 font-mono"
                            />
                          </div>

                          {/* Registration Class */}
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                              Registration Class
                            </label>
                            <select
                              value={profileDetails.registrationClass}
                              onChange={(e) => setProfileDetails({ ...profileDetails, registrationClass: e.target.value })}
                              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-dalBlue/30"
                            >
                              {REGISTRATION_CLASSES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Preferred Operating District */}
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                              Primary District
                            </label>
                            <select
                              value={profileDetails.preferences.preferredLocations[0] || 'All 20 Districts'}
                              onChange={(e) => setProfileDetails({
                                ...profileDetails,
                                preferences: {
                                  ...profileDetails.preferences,
                                  preferredLocations: [e.target.value]
                                }
                              })}
                              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-dalBlue/30"
                            >
                              {PREF_DISTRICT_OPTIONS.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </div>

                          {/* Target Work Category */}
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                              Target Sector
                            </label>
                            <select
                              value={profileDetails.preferences.targetSectors[0] || 'Civil Works'}
                              onChange={(e) => setProfileDetails({
                                ...profileDetails,
                                preferences: {
                                  ...profileDetails.preferences,
                                  targetSectors: [e.target.value]
                                }
                              })}
                              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-dalBlue/30"
                            >
                              {PREF_SECTOR_OPTIONS.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-dalBlue hover:bg-dalBlue-700 text-white font-bold py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending verification code...</span>
                    </>
                  ) : (
                    <>
                      <span>{mode === 'signup' ? 'Send Registration Code' : 'Send Sign-in Code'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>

              {/* Bottom switch link */}
              <div className="pt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                {mode === 'signup' ? (
                  <span>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="font-bold text-dalBlue dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Sign in here
                    </button>
                  </span>
                ) : (
                  <span>
                    New to TenderHub?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-bold text-dalBlue dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Create contractor account
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ---------------- STEP 2: OTP VERIFICATION ---------------- */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setLocalError('');
                  }}
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-dalBlue dark:hover:text-white flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" /> Change email
                </button>
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300 font-semibold truncate max-w-[130px] xs:max-w-[180px] sm:max-w-[240px]">
                  {email}
                </span>
              </div>

              {/* 6 Individual Digit Inputs */}
              <div>
                <label className="block text-center text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  Enter 6-Digit Verification Code
                </label>
                <div className="flex justify-center gap-1.5 sm:gap-2.5 md:gap-3">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (otpInputsRef.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      autoFocus={index === 0}
                      className="w-8 xs:w-10 sm:w-12 h-11 xs:h-12 sm:h-14 text-center text-lg xs:text-xl sm:text-2xl font-bold font-mono rounded-lg xs:rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 focus:ring-2 focus:ring-dalBlue/20 shadow-xs transition-all"
                    />
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <Button
                  type="submit"
                  disabled={isSubmitting || otpDigits.join('').length !== 6}
                  className="w-full bg-dalBlue hover:bg-dalBlue-700 text-white font-bold py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{mode === 'signup' ? 'Creating your account...' : 'Verifying code...'}</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>{mode === 'signup' ? 'Complete Registration' : 'Verify & Sign In'}</span>
                    </>
                  )}
                </Button>

                {/* Resend Cooldown Section */}
                <div className="text-center pt-2">
                  {cooldown > 0 ? (
                    <span className="text-xs text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Resend code in {cooldown}s</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={isSubmitting}
                      className="text-xs font-semibold text-dalBlue dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Didn't receive the code? Resend email
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}

        </div>

        {/* Security & Regulatory Institutional Badge */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            <BadgeCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Official TenderHub Jammu &amp; Kashmir Portal Identity</span>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            Protected by HttpOnly cookies, session encryption, and rate-limited abuse prevention.
          </p>
        </div>

      </div>
    </div>
  );
}
