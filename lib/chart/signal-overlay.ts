// §8: Signal overlay management for chart decluttering
import type { Timeframe } from '@/lib/learning/types';

export type SignalState = 'armed' | 'active' | 'confirmed' | 'expired' | 'invalidated';

export interface SignalOverlay {
  id: string;
  symbol: string;
  originTimeframe: Timeframe;
  originScore: number;
  originState: SignalState;
  direction: 'bullish' | 'bearish';
  setupSignal?: boolean;
  entry: number;
  stopLoss: number;
  tp1: number;
  mtp: number;
  // Multi-TF context
  higherTfSignals: Array<{
    timeframe: Timeframe;
    score: number;
    direction: 'bullish' | 'bearish' | 'neutral';
  }>;
  // State and health
  validityBarsRemaining: number;
  isConflicted: boolean;
  extendedHoursFlag: boolean;
  extendedHoursGapPct?: number;
}

// Collapse duplicate signals from multiple timeframes into single overlay
export function collapseMultiTimeframeSignals(signals: SignalOverlay[]): SignalOverlay[] {
  if (signals.length === 0) return [];

  // Group by (symbol, direction) to find duplicates
  const groups = new Map<string, SignalOverlay[]>();

  for (const signal of signals) {
    const key = `${signal.symbol}:${signal.direction}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(signal);
  }

  // For each group, keep origin-timeframe signal; mark others as contextual
  const collapsed: SignalOverlay[] = [];

  for (const group of groups.values()) {
    // Sort by timeframe (origin first)
    const sorted = group.sort((a, b) => {
      const aIsOrigin = a.originTimeframe === a.originTimeframe ? 0 : 1;
      const bIsOrigin = b.originTimeframe === b.originTimeframe ? 0 : 1;
      return aIsOrigin - bIsOrigin;
    });

    // Primary: origin signal
    const primary = sorted[0];
    const contextual = sorted.slice(1);

    // Attach higher-TF context to primary
    primary.higherTfSignals = contextual.map((s) => ({
      timeframe: s.originTimeframe,
      score: s.originScore,
      direction: s.direction,
    }));

    collapsed.push(primary);
  }

  return collapsed;
}

// Color coding for signal states
export function getStateColor(state: SignalState): string {
  const colors: Record<SignalState, string> = {
    armed: '#9ca3af', // gray
    active: '#3b82f6', // blue
    confirmed: '#10b981', // green
    expired: '#f97316', // orange
    invalidated: '#ef4444', // red
  };
  return colors[state];
}

// Check if signal should display conflict indicator
export function shouldShowConflictIndicator(signal: SignalOverlay): boolean {
  return signal.isConflicted && signal.higherTfSignals.length > 0;
}

// Generate tooltip text for signal
export function generateSignalTooltip(signal: SignalOverlay): string {
  const lines: string[] = [];

  lines.push(`Signal: ${signal.direction.toUpperCase()}`);
  lines.push(`Valid on: ${signal.originTimeframe}`);
  lines.push(`Score: ${signal.originScore}/9`);
  lines.push(`Bars remaining: ${signal.validityBarsRemaining}`);

  if (signal.setupSignal) {
    lines.push('Setup Signal: Confirmed');
  }

  if (signal.higherTfSignals.length > 0) {
    lines.push('Higher-TF context:');
    for (const htf of signal.higherTfSignals) {
      lines.push(`  ${htf.timeframe}: ${htf.direction} (${htf.score}/9)`);
    }
  }

  if (signal.isConflicted) {
    lines.push('⚠ Conflict with higher-TF bias');
  }

  if (signal.extendedHoursFlag && signal.extendedHoursGapPct) {
    const gapStr = (signal.extendedHoursGapPct * 100).toFixed(2);
    lines.push(`EH Gap: ${gapStr}%`);
  }

  return lines.join('\n');
}

// Key-level geometry display filter
export interface KeyLevelGeometry {
  level: 3 | 6 | 9;
  lines: Array<{
    angle: number; // degrees from pivot
    isActive: boolean;
    confidence: number; // 0-1
  }>;
}

export function filterActiveKeyLevels(geometry: KeyLevelGeometry[], activeLevel?: 3 | 6 | 9): KeyLevelGeometry[] {
  if (!activeLevel) {
    return []; // no active level, hide all
  }

  // Show only lines for the active level
  return geometry
    .filter((g) => g.level === activeLevel)
    .map((g) => ({
      ...g,
      lines: g.lines.filter((line) => line.isActive),
    }))
    .filter((g) => g.lines.length > 0);
}

// Extended-hours detection and labeling
export interface ExtendedHoursBanner {
  show: boolean;
  message: string;
  severity: 'info' | 'warning' | 'alert';
  gapPct: number;
}

export function checkExtendedHoursBanner(signal: SignalOverlay): ExtendedHoursBanner {
  if (!signal.extendedHoursFlag || !signal.extendedHoursGapPct) {
    return { show: false, message: '', severity: 'info', gapPct: 0 };
  }

  const gapPct = signal.extendedHoursGapPct * 100;
  const thresholds = {
    alert: 3, // 3%+ = alert
    warning: 1.5, // 1.5%+ = warning
  };

  if (gapPct >= thresholds.alert) {
    return {
      show: true,
      message: `Material EH move detected (${gapPct.toFixed(2)}%) – re-scan recommended`,
      severity: 'alert',
      gapPct,
    };
  }

  if (gapPct >= thresholds.warning) {
    return {
      show: true,
      message: `Minor EH move (${gapPct.toFixed(2)}%) – check context`,
      severity: 'warning',
      gapPct,
    };
  }

  return {
    show: false,
    message: '',
    severity: 'info',
    gapPct,
  };
}

// Novice explanation generation
export function generateSignalExplanation(signal: SignalOverlay): string[] {
  const bullets: string[] = [];

  // Setup signal explanation
  if (signal.setupSignal) {
    bullets.push(
      'Entry aligned with a key price level — a signal with historical significance.'
    );
  }

  // Directionality
  if (signal.direction === 'bullish') {
    bullets.push(
      `Pattern shows upside reversion: price is likely to reverse up to the first take-profit level.`
    );
  } else {
    bullets.push(
      `Pattern shows downside reversion: price is likely to reverse down to the first take-profit level.`
    );
  }

  // Score interpretation
  if (signal.originScore >= 7) {
    bullets.push(`Score of ${signal.originScore}/9 indicates high confluence — multiple technical signals align.`);
  } else if (signal.originScore >= 5) {
    bullets.push(`Score of ${signal.originScore}/9 indicates moderate setup — proceed with caution.`);
  } else {
    bullets.push(`Score of ${signal.originScore}/9 indicates marginal signal — consider waiting for confirmation.`);
  }

  // Multi-TF context
  if (signal.higherTfSignals.length > 0) {
    const alignment = signal.higherTfSignals.some((h) => h.direction === signal.direction);
    if (alignment) {
      bullets.push(`Higher timeframes confirm ${signal.direction} bias — adds confidence to this trade.`);
    } else {
      bullets.push(
        `Caution: Higher timeframes show conflicting bias — risk/reward may be asymmetric.`
      );
    }
  }

  // Validity
  if (signal.validityBarsRemaining <= 1) {
    bullets.push(`Signal expires after this bar — execute quickly if taking the trade.`);
  }

  return bullets;
}
