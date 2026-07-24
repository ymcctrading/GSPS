import { NextRequest, NextResponse } from 'next/server';

/**
 * Secure server-side API route for market data
 * Handles requests from frontend and fetches data using hidden API keys
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const provider = searchParams.get('provider') || 'twelvedata';

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol parameter is required' },
        { status: 400 }
      );
    }

    let data;

    if (provider === 'twelvedata') {
      data = await fetchTwelveDataQuote(symbol);
    } else if (provider === 'oanda') {
      data = await fetchOandaPrice(symbol);
    } else {
      return NextResponse.json(
        { error: 'Invalid provider. Supported: twelvedata, oanda' },
        { status: 400 }
      );
    }

    // Return only clean data - API keys are never exposed
    return NextResponse.json(data);
  } catch (error) {
    console.error('Market data API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market data' },
      { status: 500 }
    );
  }
}

async function fetchTwelveDataQuote(symbol: string) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error('TWELVE_DATA_API_KEY is not configured');
  }

  const response = await fetch(
    `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${apiKey}`
  );

  if (!response.ok) {
    throw new Error(`Twelve Data API error: ${response.statusText}`);
  }

  return response.json();
}

async function fetchOandaPrice(symbol: string) {
  const apiKey = process.env.OANDA_API_KEY;
  const accountId = process.env.OANDA_ACCOUNT_ID;

  if (!apiKey || !accountId) {
    throw new Error('OANDA_API_KEY or OANDA_ACCOUNT_ID is not configured');
  }

  const response = await fetch(
    `https://api-fxpractice.oanda.com/v3/accounts/${accountId}/instruments/${symbol}/candles?count=1`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`OANDA API error: ${response.statusText}`);
  }

  return response.json();
}
