/**
 * Utility for formatting currency and dates
 */

export const Formatter = {
    /**
     * Converts a number to BRL currency string
     * @param {number} value - Value in cents
     */
    currency(value) {
        return (value / 100).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });
    },

    /**
     * Formats a date string for display (DD/MM/YYYY)
     * @param {string} dateStr - YYYY-MM-DD
     */
    dateDisplay(dateStr) {
        if (!dateStr) return '---';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    },

    /**
     * Converts a float value to cents (integer)
     * @param {number|string} val 
     */
    toCents(val) {
        return Math.round((parseFloat(val) || 0) * 100);
    },

    /**
     * Converts cents to float
     * @param {number} cents 
     */
    fromCents(cents) {
        return cents / 100;
    },

    /**
     * Safely adds days to a date string (UTC)
     * @param {string} dateStr - YYYY-MM-DD
     * @param {number} days 
     */
    addDays(dateStr, days) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(Date.UTC(y, m - 1, d));
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().split('T')[0];
    },

    /**
     * Calculates days between two date strings
     */
    daysBetween(startStr, endStr) {
        const d1 = new Date(startStr);
        const d2 = new Date(endStr);
        return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
    },

    /**
     * Gets day of week (0-6)
     */
    getDayOfWeek(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    }
};
