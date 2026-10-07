/**
 * Formats a number with thousands separators and localized decimal points.
 * @param {number|string} value - The number to format
 * @param {string} language - 'ID' for Indonesian (dots for thousands, comma for decimal), 'EN' for English. Default is 'ID'.
 * @param {number} maximumFractionDigits - Max decimal places (default 2)
 * @returns {string} The formatted string
 */
export const formatNumber = (value, language = 'ID', maximumFractionDigits = 2) => {
    if (value === null || value === undefined || value === '') return '';
    
    // Convert to number, handle string inputs safely
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '.')) : Number(value);
    
    if (isNaN(num)) return value; // Fallback to original if not a number

    const locale = language === 'ID' ? 'id-ID' : 'en-US';
    return new Intl.NumberFormat(locale, {
        maximumFractionDigits,
    }).format(num);
};

/**
 * Formats a 24-hour time string ("HH:mm") according to time format preference ('24h' or '12h').
 * @param {string} timeStr - Time string in "HH:mm"
 * @param {string} format - '24h' or '12h' (default: '24h')
 * @returns {string} Formatted time string
 */
export const formatTimeDisplay = (timeStr, format = '24h') => {
    if (!timeStr || typeof timeStr !== 'string') return '--:--';
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = (parts[1] || '00').slice(0, 2).padStart(2, '0');
    if (isNaN(h)) return timeStr;

    if (format === '12h') {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
    }
    return `${String(h).padStart(2, '0')}:${m}`;
};
