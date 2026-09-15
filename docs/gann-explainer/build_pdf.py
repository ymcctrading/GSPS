#!/usr/bin/env python3
"""Assemble the plain-English Gann method explainer PDF."""
import os
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle,
    HRFlowable, KeepTogether, ListFlowable, ListItem
)

HERE = os.path.dirname(os.path.abspath(__file__))
FIGS = os.path.join(HERE, "figs")
OUT = os.path.join(HERE, "The_Gann_Method_Explained.pdf")

INK = colors.HexColor("#1f2430")
BLUE = colors.HexColor("#2b5b84")
GREEN = colors.HexColor("#3a7d5c")
RED = colors.HexColor("#a6403a")
GOLD = colors.HexColor("#b8863b")
GREY = colors.HexColor("#8a8f98")
LIGHT = colors.HexColor("#eef1ee")
PAPER = colors.HexColor("#fdfcf9")

styles = getSampleStyleSheet()

styles.add(ParagraphStyle("CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold",
                           fontSize=30, leading=36, textColor=INK, spaceAfter=6, alignment=TA_CENTER))
styles.add(ParagraphStyle("CoverSub", parent=styles["Normal"], fontName="Helvetica",
                           fontSize=14, leading=20, textColor=BLUE, alignment=TA_CENTER, spaceAfter=4))
styles.add(ParagraphStyle("CoverNote", parent=styles["Normal"], fontName="Helvetica-Oblique",
                           fontSize=10.5, leading=15, textColor=GREY, alignment=TA_CENTER))
styles.add(ParagraphStyle("PartTitle", parent=styles["Heading1"], fontName="Helvetica-Bold",
                           fontSize=20, leading=24, textColor=INK, spaceBefore=6, spaceAfter=10,
                           borderColor=GOLD, borderWidth=0))
styles.add(ParagraphStyle("LayerTitle", parent=styles["Heading2"], fontName="Helvetica-Bold",
                           fontSize=15, leading=19, textColor=BLUE, spaceBefore=14, spaceAfter=6))
styles.add(ParagraphStyle("SubHead", parent=styles["Heading3"], fontName="Helvetica-Bold",
                           fontSize=11.5, leading=15, textColor=GREEN, spaceBefore=10, spaceAfter=4))
styles.add(ParagraphStyle("Body", parent=styles["Normal"], fontName="Helvetica",
                           fontSize=10.5, leading=15.5, textColor=INK, spaceAfter=8, alignment=TA_LEFT))
styles.add(ParagraphStyle("BodyBold", parent=styles["Body"], fontName="Helvetica-Bold"))
styles.add(ParagraphStyle("Caption", parent=styles["Normal"], fontName="Helvetica-Oblique",
                           fontSize=9, leading=12, textColor=GREY, alignment=TA_CENTER, spaceBefore=4,
                           spaceAfter=14))
styles.add(ParagraphStyle("Callout", parent=styles["Body"], fontName="Helvetica-Oblique",
                           fontSize=10, leading=14.5, textColor=INK, backColor=LIGHT,
                           borderPadding=8, spaceBefore=6, spaceAfter=10))
styles.add(ParagraphStyle("TOCEntry", parent=styles["Normal"], fontName="Helvetica",
                           fontSize=11, leading=20, textColor=INK))
styles.add(ParagraphStyle("BulletItem", parent=styles["Body"], leftIndent=14, bulletIndent=2,
                           spaceAfter=5))
styles.add(ParagraphStyle("BookEntry", parent=styles["Body"], fontSize=9.7, leading=13.5,
                           spaceAfter=9))

def img(name, width=6.4):
    return Image(os.path.join(FIGS, name), width=width * inch,
                  height=width * inch * 0.66)

def rule(color=GOLD, thickness=1.2):
    return HRFlowable(width="100%", thickness=thickness, color=color, spaceBefore=2, spaceAfter=12)

def figure(name, caption, width=6.4):
    return KeepTogether([img(name, width), Paragraph(caption, styles["Caption"])])

story = []

# ---------- Cover ----------
story.append(Spacer(1, 1.6 * inch))
story.append(Paragraph("The Gann Method, Explained", styles["CoverTitle"]))
story.append(Paragraph("What W. D. Gann actually taught &mdash; in plain English", styles["CoverSub"]))
story.append(Spacer(1, 0.35 * inch))
story.append(HRFlowable(width="55%", thickness=1.2, color=GOLD, hAlign="CENTER", spaceAfter=18))
story.append(Paragraph(
    "Compiled from a direct read of all ten books W. D. Gann published in his own "
    "lifetime (1909&ndash;1954), plus seven interpretive works by later researchers. "
    "Every diagram in this document was drawn fresh for this explainer &mdash; none are "
    "reproduced from the original books.", styles["CoverNote"]))
