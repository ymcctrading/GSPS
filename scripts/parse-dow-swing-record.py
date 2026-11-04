"""Builds lib/research/dowSwingRecord.json from the W009 transcriptions.

    python3 -I scripts/parse-dow-swing-record.py <transcriptions dir> lib/research/dowSwingRecord.json

The transcriptions are in the project's literature reading output
(checkpoint_v7, works/W009/transcriptions). Research data only.
"""
import re, json, sys, datetime

T=sys.argv[1].rstrip('/')+'/'
OUT=sys.argv[2]
MON={'Jan':1,'Feb':2,'Mar':3,'Apr':4,'May':5,'June':6,'Jun':6,'July':7,'Jul':7,'Aug':8,'Sept':9,'Sep':9,'Oct':10,'Nov':11,'Dec':12}
FR={'½':.5,'¼':.25,'¾':.75,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875}
def price(s):
    m=re.match(r'(\d+(?:\.\d+)?)([½¼¾⅛⅜⅝⅞])?',s)
    return float(m.group(1))+(FR[m.group(2)] if m.group(2) else 0)
def parse(text, fixes):
    text=text.replace('(1948) July [Feb.?] 11','1948 Feb. 11').replace('1949 Jan. 7 & 24','1949 Jan. 24')
    # drop parenthetical notes and NOTE sentences
    text=re.sub(r'\([^)]*\)','',text)
    text=re.sub(r'NOTE[^·\n]*?\."','',text)
    out=[];y=m=None
    tok=re.compile(r'(?:(?P<y>1[89]\d\d)\s+)?(?:(?P<mon>Jan|Feb|Mar|Apr|May|June|Jun|July|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+)?(?P<d>\d{1,2})\s+(?:\}\s*)?(?:\|\s*)?(?P<p>\d{2,3}(?:\.\d+)?[½¼¾⅛⅜⅝⅞]?)(?!\d)(?:\s+(?P<ad>[AD])\b)?')
    for line in text.split('\n'):
        if line.startswith('#') or line.startswith('Format') or line.startswith('Prose') or line.startswith('Columns') or line.startswith('Layout') or line.startswith('Note') or line.startswith('**Total') or line.startswith('**Session') or line.startswith('Uncertain') or line.startswith('End'): continue
        line=line.replace('|',' ')
        # table rows: "| 1913 | June 11 | 72.11 ..." become "1913 June 11 72.11"
        for t in tok.finditer(line):
            if t.group('y'): y=int(t.group('y'))
            if t.group('mon'): m=MON[t.group('mon')]
            if y is None or m is None: continue
            d=int(t.group('d'))
            try: dt=datetime.date(y,m,d)
            except ValueError: print('bad',y,m,d,file=sys.stderr); continue
            out.append([dt.isoformat(),price(t.group('p')),t.group('ad')])
    for k,v in fixes.items():
        for r in out:
            if r[0]==k[0] and abs(r[1]-k[1])<1e-6: r[1]=v
    out.sort(key=lambda r:r[0])
    ded=[]
    for r in out:
        if ded and ded[-1][0]==r[0]:
            if ded[-1][1]!=r[1]: print('dup-date',ded[-1],r,file=sys.stderr)
            continue
        ded.append(r)
    return ded
def kinds(rows):
    res=[]
    ad=[r[2] for r in rows]
    for i,(d,p,_) in enumerate(rows):
        prev=rows[i-1][1] if i>0 else None; nxt=rows[i+1][1] if i+1<len(rows) else None
        ref=nxt if prev is None else prev
        k=('high' if p>ref else 'low') if prev is not None else ('high' if p>nxt else 'low')
        if ad[i]: k='high' if ad[i]=='A' else 'low'
        res.append({'date':d,'price':p,'kind':k})
    bad=[i for i in range(1,len(res)) if res[i]['kind']==res[i-1]['kind']]
    return res,bad
three=parse(open(T+'ch07_3day_record.md').read(),{('1930-04-15',189.34):289.34})
nine=parse(open(T+'ch07_9point_record.md').read(),{})
for name,rows in [('three',three),('nine',nine)]:
    r,bad=kinds(rows); print(name,len(r),r[0],r[-1],'nonalternating',len(bad),file=sys.stderr)
    for i in bad[:15]: print('  ',r[i-1],r[i],file=sys.stderr)
nine_k=kinds(nine)[0]
for r in nine_k:
    if r['date']=='1919-07-20': r['date']='1919-08-20'
nine_k.sort(key=lambda r:r['date'])
out={"source":"Dow-Jones Industrial Averages as tabled in the 1949 book (W009), Ch. VII 'Record of 3-Day Moves on Averages 1912 to 1949' (printed pp.66-75) and '9-Point Chart Swings or More of the Averages' (pp.75-79). Transcribed from page images, literature-reading-output checkpoint_v7 works/W009/transcriptions/ch07_3day_record.md and ch07_9point_record.md, parsed by scripts/parse-dow-swing-record.py. Kind is the printed A/D where given, else read from the neighbouring entries (tops and bottoms alternate).",
"fixes":["3-Day 1930-04-15 printed 189.34, read 289.34 (between 296.35 and 297.25)","9-Point 1919 'July 20' 98.46 dated Aug. 20 as the 3-Day record dates it","9-Point 1948 'July 11' read Feb. 11 (the book's Chart 4 labels it 1948 FEB 11)","9-Point 1949 'Jan. 7 & 24' 182.50 kept once, dated Jan. 24"],
"gaps":["9-Point: none between 1921-08-24 and 1922-10-14 (as printed: no 9-point reaction that year)","9-Point: the printed record jumps 1942-04-28 to 1943-07-15","Both: the exchange was closed 1914-07-31 to 1914-12-11"],
"nine":nine_k,"three":kinds(three)[0]}
json.dump(out,open(OUT,'w'),indent=0,separators=(',',':'))
