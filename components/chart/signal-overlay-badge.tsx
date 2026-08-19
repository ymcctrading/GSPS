// §8: Signal overlay badge with decluttered UX
'use client';

import { AlertTriangle, Info, TrendingDown, TrendingUp } from 'lucide-react';
import type { SignalOverlay } from '@/lib/chart/signal-overlay';
import {
  getStateColor,
  generateSignalTooltip,
  checkExtendedHoursBanner,
  generateSignalExplanation,
  shouldShowConflictIndicator,
} from '@/lib/chart/signal-overlay';

interface SignalBadgeProps {
  signal: SignalOverlay;
  onExecute?: () => void;
  onIgnore?: () => void;
  onExplain?: () => void;
  compact?: boolean;
}

export function SignalOverlayBadge({ signal, onExecute, onIgnore, onExplain, compact = false }: SignalBadgeProps) {
  const stateColor = getStateColor(signal.originState);
  const Icon = signal.direction === 'bullish' ? TrendingUp : TrendingDown;
  const ehBanner = checkExtendedHoursBanner(signal);
  const tooltip = generateSignalTooltip(signal);

  if (compact) {
    return (
      <div
        className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: stateColor, color: 'white', opacity: 0.9 }}
        title={tooltip}
      >
        <Icon className="h-3 w-3" />
        <span>{signal.originScore}/9</span>
        {shouldShowConflictIndicator(signal) && (
          <AlertTriangle className="h-3 w-3 ml-1" />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface">
      {/* Header: Signal type and score */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center h-10 w-10 rounded-full text-white font-bold"
            style={{ backgroundColor: stateColor }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-sm">{signal.direction.toUpperCase()}</p>
            <p className="text-xs text-muted">Score: {signal.originScore}/9</p>
          </div>
        </div>

        {/* Conflict indicator */}
        {shouldShowConflictIndicator(signal) && (
          <div className="flex items-center gap-1 text-yellow-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-medium">Higher-TF Conflict</span>
          </div>
        )}
      </div>

      {/* Timeframe and validity */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">
          Signal valid on: <span className="text-accent">{signal.originTimeframe}</span>
        </span>
        <span className={signal.validityBarsRemaining <= 1 ? 'text-red-600 font-bold' : 'text-muted'}>
          {signal.validityBarsRemaining} bars remaining
        </span>
      </div>

      {/* Extended-hours banner */}
      {ehBanner.show && (
        <div
          className={`p-2 rounded text-xs font-medium flex items-center gap-2 ${
            ehBanner.severity === 'alert'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {ehBanner.message}
        </div>
      )}

      {/* Harmonic root (if applicable) */}
      {signal.gannRoot && (
        <div className="text-xs text-muted">
          Harmonic root: <span className="font-semibold">{signal.gannRoot}</span>
        </div>
      )}

      {/* Levels */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 bg-muted rounded">
          <p className="text-muted text-xs">Entry</p>
          <p className="font-mono font-semibold">${signal.entry.toFixed(2)}</p>
        </div>
        <div className="p-2 bg-muted rounded">
          <p className="text-muted text-xs">Stop Loss</p>
          <p className="font-mono font-semibold text-red-600">${signal.stopLoss.toFixed(2)}</p>
        </div>
        <div className="p-2 bg-muted rounded">
          <p className="text-muted text-xs">TP1</p>
          <p className="font-mono font-semibold text-green-600">${signal.tp1.toFixed(2)}</p>
        </div>
        <div className="p-2 bg-muted rounded">
          <p className="text-muted text-xs">Final Target</p>
          <p className="font-mono font-semibold text-green-600">${signal.mtp.toFixed(2)}</p>
        </div>
      </div>

      {/* Higher-TF context */}
      {signal.higherTfSignals.length > 0 && (
        <div className="text-xs border-t border-border pt-2 mt-2">
          <p className="font-semibold mb-1.5 text-muted">Higher-TF Context:</p>
          <div className="space-y-1">
            {signal.higherTfSignals.map((htf, i) => (
              <div key={i} className="flex justify-between p-1.5 bg-muted rounded">
                <span>{htf.timeframe}</span>
                <span className="font-mono">
                  {htf.direction} {htf.score}/9
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <button
          onClick={onExecute}
          className="flex-1 px-3 py-2 bg-accent text-white text-xs font-semibold rounded hover:bg-accent/90 transition"
        >
          Execute
        </button>
        <button
          onClick={onIgnore}
          className="flex-1 px-3 py-2 bg-muted text-foreground text-xs font-semibold rounded hover:bg-muted/80 transition"
        >
          Ignore
        </button>
        <button
          onClick={onExplain}
          className="px-3 py-2 bg-muted text-foreground text-xs font-semibold rounded hover:bg-muted/80 transition"
          title="Show signal explanation"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Simplified explanation panel for novices
interface SignalExplanationProps {
  signal: SignalOverlay;
}

export function SignalExplanationPanel({ signal }: SignalExplanationProps) {
  const explanations = generateSignalExplanation(signal);

  return (
    <div className="p-4 rounded-lg border border-border bg-surface/50">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Info className="h-4 w-4 text-blue-600" />
        Why This Signal?
      </h3>
      <ul className="space-y-2">
        {explanations.map((bullet, i) => (
          <li key={i} className="text-sm text-foreground leading-relaxed flex gap-2">
            <span className="text-accent font-bold">•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
