#!/bin/bash

# Manual Test Script for Leaderboard Reset
# This script tests the monthly-leader board-reset Edge Function

# Configuration
PROJECT_REF="hspaxdszcnrznqehblky"  # Your actual project ref
FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/monthly-leaderboard-reset"

# Get service role key from environment or prompt
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "Please enter your Supabase service role key:"
    read -s SERVICE_ROLE_KEY
    echo
else
    SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
fi

# Test period
PERIOD_KEY="2025-12"

echo "🧪 Testing Monthly Leaderboard Reset"
echo "===================================="
echo "Project: $PROJECT_REF"
echo "Period: $PERIOD_KEY"
echo ""

# Test 1: Dry Run
echo "📋 Test 1: Dry Run (No Changes)"
echo "--------------------------------"
curl -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"period_key\": \"$PERIOD_KEY\", \"dry_run\": true}" \
  | jq '.'

echo ""
echo ""

# Test 2: Validation - Missing period_key
echo "❌ Test 2: Validation (Should Fail)"
echo "-----------------------------------"
curl -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}' \
  | jq '.'

echo ""
echo ""

# Test 3: Validation - Invalid format
echo "❌ Test 3: Invalid Format (Should Fail)"
echo "---------------------------------------"
curl -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"period_key": "invalid", "dry_run": true}' \
  | jq '.'

echo ""
echo ""

# Test 4: Actual Export (Confirmation Required)
echo "⚠️  Test 4: Actual Export & Reset"
echo "--------------------------------"
echo "This will create an actual export and reset game XP."
read -p "Continue? (y/N): " confirm

if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    curl -X POST "$FUNCTION_URL" \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"period_key\": \"$PERIOD_KEY\", \"dry_run\": false}" \
      | jq '.'
    
    echo ""
    echo "✅ Export complete! Check Supabase Dashboard → Storage for CSV"
else
    echo "Skipped actual export"
fi

echo ""
echo "🎉 Testing complete!"
