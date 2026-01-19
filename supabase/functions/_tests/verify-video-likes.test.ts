/**
 * Integration Tests for verify-video-likes Edge Function
 *
 * Run with: deno test --allow-net --allow-env supabase/functions/_tests/verify-video-likes.test.ts
 */

import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://localhost:54321";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/verify-video-likes`;

const isConfigured = SUPABASE_SERVICE_ROLE_KEY !== "";

Deno.test({
    name: "verify-video-likes: should reject request without videos",
    ignore: !isConfigured,
    async fn() {
        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
                userId: "test-user-id",
                accessToken: "test-token",
            }),
        });

        assertEquals(response.status, 400);
        const data = await response.json();
        assertEquals(data.success, false);
        assertExists(data.error);
    },
});

Deno.test({
    name: "verify-video-likes: should reject request without userId",
    ignore: !isConfigured,
    async fn() {
        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
                videos: [{ videoId: "test123", channelKey: "hamaki" }],
                accessToken: "test-token",
            }),
        });

        assertEquals(response.status, 400);
        const data = await response.json();
        assertEquals(data.success, false);
    },
});

Deno.test({
    name: "verify-video-likes: should reject request without accessToken",
    ignore: !isConfigured,
    async fn() {
        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
                videos: [{ videoId: "test123", channelKey: "hamaki" }],
                userId: "test-user-id",
            }),
        });

        assertEquals(response.status, 401);
        const data = await response.json();
        assertEquals(data.success, false);
    },
});

Deno.test({
    name: "verify-video-likes: should reject invalid JSON",
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
    name: "verify-video-likes: should handle CORS preflight",
    ignore: !isConfigured,
    async fn() {
        const response = await fetch(FUNCTION_URL, {
            method: "OPTIONS",
        });

        assertEquals(response.status, 200);
        assertExists(response.headers.get("Access-Control-Allow-Origin"));
    },
});
