/**
 * Text Utilities
 * 
 * Helper functions for text processing and formatting
 */

/**
 * HTML entity mappings for common entities
 */
const HTML_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&nbsp;': ' ',
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '=',
};

/**
 * Decodes HTML entities in a string
 * Useful for YouTube API responses which return HTML-encoded titles
 * 
 * @param text - The text containing HTML entities
 * @returns The decoded text with entities replaced by their characters
 * 
 * @example
 * decodeHtmlEntities('Hello &amp; World') // 'Hello & World'
 * decodeHtmlEntities('&quot;Quoted&quot;') // '"Quoted"'
 */
export function decodeHtmlEntities(text: string | null | undefined): string {
    if (!text) return '';

    let decoded = text;

    // Replace named entities
    for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
        decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }

    // Handle numeric character references (&#123; or &#x7B;)
    decoded = decoded.replace(/&#(\d+);/g, (_, code) => {
        return String.fromCharCode(parseInt(code, 10));
    });

    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
        return String.fromCharCode(parseInt(code, 16));
    });

    return decoded;
}

/**
 * Truncates text to a specified length, adding ellipsis if needed
 * 
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if it was shortened
 */
export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}