story.append(Spacer(1, 2.6 * inch))
story.append(Paragraph("Prepared September 2026 &middot; for personal study", styles["CoverNote"]))
story.append(PageBreak())

# ---------- How to read this document ----------
story.append(Paragraph("How to read this document", styles["PartTitle"]))
story.append(rule())
story.append(Paragraph(
    "W. D. Gann (1878&ndash;1955) was a real commodity and stock trader who wrote ten "
    "books and ran a subscription forecasting business for over forty years. He also "
    "became, after his death, the subject of an enormous amount of speculation &mdash; "
    "mystical, numerological, and otherwise &mdash; much of it built by people who never "
    "read his actual books. This document draws a hard line between two things that are "
    "usually blurred together:", styles["Body"]))
story.append(Paragraph(
    "&bull;&nbsp;&nbsp;<b>What Gann himself published</b> &mdash; rules, methods, and worked "
    "examples that appear, in his own words, across his ten books.", styles["BulletItem"]))
story.append(Paragraph(
    "&bull;&nbsp;&nbsp;<b>What later researchers reconstructed</b> &mdash; techniques (some "
    "very well-supported, some very weakly) that people have attributed to Gann based on "
    "private letters, unpublished course material, and inference &mdash; but that do not "
    "appear in anything he sold to the public.", styles["BulletItem"]))
story.append(Paragraph(
    "Both are useful to know. But only the first group is something you can point to on a "
    "page and say &ldquo;Gann said this.&rdquo; This document is organized into six layers, "
    "from the most solid, most-repeated material to the most speculative &mdash; and each "
    "layer is labeled with how well-evidenced it actually is.", styles["Body"]))
story.append(Paragraph(
    "A quick note on the man himself, since it explains a lot of his voice: Gann grew up "
    "poor in Texas, worked in cotton brokerage as a teenager, and built his trading "
    "business the hard way over decades &mdash; he writes like a self-made, Bible-literate, "
    "turn-of-the-century Southern businessman, because that is exactly what he was. His "
    "books repeatedly return to two themes that have nothing to do with charts: relentless "
    "personal discipline, and a near-religious belief that markets, like everything else in "
    "nature, move by knowable law rather than chance.", styles["Body"]))
story.append(PageBreak())

# ---------- The big picture ----------
story.append(Paragraph("The big picture", styles["PartTitle"]))
story.append(rule())
story.append(Paragraph(
    "Strip away the mystique, and Gann's disclosed material describes <b>a discipline "
    "system first, a price-geometry system second, and a timing system whose actual "
    "engine he never once wrote down.</b> Here is the whole method as a single map, "
    "followed by one chapter on each of its six layers.", styles["Body"]))
story.append(figure("01_six_layers.png",
    "The six layers of Gann's method, ordered from best-evidenced (top) to most speculative (bottom)."))
story.append(Paragraph(
    "The short version of each layer, before the detail:", styles["Body"]))
overview = [
    ("Layer 1 &mdash; Discipline", "Money-management rules: how much to risk, when to cut losses, "
     "when to add to a position. Fully disclosed, and the largest single share of what he actually wrote."),
    ("Layer 2 &mdash; Structure", "Arithmetic rules for finding price levels where a market is likely "
     "to pause or turn, built from real past highs and lows."),
    ("Layer 3 &mdash; Timing", "The idea that time matters as much as price &mdash; but the actual "
     "mechanism was kept private his whole career."),
    ("Layer 4 &mdash; Confluence", "Never trust one signal alone &mdash; act only where several "
     "independent signals agree."),
    ("Layer 5 &mdash; “Vibration”", "Gann's own term for why markets move the way they do. "
     "He named it and never defined it &mdash; three incompatible theories now try to fill the gap."),
    ("Layer 6 &mdash; Tape reading", "Underneath all the arithmetic, real order flow and volume are "
     "the final judge of whether a level actually matters."),
]
rows = [[Paragraph(f"<b>{a}</b>", styles["Body"]), Paragraph(b, styles["Body"])] for a, b in overview]
t = Table(rows, colWidths=[1.7 * inch, 4.9 * inch])
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LINEBELOW", (0, 0), (-1, -2), 0.4, LIGHT),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(t)
story.append(PageBreak())

