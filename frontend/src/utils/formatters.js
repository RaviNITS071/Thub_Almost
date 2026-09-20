/**
 * @file src/utils/formatters.js
 * @description Standardized enterprise formatting utilities for currency and dates.
 */

/**
 * Formats raw numeric values into standard Indian Rupee notation (e.g. ₹3 Lakh, ₹4.5 Cr).
 * Smartly handles missing data or Rate Contracts where value is 0.
 * 
 * @param {number|string} amount - Numerical value to format.
 * @returns {string} Formatted Indian Rupee string or contextual fallback.
 */
export const formatCurrencyINR = (amount) => {
  // Catch null, undefined, or empty strings
  if (amount === undefined || amount === null || amount === '') {
    return 'Not Specified';
  }
  
  const numericVal = Number(amount);
  
  // Catch strings that couldn't be converted to numbers (e.g., "NA")
  if (isNaN(numericVal)) {
    return 'Not Specified';
  }

  // Government portals often use 0 to indicate a Rate Contract or BOQ-dependent value
  if (numericVal === 0) {
    return 'Refer BOQ / Rate Contract';
  }
  
  if (numericVal >= 10000000) {
    return `₹${(numericVal / 10000000).toFixed(2)} Cr`;
  }
  if (numericVal >= 100000) {
    return `₹${(numericVal / 100000).toFixed(2)} Lakh`;
  }
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(numericVal);
};

/**
 * Formats ISO date string or MongoDB date objects into DD MMM YYYY display format.
 * 
 * @param {string|Date|Object} dateValue - Date object or ISO string.
 * @returns {string} Formatted readable date.
 */
