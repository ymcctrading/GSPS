// Learning Brain database access layer
import { createClient } from '@supabase/supabase-js';
import type {
  ScanEvent,
  SignalLifecycleEvent,
  ExecutionEvent,
  UserAction,
  LearningModel,
  LearningCoefficient,
  AssetClass,
  PivotFeature,
  TrendStateFeature,
  DigitalRootFeature,
  BarRow,
  InstrumentProfileRow,
  VolumeStateFeature,
  VolatilityStateFeature,
} from './types';

export function createLearningClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function recordScanEvent(userId: string, event: Omit<ScanEvent, 'user_id'>) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('scan_events')
    .insert([{ user_id: userId, ...event }])
    .select()
    .single();

  if (error) throw new Error(`Failed to record scan event: ${error.message}`);
  return data;
}

export async function recordSignalLifecycleEvent(
  userId: string,
  event: Omit<SignalLifecycleEvent, 'user_id'>
) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('signal_lifecycle_events')
    .insert([{ user_id: userId, ...event }])
    .select()
    .single();

  if (error) throw new Error(`Failed to record signal lifecycle event: ${error.message}`);
  return data;
}

export async function recordExecutionEvent(userId: string, event: Omit<ExecutionEvent, 'user_id'>) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('execution_events')
    .insert([{ user_id: userId, ...event }])
    .select()
    .single();

  if (error) throw new Error(`Failed to record execution event: ${error.message}`);
  return data;
}

/**
 * The `instrument` dimension table (migration 0063) is global reference
 * data, not per-user, so this returns just the row's id rather than a
 * user-scoped record. `upsert` on the (symbol, asset_class) unique
 * constraint makes this idempotent — repeat scans of the same symbol never
 * duplicate the row, and a second call with the same pair is a no-op merge
 * rather than a conflict.
 */
export async function upsertInstrument(symbol: string, assetClass: AssetClass): Promise<string | undefined> {
  const client = createLearningClient();
  const { data, error } = await client
    .from('instrument')
    .upsert([{ symbol, asset_class: assetClass }], { onConflict: 'symbol,asset_class' })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to upsert instrument: ${error.message}`);
  return (data as { id?: string } | null)?.id;
}

export async function recordPivot(userId: string, pivot: Omit<PivotFeature, 'user_id'>) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('pivot')
    .insert([{ user_id: userId, ...pivot }])
    .select()
    .single();

  if (error) throw new Error(`Failed to record pivot: ${error.message}`);
  return data;
}

export async function recordTrendState(userId: string, state: Omit<TrendStateFeature, 'user_id'>) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('trend_state')
    .insert([{ user_id: userId, ...state }])
    .select()
    .single();

  if (error) throw new Error(`Failed to record trend state: ${error.message}`);
  return data;
}

export async function recordDigitalRootFeature(
  userId: string,
  feature: Omit<DigitalRootFeature, 'user_id'>,
) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('digital_root_feature')
    .insert([{ user_id: userId, ...feature }])
    .select()
    .single();

  if (error) throw new Error(`Failed to record GSPS Signal Calculation feature: ${error.message}`);
  return data;
}

/**
 * `bar` (migration 0064) — global OHLCV cache, not per-user. Upsert on the
 * (instrument_id, timeframe, bar_time) unique constraint with
 * `ignoreDuplicates` so a symbol scanned by many users, or repeatedly by the
 * same one, only ever inserts a bar's row once — never re-writes it. This
 * batch never trims what a scan already fetched; a large `dailyBars` window
 * is bounded by the same MIN_DAILY_BARS-to-lookback range the scan itself
 * already reads.
 */
export async function upsertBars(bars: Omit<BarRow, never>[]): Promise<void> {
  if (bars.length === 0) return;
  const client = createLearningClient();
  const { error } = await client
    .from('bar')
    .upsert(bars, { onConflict: 'instrument_id,timeframe,bar_time', ignoreDuplicates: true });

  if (error) throw new Error(`Failed to upsert bars: ${error.message}`);
}

/**
 * `instrument_profile` (migration 0064) — global, one row per instrument.
 * Upsert-merge on `instrument_id` so a later scan's fresher read (e.g. a
 * recomputed average dollar volume) replaces the prior one rather than
 * being refused as a duplicate.
 */
export async function upsertInstrumentProfile(profile: InstrumentProfileRow): Promise<void> {
  const client = createLearningClient();
  const { error } = await client
    .from('instrument_profile')
    .upsert([{ ...profile, updated_at: new Date() }], { onConflict: 'instrument_id' });

  if (error) throw new Error(`Failed to upsert instrument profile: ${error.message}`);
}

export async function recordVolumeState(userId: string, state: Omit<VolumeStateFeature, 'user_id'>) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('volume_state')
    .insert([{ user_id: userId, ...state }])
    .select()
    .single();

  if (error) throw new Error(`Failed to record volume state: ${error.message}`);
  return data;
}

export async function recordVolatilityState(userId: string, state: Omit<VolatilityStateFeature, 'user_id'>) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('volatility_state')
    .insert([{ user_id: userId, ...state }])
    .select()
    .single();

  if (error) throw new Error(`Failed to record volatility state: ${error.message}`);
  return data;
}

export async function recordUserAction(userId: string, action: Omit<UserAction, 'user_id'>) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('user_actions')
    .insert([{ user_id: userId, ...action }])
    .select()
    .single();

  if (error) throw new Error(`Failed to record user action: ${error.message}`);
  return data;
}

export async function getScanEventsByUser(userId: string, limit = 100) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('scan_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch scan events: ${error.message}`);
  return data as ScanEvent[];
}

