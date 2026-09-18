#!/usr/bin/env node

/**
 * Diagnostic script to test production API endpoints and identify failure points.
 * Run with: node scripts/diagnose-production.mjs
 */

const PRODUCTION_URL = "https://gsps.vercel.app";
const TEST_SYMBOL = "AAPL";

async function testEndpoint(method, path, description) {
  try {
    console.log(`\n📍 Testing: ${description}`);
    console.log(`   ${method} ${PRODUCTION_URL}${path}`);

    const response = await fetch(`${PRODUCTION_URL}${path}`, {
      method,
      headers: {
        "Accept": "application/json",
        "User-Agent": "GSPS-Diagnostics/1.0",
      },
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    const contentType = response.headers.get("content-type");
    console.log(`   Content-Type: ${contentType}`);

    if (response.ok) {
      if (contentType?.includes("application/json")) {
        const data = await response.json();
        console.log(`   ✅ Success - Response size: ${JSON.stringify(data).length} bytes`);
        if (data.error) {
          console.log(`   ⚠️  API Error: ${data.error}`);
          if (data.errorCode) console.log(`      Error Code: ${data.errorCode}`);
        }
        return { ok: true, data };
      } else {
        const text = await response.text();
        console.log(`   ✅ Success - Response size: ${text.length} bytes`);
        if (text.includes("error") || text.includes("Error")) {
          console.log(`   ⚠️  Response contains error keywords`);
        }
        return { ok: true, data: text };
      }
    } else {
      const text = await response.text();
      console.log(`   ❌ Failed - Response: ${text.substring(0, 200)}`);
      return { ok: false, status: response.status, text };
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

async function testPageLoad(path, description) {
  try {
    console.log(`\n📍 Testing: ${description}`);
    console.log(`   GET ${PRODUCTION_URL}${path}`);

    const response = await fetch(`${PRODUCTION_URL}${path}`, {
      headers: {
        "User-Agent": "GSPS-Diagnostics/1.0",
      },
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const html = await response.text();
      console.log(`   ✅ HTML loaded - Size: ${html.length} bytes`);

      // Check for common issues
      if (html.includes("__NEXT_DATA__")) {
        console.log(`   ✅ Found Next.js data initialization`);
      } else {
        console.log(`   ⚠️  Missing Next.js data initialization`);
      }

      if (html.includes("error") && !html.includes("CorrelationError")) {
        console.log(`   ⚠️  HTML contains 'error' keyword`);
      }

      return { ok: true };
    } else {
      const text = await response.text();
      console.log(`   ❌ Failed - Response: ${text.substring(0, 200)}`);
      return { ok: false };
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

async function main() {
  console.log("🔍 GSPS Production Diagnostics");
  console.log("================================\n");
  console.log(`Testing: ${PRODUCTION_URL}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const results = {
    endpoints: {},
    pages: {},
  };

  // Test API endpoints
  console.log("📡 API Endpoint Tests");
  console.log("--------------------");

  results.endpoints.scan = await testEndpoint(
    "GET",
    `/api/scan?ticker=${TEST_SYMBOL}`,
    "Scan API"
  );

  results.endpoints.bars = await testEndpoint(
    "GET",
    `/api/bars?symbol=${TEST_SYMBOL}&timeframe=day`,
    "Bars API"
  );

  results.endpoints.quote = await testEndpoint(
    "GET",
    `/api/quote?symbol=${TEST_SYMBOL}`,
    "Quote API"
  );

  results.endpoints.onboarding = await testEndpoint(
    "GET",
    `/api/onboarding`,
    "Onboarding API"
  );

  // Test page loads
  console.log("\n📄 Page Load Tests");
  console.log("------------------");

  results.pages.dashboard = await testPageLoad(
    "/dashboard",
    "Dashboard page"
  );

  results.pages.ticker = await testPageLoad(
    `/ticker/${TEST_SYMBOL}`,
    `Ticker page (${TEST_SYMBOL})`
  );

  results.pages.scanner = await testPageLoad(
    "/scanner",
    "Scanner page"
  );

  // Summary
  console.log("\n📊 Summary");
  console.log("----------");

  const endpointSuccess = Object.values(results.endpoints).filter(r => r.ok).length;
  const pageSuccess = Object.values(results.pages).filter(r => r.ok).length;

  console.log(`API Endpoints: ${endpointSuccess}/${Object.keys(results.endpoints).length} working`);
  console.log(`Pages: ${pageSuccess}/${Object.keys(results.pages).length} loading`);

  if (endpointSuccess === Object.keys(results.endpoints).length) {
    console.log(`\n✅ All API endpoints are responding correctly`);
  } else {
    console.log(`\n⚠️  Some API endpoints are failing`);
  }

  if (pageSuccess === Object.keys(results.pages).length) {
    console.log(`✅ All pages are loading`);
  } else {
    console.log(`⚠️  Some pages are failing to load`);
    console.log(`\nThis suggests a CLIENT-SIDE issue like:`);
    console.log(`  - Hydration mismatch between server and client rendering`);
    console.log(`  - Missing environment variables in production`);
    console.log(`  - Client-side error during component initialization`);
  }

  process.exit(pageSuccess === Object.keys(results.pages).length ? 0 : 1);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
