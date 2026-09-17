/**
 * @file src/components/ui/Modal.jsx
 * @description Accessible modal dialog wrapper with frosted backdrop and obsidian dark mode.
 */
import { cn } from '@/utils/cn';

export function Dialog({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg flex justify-center">
        {children}
      </div>
    </div>
  );
}

export function DialogContent({ className, children }) {
  return (
    <div className={cn("bg-white dark:bg-[#111827] border border-border dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-h-[90vh] overflow-y-auto filter-scrollbar p-4 xs:p-5 sm:p-6 animate-in zoom-in-95 duration-200 relative text-charcoal dark:text-slate-100", className)}>
      {children}
    </div>
  );
}

export function DialogHeader({ className, children }) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}>{children}</div>;
}

export function DialogTitle({ className, children }) {
  return <h3 className={cn("text-xl font-black font-display leading-none tracking-tight text-dalBlue dark:text-white", className)}>{children}</h3>;
}

export function DialogDescription({ className, children }) {
  return <p className={cn("text-sm font-medium text-charcoal/60 dark:text-slate-400", className)}>{children}</p>;
}