# ---------- Layer 1 ----------
story.append(Paragraph("Layer 1 &mdash; Discipline", styles["PartTitle"]))
story.append(Paragraph("Evidence level: <b>fully disclosed</b> &mdash; repeated, word-for-word-consistent, across all ten books.", styles["Callout"]))
story.append(Paragraph(
    "If you read only one layer of this document, read this one. It is, by sheer word "
    "count, the majority of everything Gann ever published &mdash; more than the charts, "
    "more than the geometry, more than anything else. His core rule set, restated across "
    "decades with barely a word changed:", styles["Body"]))
for b in [
    "Divide your trading capital into roughly ten equal parts, and never risk more than "
    "one part on a single trade.",
    "Always place a hard stop-loss order the moment you enter a trade &mdash; never trade "
    "without one.",
    "Never add to a losing position (“averaging down”). If you're wrong, you're wrong "
    "&mdash; get out and reassess.",
    "Once a trade is comfortably ahead, move your stop up to breakeven. A real profit "
    "should never be allowed to round-trip back into a loss.",
    "Only add to a position that is already winning, and only after it clears a new "
    "resistance level &mdash; never pyramid into a loser.",
    "Trade both directions without bias. A bear market is exactly as tradeable as a bull "
    "market &mdash; the mistake is refusing to sell short out of habit or superstition.",
    "Never fix a profit target in your head and then hold past a genuine trend-change "
    "signal hoping to reach it.",
    "After a string of losses, reduce your trade size &mdash; never increase it to “get "
    "even.”",
]:
    story.append(Paragraph(f"&bull;&nbsp;&nbsp;{b}", styles["BulletItem"]))
story.append(figure("02_discipline.png",
    "The single habit Gann returns to most often: once a trade is safely ahead, the stop moves to "
    "breakeven and never allows a real gain to become a loss."))
story.append(Paragraph(
    "By his final book (1949) this had crystallized into a numbered list he called the "
    "&ldquo;24 Never-Failing Rules&rdquo; &mdash; the most-quoted version of the same "
    "substance, refined over 45 years rather than changed.", styles["Body"]))
story.append(PageBreak())

# ---------- Layer 2 ----------
story.append(Paragraph("Layer 2 &mdash; Structure (price geometry)", styles["PartTitle"]))
story.append(Paragraph("Evidence level: <b>mostly disclosed</b> &mdash; with one very famous exception (see the callout below).", styles["Callout"]))
story.append(Paragraph(
    "Starting from a real, confirmed swing high or low, Gann used a small set of "
    "arithmetic rules to propose specific price levels where the market was more likely "
    "to pause, reverse, or accelerate. This is the layer most people associate with "
    "&ldquo;Gann theory,&rdquo; and it's worth being precise about which parts he actually "
    "published, with worked numeric examples, across five of his own books.", styles["Body"]))
story.append(Paragraph("Old-level crossing", styles["SubHead"]))
story.append(Paragraph(
    "A price level that has held as support or resistance multiple times, and then "
    "finally breaks, tends to keep going &mdash; and it is safer to enter on the "
    "<i>second</i> test of a broken level than the first. Gann's own stated buffer for "
    "confirming a break was exact: 3 cents (or 60 points for cotton). He justified this "
    "specific number with what he called &ldquo;lost motion&rdquo; &mdash; his observation "
    "that price typically overshoots a real level by a small amount (up to roughly 1-7/8 "
    "cents) but rarely by the full 3 cents, so a 3-cent close beyond the level is real "
    "confirmation, not noise.", styles["Body"]))
story.append(figure("03_old_level_crossing.png",
    "A level tested three times, finally broken and confirmed by a close beyond the “lost motion” buffer."))
story.append(Paragraph("Percentage retracement", styles["SubHead"]))
story.append(Paragraph(
    "Take the size of a move from its low to its high (or high to low), and divide that "
    "range into eighths (12.5% steps) and thirds. The halfway point &mdash; 50% &mdash; is, "
    "in Gann's own words, the single most important level of all; 75% comes second. His "
    "final book sharpened this into an explicit importance ranking: 50% is most important, "
    "then 100%, then 25%, then 12.5%, with the extremes (6.25%) and the thirds "
    "(33.3%/66.7%) weighted lower.", styles["Body"]))
