// Learning Brain database access layer
import { createClient } from '@supabase/supabase-js';
import type {
  ScanEvent,
  SignalLifecycleEvent,
  ExecutionEvent,
  UserAction,
  LearningModel,
  LearningCoefficient,
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
    .insert([{ user_id: userId, ...event }]);

  if (error) throw new Error(`Failed to record scan event: ${error.message}`);
  return data?.[0];
}

export async function recordSignalLifecycleEvent(
  userId: string,
  event: Omit<SignalLifecycleEvent, 'user_id'>
) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('signal_lifecycle_events')
    .insert([{ user_id: userId, ...event }]);

  if (error) throw new Error(`Failed to record signal lifecycle event: ${error.message}`);
  return data?.[0];
}

export async function recordExecutionEvent(userId: string, event: Omit<ExecutionEvent, 'user_id'>) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('execution_events')
    .insert([{ user_id: userId, ...event }]);

  if (error) throw new Error(`Failed to record execution event: ${error.message}`);
  return data?.[0];
}

export async function recordUserAction(userId: string, action: Omit<UserAction, 'user_id'>) {
  const client = createLearningClient();
  const { data, error } = await client
    .from('user_actions')
    .insert([{ user_id: userId, ...action }]);

  if (error) throw new Error(`Failed to record user action: ${error.message}`);
  return data?.[0];
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
