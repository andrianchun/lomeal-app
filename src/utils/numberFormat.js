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
