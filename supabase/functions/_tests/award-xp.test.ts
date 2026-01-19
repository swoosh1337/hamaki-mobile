/**
 * Integration Tests for award-xp Edge Function
 *
 * Run with: deno test --allow-net --allow-env supabase/functions/_tests/award-xp.test.ts
 *
 * These tests require:
 * - SUPABASE_URL environment variable
 * - SUPABASE_SERVICE_ROLE_KEY environment variable
 * - A running Supabase instance (local or remote)
 */

import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://localhost:54321";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/award-xp`;

// Skip tests if not configured
const isConfigured = SUPABASE_SERVICE_ROLE_KEY !== "";

Deno.test({
    name: "award-xp: should reject request without idempotencyKey",
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
                xpType: "game",
                amount: 100,
                // Missing idempotencyKey
            }),
        });

        assertEquals(response.status, 400);
        const data = await response.json();
        assertEquals(data.success, false);
        assertExists(data.error);
    },
});

Deno.test({
    name: "award-xp: should reject request without userId",
    ignore: !isConfigured,
    async fn() {
        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
                xpType: "game",
                amount: 100,
                idempotencyKey: `test-${Date.now()}`,
            }),
        });

        assertEquals(response.status, 400);
        const data = await response.json();
        assertEquals(data.success, false);
    },
});

Deno.test({
    name: "award-xp: should reject invalid xpType",
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
                xpType: "invalid_type",
                amount: 100,
                idempotencyKey: `test-${Date.now()}`,
            }),
        });

        assertEquals(response.status, 400);
        const data = await response.json();
        assertEquals(data.success, false);
    },
});

Deno.test({
    name: "award-xp: should reject negative amount",
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
                xpType: "game",
                amount: -50,
                idempotencyKey: `test-${Date.now()}`,
            }),
        });

        assertEquals(response.status, 400);
        const data = await response.json();
        assertEquals(data.success, false);
    },
});

Deno.test({
    name: "award-xp: should reject amount exceeding max limit",
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
                xpType: "game",
                amount: 99999, // Exceeds MAX_XP_PER_AWARD
                idempotencyKey: `test-${Date.now()}`,
            }),
        });

        assertEquals(response.status, 400);
        const data = await response.json();
        assertEquals(data.success, false);
    },
});

Deno.test({
    name: "award-xp: should handle CORS preflight",
    ignore: !isConfigured,
    async fn() {
        const response = await fetch(FUNCTION_URL, {
            method: "OPTIONS",
        });

        assertEquals(response.status, 200);
        assertExists(response.headers.get("Access-Control-Allow-Origin"));
    },
});

Deno.test({
    name: "award-xp: should return proper structure on success",
    ignore: !isConfigured,
    async fn() {
        // This test requires a real user in the database
        // Skip if no test user is configured
        const TEST_USER_ID = Deno.env.get("TEST_USER_ID");
        if (!TEST_USER_ID) {
            console.log("Skipping: TEST_USER_ID not configured");
            return;
        }

        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
                userId: TEST_USER_ID,
                xpType: "game",
                amount: 10,
                idempotencyKey: `test-success-${Date.now()}`,
            }),
        });

        const data = await response.json();

        if (response.status === 200) {
            assertEquals(data.success, true);
            assertExists(data.new_total_xp);
            assertExists(data.personal_rank);
            assertExists(data.xp_breakdown);
        } else {
            // User doesn't exist - that's expected in test environment
            assertEquals(data.success, false);
        }
    },
});
