"""
data_sources/yahoo_client.py
-----------------------------
Thin, dependency-free client for Yahoo Finance's unofficial endpoints.
Uses only the standard library (urllib) so nothing needs to be pip
installed to run this.

NOTE ON RELIABILITY: these are unofficial, undocumented endpoints. Yahoo
can change response shapes or rate-limit without notice. This client
raises YahooFetchError with a clear message rather than failing silently
so build_setup.py can decide how to handle gaps (e.g. leave a SetupInput
field as None so the relevant gate/score reports "insufficient data"
instead of crashing the whole scan).

If you're running this inside a sandboxed Claude Code environment, make
sure query1.finance.yahoo.com and query2.finance.yahoo.com are on your
network egress allowlist.
"""

import json
import time
import urllib.request
import urllib.error
import urllib.parse

_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]


class YahooFetchError(Exception):
    pass


def _get(path: str, params: dict, host_index: int = 0, retries: int = 2) -> dict:
    host = _HOSTS[host_index % len(_HOSTS)]
    url = f"https://{host}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT, "Accept": "application/json"})
    last_err = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read()
                return json.loads(body)
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429:
                time.sleep(1.5 * (attempt + 1))
                continue
            # try the other host once on 4xx/5xx before giving up
            if attempt == 0:
                host = _HOSTS[(host_index + 1) % len(_HOSTS)]
                url = f"https://{host}{path}?{urllib.parse.urlencode(params)}"
                req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT, "Accept": "application/json"})
                continue
            break
        except urllib.error.URLError as e:
            last_err = e
            break
    raise YahooFetchError(f"GET {path} for params={params} failed: {last_err}")


def fetch_chart(symbol: str, range_: str = "1y", interval: str = "1d") -> dict:
    """
    Raw OHLCV chart data.
    range_: '1d','5d','1mo','3mo','6mo','1y','2y','5y','10y','ytd','max'
    interval: '1m','5m','15m','60m','1d','1wk','1mo' (intraday intervals
              are only available for short ranges — Yahoo limits how far
              back 60m bars go, typically ~2 years).
    Returns dict with keys: timestamps, open, high, low, close, volume
    """
    data = _get(f"/v8/finance/chart/{symbol}", {"range": range_, "interval": interval})
    try:
        result = data["chart"]["result"][0]
    except (KeyError, IndexError, TypeError):
        err = data.get("chart", {}).get("error") if isinstance(data, dict) else None
        raise YahooFetchError(f"No chart result for {symbol} ({range_}/{interval}). Error: {err}")

    timestamps = result.get("timestamp", [])
    quote = result["indicators"]["quote"][0]
    out = {
        "symbol": symbol,
        "timestamps": timestamps,
        "open": quote.get("open", []),
        "high": quote.get("high", []),
        "low": quote.get("low", []),
        "close": quote.get("close", []),
        "volume": quote.get("volume", []),
    }
    # Drop any trailing bars where close is None (common for the in-progress bar)
    n = len(out["close"])
    clean = {k: [] for k in out if k not in ("symbol",)}
    for i in range(n):
        if out["close"][i] is None:
            continue
        for k in clean:
            clean[k].append(out[k][i])
    clean["symbol"] = symbol
    return clean


def fetch_quote(symbol: str) -> dict:
    """Real-time-ish snapshot: bid, ask, volume, avg volume, market cap, etc."""
    data = _get("/v7/finance/quote", {"symbols": symbol})
    try:
        result = data["quoteResponse"]["result"]
    except (KeyError, TypeError):
        raise YahooFetchError(f"No quote result for {symbol}")
    if not result:
        raise YahooFetchError(f"Empty quote result for {symbol} — check the ticker.")
    return result[0]


def fetch_earnings_date(symbol: str) -> dict:
    """
    Next earnings date via quoteSummary's calendarEvents module.
    Returns dict with 'earnings_timestamp' (unix seconds) or None if unavailable.
    """
    data = _get(f"/v10/finance/quoteSummary/{symbol}", {"modules": "calendarEvents"})
    try:
        result = data["quoteSummary"]["result"][0]
        earnings = result["calendarEvents"]["earnings"]["earningsDate"]
        ts = earnings[0]["raw"] if earnings else None
    except (KeyError, IndexError, TypeError):
        ts = None
    return {"earnings_timestamp": ts}
