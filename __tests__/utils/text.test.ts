/**
 * Text Utilities Tests
 */

import { decodeHtmlEntities, truncateText } from '@/utils/text';

describe('Text Utilities', () => {
    describe('decodeHtmlEntities', () => {
        it('should decode &amp; to &', () => {
            expect(decodeHtmlEntities('Hello &amp; World')).toBe('Hello & World');
        });

        it('should decode &quot; to double quotes', () => {
            expect(decodeHtmlEntities('&quot;Hello&quot;')).toBe('"Hello"');
        });

        it('should decode &lt; and &gt; to angle brackets', () => {
            expect(decodeHtmlEntities('&lt;tag&gt;')).toBe('<tag>');
        });

        it('should decode &#39; and &apos; to single quotes', () => {
            expect(decodeHtmlEntities("It&#39;s")).toBe("It's");
            expect(decodeHtmlEntities("It&apos;s")).toBe("It's");
        });

        it('should decode &nbsp; to space', () => {
            expect(decodeHtmlEntities('Hello&nbsp;World')).toBe('Hello World');
        });

        it('should decode numeric character references', () => {
            expect(decodeHtmlEntities('&#65;')).toBe('A'); // Decimal
            expect(decodeHtmlEntities('&#x41;')).toBe('A'); // Hex
        });

        it('should handle multiple entities in one string', () => {
            expect(decodeHtmlEntities('&quot;Hello&quot; &amp; &quot;World&quot;'))
                .toBe('"Hello" & "World"');
        });

        it('should return empty string for null/undefined', () => {
            expect(decodeHtmlEntities(null)).toBe('');
            expect(decodeHtmlEntities(undefined)).toBe('');
        });

        it('should return same string if no entities', () => {
            expect(decodeHtmlEntities('Hello World')).toBe('Hello World');
        });

        it('should handle Georgian text with entities', () => {
            // Real case: YouTube video title
            const encoded = 'რატომ ხდებიან ადამიანები &quot;ბოროტები&quot; ?';
            const decoded = 'რატომ ხდებიან ადამიანები "ბოროტები" ?';
            expect(decodeHtmlEntities(encoded)).toBe(decoded);
        });
    });

    describe('truncateText', () => {
        it('should not truncate short text', () => {
            expect(truncateText('Hello', 10)).toBe('Hello');
        });

        it('should truncate long text with ellipsis', () => {
            expect(truncateText('Hello World', 8)).toBe('Hello...');
        });

        it('should return exact length text as-is', () => {
            expect(truncateText('Hello', 5)).toBe('Hello');
        });
    });
});
