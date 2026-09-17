/**
 * @file src/pages/Pricing.jsx
 * @description Transparent subscription tiers for regional contractors and engineering consortia.
 */
import { Check, Shield, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function Pricing() {
  const plans = [
    {
      name: 'Contractor Free',
      price: '₹0',
      period: 'forever',
      desc: 'Essential public works discovery tools for independent regional contractors.',
      perks: [
        'Search active tenders across all 20 J&K districts',
        'Save up to 10 bookmarked tender notices',
        'Direct link helper to official portal searches',
        'Department & district keyword filtering',
        'Daily directory synchronization'
      ],
      cta: 'Current Plan',
      popular: false,
    },
    {
      name: 'Contractor Pro',
      price: '₹2,499',
      period: 'per month',
      desc: 'For active bidding firms requiring instant NIT access, corrigenda alerts, and site locations.',
      perks: [
        'Everything in Free tier',
        'Fast Cloudflare R2 NIT PDF document views',
        'Daily deadline notifications & updates',
        'Specific project site & location mapping',
        'Export tender pipelines to Excel / CSV',
        'Priority technical support desk'
      ],
      cta: 'Upgrade to Pro',
      popular: true,
    },
    {
      name: 'Enterprise Consortium',
      price: '₹7,999',
      period: 'per month',
      desc: 'Full API access and multi-seat workspace for large infrastructure contractors.',
      perks: [
        'Everything in Contractor Pro',
        'REST API & Webhook data feeds',
        'Multi-user seats (up to 10 engineers)',
        'Custom department tracking requests',
        'Dedicated regional account liaison',
        'SLA guaranteed data synchronization'
      ],
      cta: 'Contact Enterprise Desk',
      popular: false,
    },
  ];

  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 py-10 sm:py-16 px-3 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Title */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] sm:text-xs font-semibold border border-slate-200 dark:border-slate-700">
            <Shield className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" />
            <span>Transparent Subscription Plans</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
            Plans for Independent Contractors &amp; Firms
          </h1>
          <p className="text-xs sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Choose the subscription plan that aligns with your public sector bidding requirements.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan, i) => (
            <div 
              key={i} 
              className={`bg-white dark:bg-slate-800 rounded-2xl p-5 sm:p-7 border flex flex-col justify-between relative shadow-xs transition-colors ${
                i === 2 ? 'md:col-span-2 lg:col-span-1' : ''
              } ${
                plan.popular 
                  ? 'border-dalBlue dark:border-blue-500 ring-1 ring-dalBlue/10 dark:ring-blue-500/20' 
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-dalBlue text-white text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-xs whitespace-nowrap">
                  Recommended for Contractors
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-white">
                    {plan.name}
                  </h3>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed min-h-[32px] sm:min-h-[36px]">
                  {plan.desc}
                </p>

                <div className="my-5 sm:my-6 pb-4 sm:pb-5 border-b border-slate-100 dark:border-slate-700/60">
                  <span className="font-mono text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
                    {plan.price}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 ml-1.5 font-medium">
                    / {plan.period}
                  </span>
                </div>

                <div className="space-y-2.5">
                  <span className="block text-[10px] sm:text-[11px] font-bold uppercase text-slate-400 dark:text-slate-400 tracking-wider">
                    Plan Highlights
                  </span>
                  <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    {plan.perks.map((perk, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 sm:mt-8 pt-4 border-t border-slate-100 dark:border-slate-700/60">
                <Button 
                  variant={plan.popular ? 'default' : 'outline'}
                  className={`w-full text-xs font-bold py-2.5 rounded-xl ${
                    plan.popular
                      ? 'bg-dalBlue hover:bg-dalBlue-700 text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>{plan.cta}</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}