"""
Original diagrams for the Gann-method explainer PDF.
All charts are original recreations of concepts, not reproductions of any
scanned book page or chart. Clean, plain, labeled for a non-technical reader.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Circle, Wedge
import numpy as np

OUT = "/tmp/claude-0/-home-user-GSPS/f9c5b1ba-ffe1-59a4-a4d0-68baf560793b/scratchpad/gann-pdf/figs"

# ---- palette ----
INK = "#1f2430"
PAPER = "#fdfcf9"
BLUE = "#2b5b84"
GREEN = "#3a7d5c"
RED = "#a6403a"
GOLD = "#b8863b"
PURPLE = "#6b4c7a"
GREY = "#8a8f98"
LIGHT = "#eef1ee"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "text.color": INK,
    "axes.edgecolor": INK,
    "axes.labelcolor": INK,
    "xtick.color": INK,
    "ytick.color": INK,
    "figure.facecolor": PAPER,
    "axes.facecolor": PAPER,
    "savefig.facecolor": PAPER,
})


def save(fig, name):
    fig.savefig(f"{OUT}/{name}.png", dpi=200, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)


# =====================================================================
# 1. The Six Layers — stack diagram
# =====================================================================
def fig_six_layers():
    fig, ax = plt.subplots(figsize=(7.2, 8.6))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 13)
    ax.axis("off")

    layers = [
        ("1. DISCIPLINE", "Position sizing, stop-losses,\nnever average a loser", BLUE, "Fully disclosed"),
        ("2. STRUCTURE", "Old price levels that have held before,\npercentage retracement zones", GREEN, "Fully disclosed"),
        ("3. TIMING", "Elapsed time compared to past swings,\nfixed calendar dates, anniversaries", GOLD, "Outer shell disclosed;\nthe engine was not"),
        ("4. CONFLUENCE", "Trust a level more when several\nof the above line up on it", "#4a6b8a", "Fully disclosed"),
        ("5. “VIBRATION”", "Each stock's own character;\nnumerology, cycles, astrology", PURPLE, "Named but never\nexplained in print"),
        ("6. TAPE READING", "Real volume and price behavior\nis the final judge", RED, "Fully disclosed"),
    ]
    n = len(layers)
    h = 1.85
    gap = 0.28
    y = 12.4
    for i, (title, desc, color, tag) in enumerate(layers):
        y0 = y - h
        box = FancyBboxPatch((0.4, y0), 9.2, h, boxstyle="round,pad=0.02,rounding_size=0.12",
                              linewidth=0, facecolor=color, alpha=0.92)
        ax.add_patch(box)
        ax.text(0.9, y0 + h - 0.48, title, fontsize=15, fontweight="bold", color="white", va="top")
        ax.text(0.9, y0 + h - 1.0, desc, fontsize=10.3, color="white", va="top", linespacing=1.5)
        ax.text(9.0, y0 + h / 2, tag, fontsize=9, color="white", va="center", ha="right",
                style="italic", linespacing=1.4, alpha=0.95)
        y = y0 - gap

    ax.text(5, 12.95, "The Gann Method, Layer by Layer", fontsize=17, fontweight="bold",
            ha="center", color=INK)
    ax.text(5, 0.35, "Built from every trading book W.D. Gann published, 1923–1954",
            fontsize=9.5, ha="center", color=GREY, style="italic")
    save(fig, "01_six_layers")


# =====================================================================
# 2. Discipline — capital divided into 10 parts + stop-loss
# =====================================================================
def fig_discipline():
    fig, axes = plt.subplots(1, 2, figsize=(9.6, 4.3))

    # left: capital divided into 10
    ax = axes[0]
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 3.6)
    ax.axis("off")
    for i in range(10):
        color = RED if i == 0 else LIGHT
        edge = INK
        rect = plt.Rectangle((i, 0.6), 0.9, 1.6, facecolor=color, edgecolor=edge, linewidth=1.1)
        ax.add_patch(rect)
    ax.text(0.45, 1.4, "1", ha="center", va="center", fontsize=13, color="white", fontweight="bold")
    ax.text(0, 3.35, "Divide trading capital into 10 equal parts.", fontsize=11, color=INK)
    ax.text(0, 3.0, "Never risk more than one part on a single trade.", fontsize=11, color=INK)
    ax.text(0, 0.15, "→ losing five trades in a row still leaves half the capital working",
            fontsize=9.3, color=GREY, style="italic")

    # right: stop-loss / move-to-breakeven illustration
    ax = axes[1]
    x = np.linspace(0, 10, 200)
    entry = 5
    price = entry + np.piecewise(
        x, [x < 4, (x >= 4) & (x < 7), x >= 7],
        [lambda x: 0.15 * x, lambda x: 0.6 + 0.9 * np.sin((x - 4) * 0.5), lambda x: 0.9 + 0.05 * (x - 7)]
    )
    ax.plot(x, price, color=BLUE, linewidth=2.2)
    ax.axhline(entry, color=GREY, linewidth=1, linestyle=":")
    ax.text(0.1, entry + 0.08, "entry price", fontsize=9, color=GREY)
    stop1 = entry - 0.6
    ax.axhline(stop1, xmax=0.38, color=RED, linewidth=1.6, linestyle="--")
    ax.text(0.1, stop1 - 0.22, "initial stop-loss", fontsize=9, color=RED)
    ax.axhline(entry + 0.02, xmin=0.4, xmax=1.0, color=GREEN, linewidth=1.6, linestyle="--")
    ax.text(4.3, entry + 0.18, "stop moved to breakeven\nonce trade shows a profit", fontsize=9, color=GREEN)
    ax.set_xlim(0, 10)
    ax.set_ylim(3.5, 7.3)
    ax.axis("off")
    ax.set_title("Never let a real gain\nround-trip back to a loss", fontsize=11, color=INK, pad=10)

    fig.suptitle("Layer 1 — Discipline", fontsize=14, fontweight="bold", y=1.03)
    save(fig, "02_discipline")


# =====================================================================
# 3. Old-level crossing + "lost motion" stop buffer
# =====================================================================
def fig_old_level():
    fig, ax = plt.subplots(figsize=(9, 4.6))
    x = np.linspace(0, 20, 400)
    level = 5.0
    price = level + 0.35 * np.sin(x * 0.9) * np.exp(-((x - 6) ** 2) / 30) \
             + np.where(x > 12, (x - 12) * 0.22, 0) \
             + 0.12 * np.sin(x * 2.3) * 0.4
    price[x <= 12] = level + 0.5 * np.sin(x[x <= 12] * 0.55) * np.exp(-((x[x <= 12] - 8) ** 2) / 60)
    ax.plot(x, price, color=BLUE, linewidth=2)
    ax.axhline(level, color=GREY, linewidth=1.3, linestyle="-")
    ax.text(0.2, level + 0.08, "old resistance level — tested and held twice before", fontsize=9.5, color=GREY)

    buffer_top = level + 0.18
    ax.axhspan(level, buffer_top, xmin=0.58, xmax=1.0, color=GOLD, alpha=0.25)
    ax.axhline(buffer_top, xmin=0.58, xmax=1.0, color=GOLD, linewidth=1.4, linestyle="--")
    ax.text(15.2, buffer_top + 0.05, "“lost motion” buffer\n(a small overshoot, expected)", fontsize=9, color="#8a6a1f")

    stop_y = level - 0.15
    ax.axhline(stop_y, xmin=0.58, xmax=1.0, color=RED, linewidth=1.4, linestyle="--")
    ax.text(15.2, stop_y - 0.28, "protective stop — set just beyond\nthe old level, on the far side", fontsize=9, color=RED)

    for tx in [3.5, 8.0]:
        idx = (np.abs(x - tx)).argmin()
        ax.plot(tx, price[idx], "o", color=INK, markersize=5)
    ax.annotate("1st test", (3.5, level + 0.02), textcoords="offset points", xytext=(-10, -22), fontsize=8.5, color=INK)
    ax.annotate("2nd test\n(safer to trade\nthan the first)", (8.0, level + 0.02), textcoords="offset points", xytext=(-10, -46), fontsize=8.5, color=INK, linespacing=1.3)
    ax.annotate("breakout —\nkeeps going", (16.5, price[np.abs(x - 16.5).argmin()]), textcoords="offset points", xytext=(-30, 18), fontsize=8.5, color=GREEN, fontweight="bold")

    ax.set_xlim(0, 20)
    ax.set_ylim(4.2, 6.3)
    ax.axis("off")
    ax.set_title("Layer 2 — Old-Level Crossing\n(the technique Gann's own books return to more than any other)",
                 fontsize=12.5, fontweight="bold", pad=14)
    save(fig, "03_old_level_crossing")


# =====================================================================
# 4. Percentage retracement (eighths)
# =====================================================================
def fig_retracement():
    fig, ax = plt.subplots(figsize=(7.4, 5.4))
    low, high = 1.0, 9.0
    rng = high - low
    fractions = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0]
    labels = ["0\n(low)", "1/8", "1/4", "3/8", "1/2\nmost important", "5/8", "3/4", "7/8", "1\n(high)"]
    weights = [0, 1, 2, 1, 3, 1, 2, 1, 0]

    x = np.linspace(0, 10, 300)
    price = low + rng * (1 / (1 + np.exp(-(x - 5) * 0.9)))
    ax.plot(x, price, color=BLUE, linewidth=2.2, zorder=5)

    for f, lab, w in zip(fractions, labels, weights):
        lvl = low + rng * f
        lw = 0.8 + w * 0.55
        alpha = 0.35 + w * 0.18
        color = GOLD if w >= 3 else (GREEN if w == 2 else GREY)
        ax.axhline(lvl, color=color, linewidth=lw, alpha=min(alpha, 1), zorder=1)
        ax.text(10.2, lvl, lab, fontsize=9, va="center", color=INK, linespacing=1.3)

    ax.set_xlim(0, 12.5)
    ax.set_ylim(low - 0.5, high + 0.5)
    ax.axis("off")
    ax.set_title("Layer 2 — Percentage Retracement\nDivide a swing into eighths; the halfway point matters most",
                 fontsize=12.5, fontweight="bold", pad=14)
    save(fig, "04_retracement")


# =====================================================================
# 5. Sections of a campaign
# =====================================================================
def fig_sections():
    fig, ax = plt.subplots(figsize=(9, 4.6))
    xs = [0, 2.2, 3.0, 5.0, 5.8, 7.8, 8.5, 10.2]
    ys = [1.0, 3.2, 2.6, 4.6, 4.1, 6.4, 5.7, 6.9]
    ax.plot(xs, ys, color=BLUE, linewidth=2.4, marker="o", markersize=5)

    seg_labels = ["Section 1", "Section 2", "Section 3", "Section 4\n(often the top)"]
    seg_x = [1.1, 4.0, 6.8, 9.35]
    for lab, sx in zip(seg_labels, seg_x):
        ax.text(sx, 0.4, lab, ha="center", fontsize=9.5, color=INK, fontweight="bold")

    for sx in [2.6, 5.4, 8.15]:
        ax.axvline(sx, color=GREY, linewidth=0.8, linestyle=":", ymax=0.92)

    ax.annotate("reaction that finally exceeds every\nprior reaction, in size or in time\n= trend-change warning",
                (7.8, 6.4), textcoords="offset points", xytext=(-150, 10), fontsize=9, color=RED,
                arrowprops=dict(arrowstyle="->", color=RED, lw=1.2), linespacing=1.4)

    ax.set_xlim(-0.3, 10.6)
    ax.set_ylim(0, 9.3)
    ax.axis("off")
    ax.set_title("Layer 3 — Sections of a Campaign\nA bull or bear move typically runs 3–4 legs; later legs carry more weight",
                 fontsize=12.5, fontweight="bold", pad=14)
    save(fig, "05_sections")


# =====================================================================
# 6. Rule of Three
# =====================================================================
def fig_rule_of_three():
    fig, ax = plt.subplots(figsize=(8.6, 4.6))
    closes = [4.0, 4.3, 4.15, 4.5, 4.7, 4.9, 4.75, 4.55, 4.3, 4.8, 5.0]
    xs = np.arange(len(closes))
    colors = [GREEN] * len(closes)
    colors[6] = RED
    colors[7] = RED
    colors[8] = RED
    for i, (x, c, col) in enumerate(zip(xs, closes, colors)):
        ax.bar(x, c, width=0.55, bottom=0, color=col, alpha=0.85)
    ax.plot(xs, closes, color=INK, linewidth=1.3, marker="o", markersize=4, zorder=5)

    ax.annotate("3 consecutive closes\nagainst the trend\n= treat as a reversal signal",
                (7, closes[7]), textcoords="offset points", xytext=(-10, 20), fontsize=9.5, color=RED,
                arrowprops=dict(arrowstyle="->", color=RED, lw=1.2), linespacing=1.4, ha="center")

    ax.set_ylim(0, 7.4)
    ax.axis("off")
    ax.set_title('Layer 3 — The "Rule of Three"\nGann’s own highest-conviction claim: "traders paid me $1,000 for this rule"',
                 fontsize=12, fontweight="bold", pad=14)
    save(fig, "06_rule_of_three")


# =====================================================================
# 7. Confluence
# =====================================================================
def fig_confluence():
    fig, ax = plt.subplots(figsize=(8.4, 5.2))
    x = np.linspace(0, 10, 300)
    target = 5.6
    price = 3.0 + 3.2 * (1 / (1 + np.exp(-(x - 6) * 1.1)))
    ax.plot(x, price, color=BLUE, linewidth=2.2, zorder=6)

    items = [
        ("old resistance level", target + 0.02, GREEN, 0.55),
        ("50% retracement zone", target - 0.03, GOLD, 0.75),
        ("elapsed-time “square” window", target + 0.05, "#4a6b8a", 0.4),
        ("sections-of-campaign 3rd leg", target - 0.01, PURPLE, 0.6),
    ]
    for i, (lab, lvl, color, alpha) in enumerate(items):
        ax.axhline(lvl, xmin=0.15, xmax=0.92, color=color, linewidth=2.6, alpha=alpha)
        ax.text(0.1, lvl + 0.10 - i * 0.0, "", fontsize=1)

    ax.text(10.1, target, "several independent\nsignals agree here —\nthis is what Gann meant\nby a trustworthy level",
            fontsize=9.5, color=INK, va="center", linespacing=1.4)
    labels_x = 0.3
    for i, (lab, lvl, color, alpha) in enumerate(items):
        ax.text(labels_x, 1.9 - i * 0.35, "—", color=color, fontsize=13, fontweight="bold")
        ax.text(labels_x + 0.35, 1.9 - i * 0.35, lab, fontsize=9, color=INK, va="center")

    ax.axvspan(6.0, 6.6, color=RED, alpha=0.12)
    ax.set_xlim(0, 15)
    ax.set_ylim(1.0, 6.8)
    ax.axis("off")
    ax.set_title("Layer 4 — Confluence\nNo single signal is trusted alone — act where several agree",
                 fontsize=12.5, fontweight="bold", pad=14)
    save(fig, "07_confluence")


# =====================================================================
# 8. Vibration / numerology — digital root mod-9 wheel
# =====================================================================
def fig_vibration():
    fig, axes = plt.subplots(1, 2, figsize=(9.6, 4.8))

    # left: mod-9 wheel
    ax = axes[0]
    ax.set_xlim(-1.4, 1.4)
    ax.set_ylim(-2.0, 1.4)
    ax.set_aspect("equal")
    ax.axis("off")
    circle = Circle((0, 0), 1.0, facecolor="none", edgecolor=GREY, linewidth=1.2)
    ax.add_patch(circle)
    for n in range(1, 10):
        ang = np.pi / 2 - (n - 1) * (2 * np.pi / 9)
        px, py = np.cos(ang), np.sin(ang)
        color = PURPLE if n == 9 else BLUE
        ax.plot(px, py, "o", color=color, markersize=16)
        ax.text(px, py, str(n), ha="center", va="center", fontsize=10, color="white", fontweight="bold")
    ax.text(0, -1.62, "digit-sum reduction repeats\nevery 9 steps — true of ANY\nevenly-spaced sequence,\nnot a market discovery",
            fontsize=8.6, ha="center", va="top", color=GREY, linespacing=1.35)
    ax.set_title("A caution, not a technique", fontsize=10.5, color=RED, pad=8)

    # right: the three reconstructions
    ax = axes[1]
    ax.axis("off")
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    boxes = [
        ("Digit numerology", "Weakest evidence —\noften just base-10 arithmetic", GREY, 7.6),
        ("Astrology", "Real, but only ever found\nin PRIVATE letters, never\nin a book he sold", PURPLE, 4.6),
        ("Fourier / cycle analysis", "Best-evidenced — Gann named\nMoore, Schuster & Fourier\nin a real 1926 letter", GREEN, 1.6),
    ]
    for lab, desc, color, y in boxes:
        box = FancyBboxPatch((0.3, y), 9.4, 2.2, boxstyle="round,pad=0.02,rounding_size=0.15",
                              linewidth=1.3, edgecolor=color, facecolor=color, alpha=0.12)
        ax.add_patch(box)
        ax.text(0.7, y + 1.65, lab, fontsize=11, fontweight="bold", color=color)
        ax.text(0.7, y + 1.1, desc, fontsize=9, color=INK, linespacing=1.4, va="top")
    ax.set_title("Three later attempts to fill the gap", fontsize=10.5, color=INK, pad=8)

    fig.suptitle('Layer 5 — "Vibration": the layer Gann named but never explained in print',
                 fontsize=12.5, fontweight="bold", y=1.04)
    save(fig, "08_vibration")


# =====================================================================
# 9. Volume climax (tape reading)
# =====================================================================
def fig_volume_climax():
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8.6, 5.2), sharex=True,
                                    gridspec_kw={"height_ratios": [2.2, 1]})
    x = np.linspace(0, 10, 200)
    price = 5 - 0.9 * np.exp(-((x - 5) ** 2) / 1.6) + 0.35 * np.sin(x * 3) * np.exp(-((x - 5) ** 2) / 4)
    ax1.plot(x, price, color=BLUE, linewidth=2.2)
    low_idx = np.argmin(price)
    ax1.plot(x[low_idx], price[low_idx], "o", color=RED, markersize=7, zorder=5)
    ax1.annotate("turning point", (x[low_idx], price[low_idx]), textcoords="offset points",
                 xytext=(15, -25), fontsize=9.5, color=RED,
                 arrowprops=dict(arrowstyle="->", color=RED, lw=1.1))
    ax1.axis("off")

    vol = 1.2 + 0.3 * np.random.default_rng(3).random(len(x))
    vol += 3.0 * np.exp(-((x - 5) ** 2) / 0.8)
    ax2.bar(x, vol, width=0.045, color=GOLD, alpha=0.85)
    ax2.axhline(1.5 * 1.4, color=RED, linewidth=1.2, linestyle="--")
    ax2.text(0.1, 1.5 * 1.4 + 0.15, "climax threshold — unusually heavy volume", fontsize=8.7, color=RED)
    ax2.axis("off")

    fig.suptitle("Layer 6 — Tape Reading\nGenuine turning points, Gann held, print on heavy volume, not a quiet one",
                 fontsize=12.5, fontweight="bold", y=1.02)
    save(fig, "09_volume_climax")


# =====================================================================
# 10. Disclosed vs. reconstructed vs. never-disclosed summary
# =====================================================================
def fig_summary_map():
    fig, ax = plt.subplots(figsize=(9, 7.2))
    ax.axis("off")
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)

    cols = [
        ("DISCLOSED\nin his own books", GREEN, [
            "Risk & money management",
            "Old-level crossing",
            "% retracement (eighths)",
            "Rule of Three",
            "Sections of a campaign",
            "3-Day / 9-Point swing chart",
            "Fixed annual date cycle",
            "Anniversary dates",
            "Volume climax at turns",
        ]),
        ("NAMED, but the\nmechanism withheld", GOLD, [
            'The "Time Factor"',
            '"Harmonic analysis"',
            '"Law of Vibration"',
            '"Master Time Cycle"',
        ]),
        ("NEVER in a\npublished book", PURPLE, [
            "Astrology / planetary timing",
            "(confirmed real, but only",
            "in private client letters)",
        ]),
    ]
    w = 3.0
    gap = 0.15
    x0 = 0.1
    for title, color, items in cols:
        box = FancyBboxPatch((x0, 8.6), w, 1.15, boxstyle="round,pad=0.02,rounding_size=0.1",
                              linewidth=0, facecolor=color)
        ax.add_patch(box)
        ax.text(x0 + w / 2, 9.17, title, ha="center", va="center", fontsize=10.2,
                color="white", fontweight="bold", linespacing=1.3)
        y = 8.35
        for it in items:
            ax.text(x0 + 0.15, y, "• " + it, fontsize=8.8, color=INK, va="top")
            y -= 0.62
        x0 += w + gap

    ax.set_title("What Gann actually published, across all ten of his books",
                 fontsize=13.5, fontweight="bold", pad=4)
    save(fig, "10_summary_map")


if __name__ == "__main__":
    fig_six_layers()
    fig_discipline()
    fig_old_level()
    fig_retracement()
    fig_sections()
    fig_rule_of_three()
    fig_confluence()
    fig_vibration()
    fig_volume_climax()
    fig_summary_map()
    print("done")