export async function getSignalLifecycle(signalId: string) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('signal_lifecycle_events')
    .select('*')
    .eq('signal_id', signalId)
    .order('timestamp', { ascending: true });

  if (error) throw new Error(`Failed to fetch signal lifecycle: ${error.message}`);
  return data as SignalLifecycleEvent[];
}

export async function getExecutionEventsByOrder(orderId: string) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('execution_events')
    .select('*')
    .eq('order_id', orderId)
    .order('timestamp', { ascending: true });

  if (error) throw new Error(`Failed to fetch execution events: ${error.message}`);
  return data as ExecutionEvent[];
}

export async function getLearningModel(modelType: string, version: number) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('learning_models')
    .select('*')
    .eq('model_type', modelType)
    .eq('version', version)
    .single();

  if (error) throw new Error(`Failed to fetch learning model: ${error.message}`);
  return data as LearningModel;
}

export async function getLiveModel(modelType: string) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('learning_models')
    .select('*')
    .eq('model_type', modelType)
    .eq('status', 'live')
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) throw new Error(`Failed to fetch live model: ${error.message}`);
  return data as LearningModel;
}

export async function getCoefficients(modelId: string) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('learning_coefficients')
    .select('*')
    .eq('model_id', modelId);

  if (error) throw new Error(`Failed to fetch coefficients: ${error.message}`);
  return data as LearningCoefficient[];
}

export async function createModel(model: Omit<LearningModel, 'id' | 'created_at'>) {
  const client = createLearningClient();
  // Without .select() an insert resolves with data: null, so the old cast
  // handed every caller `undefined` while claiming to return the new model.
  const { data, error } = await client
    .from('learning_models')
    .insert([model])
    .select()
    .single();

  if (error) throw new Error(`Failed to create learning model: ${error.message}`);
  return data as LearningModel;
}

export async function updateModelStatus(
  modelId: string,
  status: 'draft' | 'approved' | 'live' | 'deprecated',
  approvedBy?: string
) {
  const client = createLearningClient();
  const updates: Record<string, unknown> = { status };
  if (status === 'approved') {
    updates.approved_at = new Date();
    updates.approved_by = approvedBy;
  }
  if (status === 'deprecated') {
    updates.deprecated_at = new Date();
  }

  const { data, error } = await client
    .from('learning_models')
    .update(updates)
    .eq('id', modelId)
    .select();

  if (error) throw new Error(`Failed to update model status: ${error.message}`);
  return data?.[0] as LearningModel;
}

export async function auditLogEntry(
  modelId: string,
  eventType: string,
  changedBy: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>,
  reason?: string
) {
  const client = createLearningClient();
  const { error } = await client.from('learning_audit_log').insert([
    {
      model_id: modelId,
      event_type: eventType,
      old_value: oldValue,
      new_value: newValue,
      changed_by: changedBy,
      reason,
      timestamp: new Date(),
    },
  ]);

  if (error) throw new Error(`Failed to create audit log: ${error.message}`);
}