story.append(figure("04_retracement.png",
    "A retracement grid dividing a swing into eighths; the 50% line is the single most important level."))
story.append(Paragraph(
    "<b>What is not in this list, on purpose:</b> the &ldquo;Square of 9&rdquo; spiral "
    "(mapping prices onto a square-root-based spiral of numbers) and fixed &ldquo;Gann "
    "angles&rdquo; (diagonal lines like 1&times;1 or 2&times;1 rising a fixed amount of "
    "price per fixed amount of time) are both completely absent from every one of Gann's "
    "ten published books. They are real techniques &mdash; but they come from his private, "
    "unpublished course material and were reconstructed decades later by researchers "
    "studying his working papers, not from anything he ever sold to the general public in "
    "book form. Treat any claim that starts with &ldquo;Gann's Square of 9 says&hellip;&rdquo; "
    "as a later reconstruction, not a quotation.", styles["Callout"]))
story.append(PageBreak())

# ---------- Layer 3 ----------
story.append(Paragraph("Layer 3 &mdash; Timing", styles["PartTitle"]))
story.append(Paragraph("Evidence level: <b>partially disclosed shell, withheld engine.</b> Gann says outright, in his own words, that he is not explaining this part.", styles["Callout"]))
story.append(Paragraph(
    "Gann insisted, across his whole career, that price and time are symmetric &mdash; a "
    "move becomes &ldquo;square&rdquo; when the number of trading days that have elapsed "
    "matches the size of the price move &mdash; and that specific calendar dates, not just "
    "price levels, are where trend changes cluster. He says this is real. He also says, "
    "explicitly and more than once (including one fully capitalized sentence in his 1927 "
    "novel), that he will not explain <i>why</i> &mdash; what he calls &ldquo;the cause of "
    "cycles.&rdquo; That refusal appears in books published fifteen years apart, so it was "
    "not an early-career shyness he grew out of; it was a permanent, deliberate policy.", styles["Body"]))
story.append(Paragraph("What he does give away", styles["SubHead"]))
for b in [
    "A fixed annual calendar cycle &mdash; specific recurring dates each year that he calls "
    "“a permanent cycle which does not change.”",
    "Using a stock or company's own founding-date anniversary as a timing trigger to watch.",
    "“Anniversary dates” generally &mdash; if a stock made a major high or low in a "
    "given month, that same month becomes a date to watch in every following year.",
    "Comparing how long the current rally or decline has lasted against the longest prior "
    "rally or decline in the same campaign &mdash; when the current move exceeds it, that's "
    "a trend-change warning in its own right, independent of price.",
    "Specific day-count and month-count “time square” bands (roughly 7–12, "
    "18–21, 28–31 days, and so on, up through multi-year bands) &mdash; the longer "
    "the elapsed time since a high or low falls into one of these bands, the more "
    "significant a turn there is treated as.",
]:
    story.append(Paragraph(f"&bull;&nbsp;&nbsp;{b}", styles["BulletItem"]))
story.append(Paragraph(
    "None of this is the withheld mechanism itself &mdash; it's the outer shell of a "
    "timing system whose actual engine Gann took to his grave. Nearly everything written "
    "about &ldquo;the Gann time factor&rdquo; since his death, in any book, course, or "
    "software &mdash; including in this project &mdash; is reconstruction, not "
    "transcription.", styles["Body"]))
story.append(Paragraph("“Sections of a campaign”", styles["SubHead"]))
story.append(Paragraph(
    "One structural rule that bridges price and time: a bull or bear market typically "
    "unfolds in 3 to 4 legs (&ldquo;sections&rdquo;), and the later legs &mdash; the 3rd "
    "and 4th &mdash; carry more weight as trend-change confirmation than the 2nd does.", styles["Body"]))
story.append(figure("05_sections.png",
    "A campaign of four legs; the later legs are weighted more heavily for trend-change confirmation."))
story.append(Paragraph("The “Rule of Three”", styles["SubHead"]))
story.append(Paragraph(
    "Gann's own highest-conviction claim, worded almost identically to how he wrote it "
    "himself: a stock in a confirmed uptrend will not close three consecutive days lower "
    "without that being at least a temporary reversal signal &mdash; and the mirror rule "
    "holds for downtrends. He states, in his own words, that traders paid him significant "
    "money just for this one rule.", styles["Body"]))
