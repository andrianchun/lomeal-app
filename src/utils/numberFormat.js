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
 * Parses a localized number string back to a valid JS number (float).
 * Useful for inputs.
 * @param {string} formattedValue - The localized string
 * @param {string} language - 'ID' or 'EN'
 * @returns {number|string} The raw parsed number (or empty string if invalid)
 */
export const parseFormattedNumber = (formattedValue, language = 'ID') => {
    if (formattedValue === null || formattedValue === undefined || formattedValue === '') return '';
    
    let str = formattedValue.toString();
    
    if (language === 'ID') {
        if (str.includes(',')) {
            // Comma is present, it acts as the decimal separator. All dots are thousands separators.
            str = str.replace(/\./g, '').replace(/,/g, '.');
        } else {
            // No comma. Check if the last dot is acting as a decimal separator.
            // Di mode ID, kita asumsikan semua titik (dot) adalah pemisah ribuan.
            // Input desimal dari keyboard numpad (.) sudah di-intercept di SwipeInput menjadi koma (,).
            str = str.replace(/\./g, '');
        }
    } else {
        // EN mode: commas are thousands separators, dot is decimal.
        if (str.includes('.')) {
            // Dot is present, so comma is definitively a thousands separator.
            str = str.replace(/,/g, '');
        } else {
            // No dot. Check if the last comma is acting as a decimal separator.
            const lastCommaIndex = str.lastIndexOf(',');
            if (lastCommaIndex !== -1) {
                const charsAfterComma = str.length - 1 - lastCommaIndex;
                if (charsAfterComma < 3) {
                    // It's a decimal separator (e.g., "10,5", "10,")
                    const integerPart = str.substring(0, lastCommaIndex).replace(/,/g, '');
                    const fractionalPart = str.substring(lastCommaIndex + 1);
                    str = integerPart + '.' + fractionalPart;
                } else {
                    // 3 or more digits after the comma (e.g., "1,000", "1,0000"). Assume thousands separator.
                    str = str.replace(/,/g, '');
                }
            }
        }
    }
    
    return str;
};
