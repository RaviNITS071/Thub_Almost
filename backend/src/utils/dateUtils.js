/**
 * Utility functions for parsing and formatting Indian government tender dates.
 * All tender dates on jktenders.gov.in and NIC-GEP portals are in Indian Standard Time (IST, UTC+05:30).
 */

/**
 * Parses Indian government tender date strings (IST, UTC+05:30) into accurate Date objects.
 * Supports:
 * - '18-Sep-2026 06:00 PM'
 * - '18-SEP-2026 06:00 PM'
 * - '29-Sep-2026 11:00 AM'
 * - '15-09-2026 04:00 PM'
 * - '18-Sep-2026'
 * - '18/09/2026 06:00 PM'
 * - ISO strings ('2026-09-18T12:30:00.000Z')
 * - Existing Date objects
 *
 * @param {string|Date} dateStr - Raw date string from tender portal or Date instance
 * @returns {Date|null} Parsed Date in UTC representing the exact IST moment, or null if invalid
 */
export function parseISTDate(dateStr) {
  if (!dateStr || dateStr === 'NA' || dateStr === 'N/A' || (typeof dateStr === 'string' && dateStr.trim() === '')) {
    return null;
  }
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }

  const str = String(dateStr).trim();

  // If already an ISO string with Z or timezone offset (e.g. 2026-09-18T12:30:00.000Z or +05:30)
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  const monthMap = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  // Match DD-MMM-YYYY or DD-MM-YYYY or DD/MM/YYYY with optional [hh:mm[:ss] [AM|PM]]
  const m = str.match(/^(\d{1,2})[-/]([a-zA-Z]{3}|\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m) {
    const day = m[1].padStart(2, '0');
    let month = m[2].toLowerCase();
    if (monthMap[month]) {
      month = monthMap[month];
    } else {
      month = month.padStart(2, '0');
    }
    const year = m[3];

    let hours = m[4] ? parseInt(m[4], 10) : 0;
    const minutes = m[5] ? m[5].padStart(2, '0') : '00';
    const seconds = m[6] ? m[6].padStart(2, '0') : '00';
    const ampm = m[7] ? m[7].toUpperCase() : null;

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const hoursStr = String(hours).padStart(2, '0');

    // Portal timestamps are in Indian Standard Time (IST) -> UTC+05:30
    const isoString = `${year}-${month}-${day}T${hoursStr}:${minutes}:${seconds}+05:30`;
    const d = new Date(isoString);
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback: try appending +05:30 to replaced string
  try {
    const cleaned = str.replace(/-/g, ' ');
    const withTz = cleaned.includes('+') || cleaned.includes('Z') ? cleaned : `${cleaned} +05:30`;
    const ts = Date.parse(withTz);
    if (!isNaN(ts)) return new Date(ts);
  } catch {}

  const ts = Date.parse(str);
  return !isNaN(ts) ? new Date(ts) : null;
}

/**
 * Formats time into standard 12-hour format (like "4:15 PM", "10:00 AM", "2:00 PM").
 * Removes leading zero on hours.
 *
 * @param {string|Date} dateOrStr
 * @returns {string} Standard formatted time string, or empty string if invalid
 */
export function formatStandardTime(dateOrStr) {
  if (!dateOrStr || dateOrStr === 'NA' || dateOrStr === 'N/A') return '';

  if (typeof dateOrStr === 'string') {
    const trimmed = dateOrStr.trim();
    // Direct regex match for "hh:mm[:ss] [AM|PM]" inside portal strings
    const m = trimmed.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (m) {
      let hours = parseInt(m[1], 10);
      const minutes = m[2];
      const ampm = m[4] ? m[4].toUpperCase() : null;

      if (ampm) {
        // Already 12-hour: ensure single-digit hour has no leading zero
        return `${hours}:${minutes} ${ampm}`;
      } else {
        // 24-hour time to 12-hour
        const period = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        if (hours === 0) hours = 12;
        return `${hours}:${minutes} ${period}`;
      }
    }
  }

  // Fallback to parsed Date in IST
  const d = parseISTDate(dateOrStr);
  if (!d) return '';

  const timeStr = d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return timeStr.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

/**
 * Extracts raw date string, date-only string, and standard formatted time from tender portal strings.
 *
 * @param {string|Date} dateOrStr
 * @returns {{ fullStr: string, dateOnly: string, time: string, date: Date|null }}
 */
export function extractDateParts(dateOrStr) {
  if (!dateOrStr || dateOrStr === 'NA' || dateOrStr === 'N/A') {
    return { fullStr: null, dateOnly: null, time: null, date: null };
  }

  const fullStr = typeof dateOrStr === 'string' ? dateOrStr.trim() : null;
  const date = parseISTDate(dateOrStr);
  const time = formatStandardTime(dateOrStr);

  let dateOnly = null;
  if (fullStr) {
    const m = fullStr.match(/^(\d{1,2}[-/][a-zA-Z]{3}[-/]\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/);
    if (m) dateOnly = m[1];
  } else if (date) {
    dateOnly = date.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  return { fullStr, dateOnly, time: time || null, date };
}
