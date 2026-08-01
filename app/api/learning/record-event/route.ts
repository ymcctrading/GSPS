// Recording endpoint for all learning brain events
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth';
import {
  recordScanEvent,
  recordSignalLifecycleEvent,
  recordExecutionEvent,
  recordUserAction,
} from '@/lib/learning/db';

const ScanEventSchema = z.object({
  type: z.literal('scan'),
  scan_id: z.string(),
  timestamp: z.coerce.date(),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w', '1mo', '1y']),
  extended_hours_flag: z.boolean(),
  symbol: z.string(),
  asset_class: z.enum(['us_equity', 'option', 'crypto', 'forex', 'futures', 'commodities']),
  price: z.number(),
  score: z.number().int().min(0).max(9),
  signal_type: z.enum(['bullish', 'bearish', 'none']),
  gann_root: z.enum(['3', '6', '9']).optional(),
  entry_level: z.number().optional(),
  stop_loss_level: z.number().optional(),
  take_profit_1_level: z.number().optional(),
  master_profit_level: z.number().optional(),
  bias: z.enum(['bull', 'bear', 'neutral']),
  ohlcv: z.object({
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
  }),
  higher_tf_context: z.array(z.object({
    timeframe: z.enum(['1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w', '1mo', '1y']),
    bias: z.enum(['bull', 'bear', 'neutral']),
    score: z.number().int().min(0).max(9),
  })).optional(),
  detail: z.record(z.unknown()).optional(),
});

const SignalLifecycleEventSchema = z.object({
  type: z.literal('signal_lifecycle'),
  signal_id: z.string(),
  scan_event_id: z.string().optional(),
  state: z.enum(['armed', 'active', 'confirmed', 'expired', 'invalidated']),
  state_transition_reason: z.string().optional(),
  timestamp: z.coerce.date(),
  metadata: z.record(z.unknown()).optional(),
});

const ExecutionEventSchema = z.object({
  type: z.literal('execution'),
  order_id: z.string().optional(),
  signal_id: z.string().optional(),
  broker: z.enum(['alpaca_paper', 'alpaca_live', 'snaptrade']),
  symbol: z.string(),
  asset_class: z.enum(['us_equity', 'option', 'crypto', 'forex', 'futures', 'commodities']),
  order_type: z.enum(['market', 'limit', 'stop', 'bracket']),
  side: z.enum(['buy', 'sell']),
  quantity: z.number(),
  requested_price: z.number().optional(),
  filled_price: z.number().optional(),
  filled_qty: z.number().optional(),
  partial_fill: z.boolean(),
  slippage: z.number().optional(),
  broker_status: z.enum(['pending', 'filled', 'partial', 'cancelled', 'rejected', 'error']),
  broker_error_code: z.string().optional(),
  broker_error_msg: z.string().optional(),
  order_idempotency_key: z.string().optional(),
  retry_count: z.number().int().min(0),
  timestamp: z.coerce.date(),
  latency_ms: z.number().optional(),
});

const UserActionSchema = z.object({
  type: z.literal('user_action'),
  signal_id: z.string(),
  scan_event_id: z.string().optional(),
  action: z.enum(['accept', 'ignore', 'defer', 'override']),
  tier: z.enum(['Passive', 'Modest', 'Aggressive']),
  risk_qty: z.number().optional(),
  risk_stop_pct: z.number().optional(),
  risk_r_multiple: z.number().optional(),
  override_entry: z.number().optional(),
  override_stop: z.number().optional(),
  override_tp1: z.number().optional(),
  override_master: z.number().optional(),
  journal_tags: z.array(z.string()).optional(),
  journal_notes: z.string().optional(),
  timestamp: z.coerce.date(),
});

const EventSchema = z.union([
  ScanEventSchema,
  SignalLifecycleEventSchema,
  ExecutionEventSchema,
  UserActionSchema,
]);

export async function POST(req: NextRequest) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const event = EventSchema.parse(body);

    let result;

    switch (event.type) {
      case 'scan': {
        const { ...scanData } = event;
        result = await recordScanEvent(userId, {
          ...scanData,
          gann_root: scanData.gann_root ? parseInt(scanData.gann_root) : undefined,
          higher_tf_context: scanData.higher_tf_context || [],
          detail: scanData.detail || {},
        });
        break;
      }

      case 'signal_lifecycle': {
        const { ...lifecycleData } = event;
        result = await recordSignalLifecycleEvent(userId, {
          ...lifecycleData,
          metadata: lifecycleData.metadata || {},
        });
        break;
      }

      case 'execution': {
        const { ...executionData } = event;
        result = await recordExecutionEvent(userId, executionData);
        break;
      }

      case 'user_action': {
        const { ...actionData } = event;
        result = await recordUserAction(userId, {
          ...actionData,
          journal_tags: actionData.journal_tags || [],
        });
        break;
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid event schema', details: error.errors },
        { status: 400 }
      );
    }

    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Learning event recording failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
