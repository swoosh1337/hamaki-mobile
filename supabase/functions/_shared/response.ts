/**
 * Standardized Response Utilities for Edge Functions
 *
 * All Edge Functions should use these utilities for consistent response formats.
 *
 * Success: { success: true, data?: T }
 * Error:   { success: false, error: string, code?: string }
 */

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
};

/**
 * Standard success response
 */
export function successResponse<T>(data?: T, status = 200): Response {
    return new Response(
        JSON.stringify({
            success: true,
            data: data ?? null,
        }),
        {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

/**
 * Standard error response
 */
export function errorResponse(
    message: string,
    status = 500,
    code?: string
): Response {
    const body: { success: false; error: string; code?: string } = {
        success: false,
        error: message,
    };

    if (code) {
        body.code = code;
    }

    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

/**
 * CORS preflight response
 */
export function corsResponse(): Response {
    return new Response(null, { headers: corsHeaders });
}

/**
 * Common error codes
 */
export const ErrorCodes = {
    INVALID_REQUEST: 'INVALID_REQUEST',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    RATE_LIMITED: 'RATE_LIMITED',
    QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
} as const;

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
