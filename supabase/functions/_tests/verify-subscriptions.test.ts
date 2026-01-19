/**
 * Integration Tests for verify-subscriptions Edge Function
 *
 * Run with: deno test --allow-net --allow-env supabase/functions/_tests/verify-subscriptions.test.ts
 */

import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://localhost:54321";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/verify-subscriptions`;

const isConfigured = SUPABASE_SERVICE_ROLE_KEY !== "";

// NOTE: These tests check basic validation. Full auth testing requires
// either a valid Supabase JWT (Magic Link user) or valid YouTube token (Google OAuth user).

Deno.test({
    name: "verify-subscriptions: should reject request without channels",
    ignore: !isConfigured,
    async fn() {
        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                accessToken: "test-token",
                // Missing channels
            }),
        });

        assertEquals(response.status, 400);
        const data = await response.json();
        assertEquals(data.success, false);
        assertExists(data.error);
    },
});

Deno.test({
    name: "verify-subscriptions: should reject request without accessToken",
    ignore: !isConfigured,
    async fn() {
        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                channels: [{ channelId: "test", channelKey: "hamaki" }],
            }),
        });

        assertEquals(response.status, 400);
        const data = await response.json();
        assertEquals(data.success, false);
    },
});

Deno.test({
    name: "verify-subscriptions: should reject invalid accessToken (fails Google API)",
    ignore: !isConfigured,
    async fn() {
        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                channels: [{ channelId: "test", channelKey: "hamaki" }],
                accessToken: "invalid-token",
            }),
        });

        // Should fail at Google API verification step
        assertEquals(response.status, 401);
        const data = await response.json();
        assertEquals(data.success, false);
    },
});

Deno.test({
    name: "verify-subscriptions: should reject invalid JSON",
    ignore: !isConfigured,
    async fn() {
        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: "not-valid-json",
        });

        assertEquals(response.status, 400);
        const data = await response.json();
        assertEquals(data.success, false);
        assertEquals(data.error, "Invalid JSON body");
    },
});

Deno.test({
    name: "verify-subscriptions: should handle CORS preflight",
    ignore: !isConfigured,
    async fn() {
        const response = await fetch(FUNCTION_URL, {
            method: "OPTIONS",
        });

        assertEquals(response.status, 200);
        assertExists(response.headers.get("Access-Control-Allow-Origin"));
    },
});
