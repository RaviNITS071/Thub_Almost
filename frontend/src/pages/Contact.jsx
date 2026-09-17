/**
 * @file src/pages/Contact.jsx
 * @description Operational support and inquiry desk with humanized classical layout and full light/dark harmony.
 */
import { useState } from 'react';
import { Mail, MapPin, Send, CheckCircle2, Clock, HelpCircle, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 py-10 sm:py-16 px-3 sm:px-6 lg:px-8 flex items-center transition-colors duration-200">
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-8 lg:p-10 shadow-xs">
        
        {/* Left Column: Institutional Info */}
        <div className="lg:col-span-5 space-y-5 sm:space-y-6 flex flex-col justify-between">
          <div className="space-y-2.5 sm:space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] sm:text-xs font-semibold border border-slate-200 dark:border-slate-600">
              <Landmark className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400 shrink-0" />
              <span>Operations &amp; Support Desk</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-bold font-display text-slate-900 dark:text-white tracking-tight">
              Get in Touch with our Technical Team
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
              Have questions regarding portal synchronization, tender document archives, or contractor notifications? Our technical support desk is available to assist.
            </p>
          </div>

          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
              <MapPin className="w-5 h-5 text-chinarRed shrink-0 mt-0.5" />
              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-400">Campus Location</span>
                <span className="text-xs font-semibold">NIT Campus, Hazratbal, Srinagar, J&amp;K 190006</span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
              <Mail className="w-5 h-5 text-dalBlue dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-400">Email Inquiries</span>
                <span className="text-xs font-mono font-semibold">support@tenderhub.in</span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
              <Clock className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-400">Operational Hours</span>
                <span className="text-xs font-semibold">Monday – Saturday, 09:30 AM – 06:00 PM IST</span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Inquiries are typically addressed within 1 business day.</span>
          </div>
        </div>

        {/* Right Column: Clean Form */}
        <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-900/40 rounded-xl p-6 sm:p-7 border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
          {submitted ? (
            <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center p-6 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display mb-1">Inquiry Registered</h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-sm">
                Thank you. Your message has been routed to our operations team. We will respond to your registered email shortly.
              </p>
              <Button
                variant="outline"
                className="mt-5 text-xs font-bold"
                onClick={() => setSubmitted(false)}
              >
                Submit Another Inquiry
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  Send a Message
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Complete the fields below to reach our regional desk.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name / Organization <span className="text-chinarRed">*</span>
                </label>
                <Input
                  required
                  placeholder="e.g. Ravi Shankar (Contractor)"
                  className="bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email Address <span className="text-chinarRed">*</span>
                  </label>
                  <Input
                    type="email"
                    required
                    placeholder="contact@domain.com"
                    className="bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Contact Phone (Optional)
                  </label>
                  <Input
                    type="tel"
                    placeholder="+91 98765 43210"
                    className="bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Subject / Topic
                </label>
                <select className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-dalBlue">
                  <option>Tender Notification &amp; Email Alerts</option>
                  <option>PDF Ingestion &amp; Archive Sync</option>
                  <option>Regional District Coverage Request</option>
                  <option>Contractor Account Verification</option>
                  <option>General Support or Feedback</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Message Details <span className="text-chinarRed">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Please describe your inquiry, including relevant tender reference numbers..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-dalBlue"
                />
              </div>

              <Button
                type="submit"
                className="w-full gap-2 mt-2 bg-dalBlue hover:bg-dalBlue-700 text-white font-bold py-2.5 text-xs shadow-xs"
              >
                Send Inquiry <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}