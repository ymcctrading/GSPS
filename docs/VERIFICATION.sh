#!/bin/bash
# Verification script for multi-provider market data scanner
# Usage: bash docs/VERIFICATION.sh [local|production]

set -e

TARGET="${1:-local}"
BASE_URL="http://localhost:3000"

if [ "$TARGET" = "production" ]; then
  echo "Enter your Vercel domain (e.g., gsps.vercel.app):"
  read -r domain
  BASE_URL="https://$domain"
fi

echo "🔍 Testing Multi-Provider Market Data Scanner"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Target: $BASE_URL"
echo ""

# Test 1: Binance (Crypto) - No auth required
echo "✓ Test 1: Binance Crypto (no auth required)"
echo "  URL: $BASE_URL/api/crypto?symbols=BTC,ETH"
if response=$(curl -s "$BASE_URL/api/crypto?symbols=BTC,ETH" 2>/dev/null); then
  if echo "$response" | grep -q '"symbol"'; then
    echo "  ✅ SUCCESS: Received crypto data"
    echo "  Response preview:"
    echo "$response" | head -c 200 && echo "..."
  else
    echo "  ❌ FAILED: Invalid response format"
    echo "$response"
  fi
else
  echo "  ❌ FAILED: Could not connect"
fi
echo ""

# Test 2: Oanda (Forex) - Requires OANDA_API_KEY
echo "✓ Test 2: Oanda Forex (requires OANDA_API_KEY)"
echo "  URL: $BASE_URL/api/forex?symbols=EUR-USD"
if response=$(curl -s "$BASE_URL/api/forex?symbols=EUR-USD" 2>/dev/null); then
  if echo "$response" | grep -q '"symbol"'; then
    echo "  ✅ SUCCESS: Received forex data"
    echo "  Response preview:"
    echo "$response" | head -c 200 && echo "..."
  elif echo "$response" | grep -q 'OANDA_API_KEY'; then
    echo "  ⚠️  SKIPPED: OANDA_API_KEY not configured"
    echo "  To enable: Add OANDA_API_KEY to environment"
  else
    echo "  ⚠️  WARNING: Unexpected response"
    echo "$response" | head -c 200
  fi
else
  echo "  ❌ FAILED: Could not connect"
fi
echo ""

# Test 3: Twelve Data (Futures) - Requires TWELVE_DATA_API_KEY
echo "✓ Test 3: Twelve Data Futures (requires TWELVE_DATA_API_KEY)"
echo "  URL: $BASE_URL/api/futures?symbols=ES,NQ&provider=twelve_data"
if response=$(curl -s "$BASE_URL/api/futures?symbols=ES,NQ&provider=twelve_data" 2>/dev/null); then
  if echo "$response" | grep -q '"symbol"'; then
    echo "  ✅ SUCCESS: Received futures data"
    echo "  Response preview:"
    echo "$response" | head -c 200 && echo "..."
  elif echo "$response" | grep -q 'TWELVE_DATA_API_KEY'; then
    echo "  ⚠️  SKIPPED: TWELVE_DATA_API_KEY not configured"
    echo "  To enable: Add TWELVE_DATA_API_KEY to environment"
  else
    echo "  ⚠️  WARNING: Unexpected response"
    echo "$response" | head -c 200
  fi
else
  echo "  ❌ FAILED: Could not connect"
fi
echo ""

# Test 4: Polygon (Stocks) - Requires POLYGON_API_KEY
echo "✓ Test 4: Polygon Stocks (requires POLYGON_API_KEY)"
echo "  URL: $BASE_URL/api/futures?symbols=AAPL&provider=polygon"
if response=$(curl -s "$BASE_URL/api/futures?symbols=AAPL&provider=polygon" 2>/dev/null); then
  if echo "$response" | grep -q '"symbol"'; then
    echo "  ✅ SUCCESS: Received stock data"
    echo "  Response preview:"
    echo "$response" | head -c 200 && echo "..."
  elif echo "$response" | grep -q 'POLYGON_API_KEY'; then
    echo "  ⚠️  SKIPPED: POLYGON_API_KEY not configured"
    echo "  To enable: Add POLYGON_API_KEY to environment"
  else
    echo "  ⚠️  WARNING: Unexpected response"
    echo "$response" | head -c 200
  fi
else
  echo "  ❌ FAILED: Could not connect"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Verification complete!"
echo ""
echo "📝 Notes:"
echo "  • Binance endpoints work without API keys"
echo "  • Add OANDA_API_KEY for forex data"
echo "  • Add TWELVE_DATA_API_KEY for futures data"
echo "  • Add POLYGON_API_KEY for stock data"
echo ""
echo "🔗 See docs/MULTI_PROVIDER_SETUP.md for full documentation"