story.append(figure("06_rule_of_three.png",
    "Three consecutive lower closes inside an uptrend &mdash; Gann's own highest-conviction signal."))
story.append(PageBreak())

# ---------- Layer 4 ----------
story.append(Paragraph("Layer 4 &mdash; Confluence", styles["PartTitle"]))
story.append(Paragraph("Evidence level: <b>disclosed as an organizing principle</b>, not a standalone technique.", styles["Callout"]))
story.append(Paragraph(
    "No single layer above is meant to be trusted alone. A price sitting at an old "
    "resistance level, at the same time as a retracement zone, at the same time as a "
    "timing window from Layer 3, is a far stronger signal than any one of those "
    "coordinates by itself. This is arguably the single most important organizing idea in "
    "the entire method: don't act on one coordinate lining up &mdash; act where several "
    "independent ones agree at once.", styles["Body"]))
story.append(figure("07_confluence.png",
    "Three independent signals &mdash; an old level, a retracement zone, and a timing window &mdash; stacking on the same point."))
story.append(PageBreak())

# ---------- Layer 5 ----------
story.append(Paragraph("Layer 5 &mdash; “Vibration”", styles["PartTitle"]))
story.append(Paragraph("Evidence level: <b>named but never defined</b> &mdash; the least solid layer, and the one every later source disagrees about.", styles["Callout"]))
story.append(Paragraph(
    "Gann's headline claim, all the way back in his very first public interview in 1909, "
    "was that every stock has its own individual &ldquo;rate of vibration&rdquo; &mdash; "
    "language borrowed directly from the physics of his era (wireless telegraphy was brand "
    "new and a popular metaphor at the time). He repeats the term across his career. He "
    "never once gives a formula for it, in any of his ten books.", styles["Body"]))
story.append(Paragraph(
    "That gap has been filled three different ways since his death, and the three "
    "attempts do not agree with each other or carry equal weight:", styles["Body"]))
story.append(Paragraph(
    "&bull;&nbsp;&nbsp;<b>Digit-based numerology</b> (reducing prices or dates to a single "
    "digit 1&ndash;9 and looking for patterns) &mdash; the weakest evidence of the three; "
    "much of what looks like a pattern here is simply an artifact of counting in base 10, "
    "not a market discovery.", styles["BulletItem"]))
story.append(Paragraph(
    "&bull;&nbsp;&nbsp;<b>Fourier / spectral cycle analysis</b> (mathematically decomposing "
    "a price series into its dominant repeating cycles) &mdash; the best-evidenced "
    "reconstruction of the three. A real 1926 letter in Gann's own hand names the "
    "statisticians Moore, Schuster, and Fourier directly, which is about as close to a "
    "smoking gun as this layer gets.", styles["BulletItem"]))
story.append(Paragraph(
    "&bull;&nbsp;&nbsp;<b>Astrology</b> (planetary-cycle timing) &mdash; confirmed as "
    "something Gann genuinely used in practice, according to the organization that holds "
    "his actual private working papers, but never disclosed in either of the two primary "
    "documents this audit is built on, and absent from every one of his ten published "
    "books.", styles["BulletItem"]))
story.append(figure("08_vibration.png",
    "A caution, followed by the three later, mutually incompatible attempts to fill in what Gann never explained."))
story.append(PageBreak())

# ---------- Layer 6 ----------
story.append(Paragraph("Layer 6 &mdash; Tape reading", styles["PartTitle"]))
story.append(Paragraph("Evidence level: <b>fully disclosed</b> &mdash; the foundation his earliest writing is built on.", styles["Callout"]))
story.append(Paragraph(
    "Underneath every layer above, Gann's earliest published work is explicit that the "
    "tape itself &mdash; real order flow, volume, and how a level actually behaves when "
    "tested in real time &mdash; is the final arbiter. Geometry and timing propose "
    "candidate levels and windows; the tape, and specifically a spike in volume at a "
    "turning point (what this project calls a &ldquo;volume climax&rdquo;), confirms or "
    "denies them. A geometric level that the market approaches on shrinking, quiet volume "
    "is a much weaker signal than the same level tested on a sudden surge of activity.", styles["Body"]))
story.append(figure("09_volume_climax.png",
    "A genuine turning point, in Gann's framing, prints on a spike of volume &mdash; not a quiet one."))
story.append(PageBreak())

# ---------- Summary ----------
story.append(Paragraph("Putting it together", styles["PartTitle"]))
story.append(rule())
story.append(figure("10_summary_map.png",
    "What Gann actually published, across all ten of his books, laid out end to end."))