export const formatDateDisplay = (dateValue) => {
  if (!dateValue || dateValue === 'NA' || dateValue === 'N/A') return 'N/A';
  
  const dateStr = typeof dateValue === 'object' && dateValue.$date ? dateValue.$date : dateValue;
  const parsed = new Date(dateStr);
  
  if (isNaN(parsed.getTime())) return 'N/A';
  
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

/**
 * Formats ISO date string or MongoDB date objects into readable Date and Time (e.g. "18 Sep 2026, 06:00 PM").
 * 
 * @param {string|Date|Object} dateValue - Date object or ISO string.
 * @returns {string} Formatted readable date with time.
 */
export const formatDateTimeDisplay = (dateValue) => {
  if (!dateValue || dateValue === 'NA' || dateValue === 'N/A') return 'N/A';
  
  const dateStr = typeof dateValue === 'object' && dateValue?.$date ? dateValue.$date : dateValue;
  const parsed = new Date(dateStr);
  
  if (isNaN(parsed.getTime())) return 'N/A';
  
  const formatted = parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return formatted.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
};

/**
 * Formats time only (e.g. "06:00 PM").
 * 
 * @param {string|Date|Object} dateValue - Date object or ISO string.
 * @returns {string} Formatted time string.
 */
export const formatTimeDisplay = (dateValue) => {
  if (!dateValue || dateValue === 'NA' || dateValue === 'N/A') return '';
  
  const dateStr = typeof dateValue === 'object' && dateValue?.$date ? dateValue.$date : dateValue;
  const parsed = new Date(dateStr);
  
  if (isNaN(parsed.getTime())) return '';
  
  const formatted = parsed.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return formatted.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
};


// Known famous districts and prominent towns in J&K (ordered specifically)
const FAMOUS_DISTRICTS_TOWNS = [
  'Baramulla', 'Bandipora', 'Anantnag', 'Kulgam', 'Pulwama',
  'Budgam', 'Kupwara', 'Ganderbal', 'Shopian', 'Udhampur', 'Reasi', 'Kathua',
  'Samba', 'Rajouri', 'Poonch', 'Doda', 'Ramban', 'Kishtwar', 'Leh', 'Kargil',
  'Katra', 'Sopore', 'Pattan', 'Handwara', 'Uri', 'Akhnoor', 'Bhaderwah', 'Bijbehara'
];

const MAJOR_INDIAN_CITIES = [
  'New Delhi', 'Delhi', 'Chandigarh', 'Shimla', 'Dehradun', 'Mumbai', 'Bengaluru', 'Kolkata', 'Hyderabad', 'Chennai'
];

/**
 * Normalizes raw tender location data into a recognizable, prominent city, town, or district.
 * Scans title, organisationChain, location string, and pincode prefix to extract clean, famous names.
 * 
 * @param {Object} tender - Tender object from MongoDB
 * @returns {string} Recognized city, town, or district name
 */
export const extractFamousLocation = (tender) => {
  if (!tender) return 'Jammu & Kashmir';

  const title = tender.title || '';
  const org = tender.organisationChain || '';
  const loc = tender.location || '';
  const combined = `${loc} ${title} ${org}`;

  // 1. Check known specific districts and towns first
  for (const place of FAMOUS_DISTRICTS_TOWNS) {
    if (new RegExp(`\\b${place}\\b`, 'i').test(combined)) {
      return place;
    }
  }

  // 2. Check for Srinagar explicitly
  if (/\bSrinagar\b/i.test(combined)) {
    return 'Srinagar';
  }

  // 3. Check for Jammu (stripping state-level "Jammu and Kashmir" / "Jammu & Kashmir" mentions)
  const textWithoutJK = combined.replace(/Jammu\s*(and|&)\s*Kashmir/gi, '');
  if (/\bJammu\b/i.test(textWithoutJK)) {
    return 'Jammu';
  }

  // 4. Check for major Indian cities outside J&K
  for (const city of MAJOR_INDIAN_CITIES) {
    if (new RegExp(`\\b${city}\\b`, 'i').test(combined)) {
      return city;
    }
  }

  // 5. Check Pincode prefix heuristics
  const pincode = tender.pincode?.toString() || '';
  if (pincode.startsWith('190')) return 'Srinagar';
  if (pincode.startsWith('193')) return 'Baramulla';
  if (pincode.startsWith('192')) return 'Anantnag';
  if (pincode.startsWith('180')) return 'Jammu';
  if (pincode.startsWith('182')) return 'Udhampur';

  // 6. If raw location exists and doesn't look like a scraped work description, sanitize it
  if (loc && !/construction|drilled|borewell|deep bore|village/i.test(loc)) {
    const trimmed = loc.trim();
    if (trimmed.length > 0 && trimmed.length <= 30) {
      return trimmed;
    }
  }

  return 'Jammu & Kashmir';
};

/**
 * Extracts a complete, structured work execution location from tender data.
 * Combines specific site/village details, famous district/city, postal PIN, and authority address.
 * 
 * @param {Object} tender - Tender object from MongoDB
 * @returns {Object} Structured work location details
 */
export const extractDetailedWorkLocation = (tender) => {
  if (!tender) {
    return {
      famousLocation: 'Jammu & Kashmir',
      specificSite: 'Work execution site as detailed in NIT documents',
      pincode: 'N/A',
      rawLocation: '',
      authorityAddress: 'Issuing Authority Office',
      bidOpeningPlace: 'District Division Office',
      mapSearchUrl: 'https://www.google.com/maps'
    };
  }

  const famous = extractFamousLocation(tender);
  const rawLoc = (tender.location || '').trim();
  const title = (tender.title || '').replace(/[[\]]/g, '').trim();
  const desc = (tender.workDescription || '').replace(/[[\]]/g, '').trim();
  const combined = `${desc} ${title}`;

  // 1. Try to extract specific village, block, site or land details
  let specificSite;

  const locMatch = combined.match(/Location\s+of\s+Work[:\s]+([^.]+)/i);
  if (locMatch && locMatch[1]) {
    specificSite = locMatch[1].trim();
  } else {
    const siteMatch = combined.match(/\b(?:at|in)\s+(?:Village\s+[^.,\n]+|the\s+land\s+of\s+[^.,\n]+|different villages spread over in\s+[^.,\n]+|Block\s+[^.,\n]+|various work sites in\s+[^.,\n]+)/i);
    if (siteMatch && siteMatch[0]) {
      specificSite = siteMatch[0].trim();
    } else if (rawLoc && !/^(?:construction|drilled|deep bore)/i.test(rawLoc)) {
      specificSite = rawLoc;
    } else {
      specificSite = title.length > 90 ? title.substring(0, 90) + '...' : title;
    }
  }

  const pincode = tender.pincode && tender.pincode !== '111111' ? tender.pincode : (tender.pincode || 'N/A');

  // Build query string for Google Maps
  const mapQueryParts = [];
  if (specificSite && !specificSite.startsWith('Location of Work:')) {
    mapQueryParts.push(specificSite);
  }
  if (famous && famous !== 'Jammu & Kashmir') {
    mapQueryParts.push(famous);
  }
  mapQueryParts.push('Jammu and Kashmir');
  if (pincode && pincode !== 'N/A' && pincode !== '111111') {
    mapQueryParts.push(pincode);
  }

  const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQueryParts.join(', '))}`;

  return {
    famousLocation: famous,
    specificSite,
    pincode,
    rawLocation: rawLoc,
    authorityAddress: tender.invitingAuthorityAddress || tender.invitingAuthorityName || 'Issuing Authority Office',
    bidOpeningPlace: tender.bidOpeningPlace || 'District Division Office',
    preBidMeetingPlace: tender.preBidMeetingPlace && tender.preBidMeetingPlace !== 'NA' ? tender.preBidMeetingPlace : null,
    preBidMeetingAddress: tender.preBidMeetingAddress && tender.preBidMeetingAddress !== 'NA' ? tender.preBidMeetingAddress : null,
    mapSearchUrl
  };
};
