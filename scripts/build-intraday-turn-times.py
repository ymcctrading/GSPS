"""Builds lib/research/intradayTurnTimes.json: for each regular session, the
15-minute bar that printed the day's high and the day's low, for SPY and DIA,
2016-2025. Research only (the Hora and Choghadiya test, `horaTiming.ts`).

  python3 scripts/build-intraday-turn-times.py <dir with SPY15.ndjson, DIA15.ndjson>

Each .ndjson line is one bar {t (UTC ISO), h, l} from Alpaca
/v2/stocks/bars?timeframe=15Min&adjustment=split&feed=sip. Only bars starting
09:30-15:45 New York time count. A tie goes to the first bar. Times are
stored as the bar's midpoint in UTC epoch minutes.
"""
import json, sys
from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
src = sys.argv[1]
out = {"source": "Alpaca /v2/stocks/bars 15Min, adjustment=split, feed=sip; regular session only", "symbols": {}}
for sym in ["SPY", "DIA"]:
    days = defaultdict(list)
    seen = set()
    for line in open(f"{src}/{sym}15.ndjson"):
        b = json.loads(line)
        if b["t"] in seen:  # a resumed download can repeat its first bar
            continue
        seen.add(b["t"])
        t = datetime.fromisoformat(b["t"].replace("Z", "+00:00"))
        et = t.astimezone(NY)
        m = et.hour * 60 + et.minute
        if 570 <= m <= 945:
            days[et.date().isoformat()].append((t, b["h"], b["l"]))
    rows = []
    for d in sorted(days):
        bars = days[d]
        if len(bars) < 20:  # half days and gaps
            continue
        hi = max(bars, key=lambda x: (x[1], -x[0].timestamp()))
        lo = min(bars, key=lambda x: (x[2], x[0].timestamp()))
        mid = lambda x: int((x[0] + timedelta(minutes=7, seconds=30)).timestamp() // 60)
        rows.append([d, mid(hi), mid(lo)])
    out["symbols"][sym] = rows
    print(sym, len(rows), "sessions")
json.dump(out, open("lib/research/intradayTurnTimes.json", "w"), separators=(",", ":"))