story.append(Paragraph(
    "The honest summary: Gann sold discipline and a handful of arithmetic price rules, "
    "in enormous, repetitive detail, across ten books and forty-five years. He gestured at "
    "a much deeper timing theory and a &ldquo;vibration&rdquo; behind it all, and was "
    "explicit, more than once, that he was not going to explain either one. Everything "
    "built since &mdash; Square of 9 grids, fixed-angle fans, digit numerology, planetary "
    "ephemeris timing, spectral cycle software &mdash; is a later attempt, by other people, "
    "to reverse-engineer the parts he kept to himself. Some of those attempts are "
    "well-evidenced from his private papers; some are speculative pattern-matching with "
    "very little behind them. Knowing which is which is the entire point of reading the "
    "original ten books rather than only the folklore that grew up around them.", styles["Body"]))
story.append(PageBreak())

# ---------- Appendix: the ten books ----------
story.append(Paragraph("Appendix &mdash; the ten books, one paragraph each", styles["PartTitle"]))
story.append(rule())
books = [
    ("1909", "The Ticker and Investment Digest interview",
     "Not a book Gann wrote, but a profile of him by the magazine's editor. Introduces "
     "the “Law of Vibration” claim and establishes his credibility with specific, "
     "checkable forecasts. Public domain."),
    ("1923", "Truth of the Stock Tape",
     "His first full book. Establishes tape reading as the foundation and lays out early "
     "versions of the discipline rules. Public domain."),
    ("1927", "The Tunnel Thru the Air",
     "A novel, not a manual &mdash; but by far his richest source for this audit. Contains "
     "his direct use of the term “harmonic analysis,” his explicit refusal to "
     "explain “the cause of cycles,” extensive astrological material, and a "
     "detailed fictionalized trading campaign with a 10%-of-profits pyramiding rule. "
     "Public domain."),
    ("1930", "Wall Street Stock Selector",
     "Twenty-four “never-failing” rules, the “Rule of Three,” a "
     "“boiling point” breakout rule, and the fixed annual cycle. Entered the "
     "public domain January 2026."),
    ("1936", "New Stock Trend Detector",
     "Confirms, by its total absence of the terms, that Square of 9 and Gann angles are "
     "not part of his disclosed method even this late in his career. Introduces the "
     "3-point rule and 3-day confirmation rule. Still under copyright."),
    ("1937/1941", "How to Make Profits Trading in Puts and Calls",
     "Mechanics of the era's over-the-counter options market. No new geometry or timing "
     "content. Still under copyright."),
    ("1940", "Face Facts America",
     "A wartime forecasting pamphlet applying his method to geopolitical events, not just "
     "markets. Still under copyright."),
    ("1941/1951", "How to Make Profits Trading in Commodities",
     "His most detailed rulebook: the 28 “valuable” rules, all nine numbered "
     "buying and selling points, the full percentage resistance-level method, the "
     "“lost motion” stop-buffer concept, and “sections of a campaign.” "
     "Still under copyright."),
    ("1949", "45 Years in Wall Street",
     "His capstone book. The definitive “24 Never-Failing Rules” list, the "
     "3-Day and 9-Point Swing Chart methods, a refined and ranked percentage-resistance "
     "hierarchy, duration-based “time square” bands, and “anniversary "
     "dates” worked year by year from 1929 to 1949. Still under copyright."),
    ("1950", "The Magic Word",
     "A religious tract, not a trading book &mdash; ties his belief in market law to his "
     "Christian faith and to sacred numbers (3, 7, 9, 10, 12, 21). Still under copyright."),
    ("1954", "The Basis of My Forecasting Method",
     "A short, late-life promotional booklet naming five forecasting factors: Time, "
     "Price, Volume, Speed, and Mass Pressure. Confirms astrology is still absent from "
     "his public-facing material at the very end of his life. Still under copyright."),
]
for year, title, desc in books:
    story.append(Paragraph(f"<b>{year} &mdash; {title}.</b> {desc}", styles["BookEntry"]))

doc = SimpleDocTemplate(OUT, pagesize=LETTER,
                         topMargin=0.75 * inch, bottomMargin=0.75 * inch,
                         leftMargin=0.85 * inch, rightMargin=0.85 * inch,
                         title="The Gann Method, Explained")
doc.build(story)
print("wrote", OUT)
