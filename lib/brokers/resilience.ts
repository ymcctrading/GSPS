// §9: Retry strategy and error recovery patterns
import type { BrokerProvider } from './health';

export type ErrorCategory = 'transient' | 'hard_failure' | 'rate_limit' | 'network';

export interface BrokerError {
  code: string;
  message: string;
  category: ErrorCategory;
  retryable: boolean;
  statusCode?: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number; // 0-1: random factor added to backoff
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

// Categorize broker errors
export function categorizeError(statusCode?: number, errorCode?: string): BrokerError {
  if (!statusCode && !errorCode) {
    return {
      code: 'UNKNOWN',
      message: 'Unknown error',
      category: 'transient',
      retryable: true,
    };
  }

  // HTTP status codes
  if (statusCode === 429) {
    return {
      code: 'RATE_LIMIT',
      message: 'Rate limit exceeded',
      category: 'rate_limit',
      retryable: true,
      statusCode,
    };
  }

  if (statusCode === 503 || statusCode === 502 || statusCode === 504) {
    return {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Broker service temporarily unavailable',
      category: 'transient',
      retryable: true,
      statusCode,
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: 'AUTH_FAILED',
      message: 'Authentication or authorization failed',
      category: 'hard_failure',
      retryable: false,
      statusCode,
    };
  }

  if (statusCode === 400 || statusCode === 422) {
    return {
      code: 'INVALID_REQUEST',
      message: 'Invalid request parameters',
      category: 'hard_failure',
      retryable: false,
      statusCode,
    };
  }

  // Alpaca-specific error codes
  if (errorCode === 'INSUFFICIENT_BUYING_POWER') {
    return {
      code: 'INSUFFICIENT_BUYING_POWER',
      message: 'Account has insufficient buying power',
      category: 'hard_failure',
      retryable: false,
    };
  }

  if (errorCode === 'INVALID_ACCOUNT_STATUS') {
    return {
      code: 'INVALID_ACCOUNT_STATUS',
      message: 'Account status does not allow trading',
      category: 'hard_failure',
      retryable: false,
    };
  }

  if (errorCode === 'SYMBOL_NOT_TRADABLE') {
    return {
      code: 'SYMBOL_NOT_TRADABLE',
      message: 'Symbol not tradable on this broker',
      category: 'hard_failure',
      retryable: false,
    };
  }

  // Network errors
  if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT') {
    return {
      code: errorCode,
      message: 'Network error',
      category: 'network',
      retryable: true,
    };
  }

  // Default to transient
  return {
    code: errorCode || 'ERROR',
    message: 'Broker error',
    category: 'transient',
    retryable: true,
  };
}

// Calculate exponential backoff delay
export function calculateBackoffDelay(
  attemptNumber: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptNumber - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = cappedDelay * config.jitterFactor * Math.random();
  return Math.floor(cappedDelay + jitter);
}

// Retry function with exponential backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const brokerError = categorizeError(undefined, lastError.message);

      if (!brokerError.retryable || attempt === config.maxRetries) {
        throw lastError;
      }

      const delayMs = calculateBackoffDelay(attempt, config);
      onRetry?.(attempt, lastError, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// Partial fill handling
export interface PartialFillDecision {
  action: 'wait_for_full' | 'accept_partial' | 'cancel';
  reason: string;
  adjustmentFactor?: number; // adjust TP/SL by this multiplier
}

export function decidePartialFillAction(
  filledQty: number,
  requestedQty: number,
  tier: 'Passive' | 'Modest' | 'Aggressive'
): PartialFillDecision {
  const fillRatio = filledQty / requestedQty;

  if (fillRatio >= 0.95) {
    // essentially full
    return { action: 'accept_partial', reason: 'Near-full fill' };
  }

  if (tier === 'Passive') {
    return {
      action: 'wait_for_full',
      reason: 'Passive tier: waiting for full fill (timeout: 5 min)',
    };
  }

  if (tier === 'Modest') {
    if (fillRatio >= 0.75) {
      return {
        action: 'accept_partial',
        reason: 'Modest tier: accepting 75%+ fill',
        adjustmentFactor: 1.0,
      };
    }
    return { action: 'wait_for_full', reason: 'Modest tier: fill below 75%, waiting' };
  }

  // Aggressive
  if (fillRatio >= 0.5) {
    return {
      action: 'accept_partial',
      reason: 'Aggressive tier: accepting 50%+ fill',
      adjustmentFactor: fillRatio, // scale targets proportionally
    };
  }

  return { action: 'cancel', reason: 'Fill too small; canceling' };
}

// Order queue for offline/failover scenarios
export interface QueuedOrder {
  id: string;
  idempotency_key: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  order_type: 'market' | 'limit' | 'stop';
  limit_price?: number;
  stop_price?: number;
  queued_at: Date;
  attempts: number;
  last_error?: string;
}

export class OrderQueue {
  private orders: Map<string, QueuedOrder> = new Map();

  enqueue(order: Omit<QueuedOrder, 'queued_at' | 'attempts'>): QueuedOrder {
    const queuedOrder: QueuedOrder = {
      ...order,
      queued_at: new Date(),
      attempts: 0,
    };
    this.orders.set(order.id, queuedOrder);
    return queuedOrder;
  }

  dequeue(): QueuedOrder | undefined {
    const order = this.orders.values().next().value;
    if (order) {
      this.orders.delete(order.id);
    }
    return order;
  }

  peekAll(): QueuedOrder[] {
    return Array.from(this.orders.values());
  }

  markAttempt(id: string, error?: string) {
    const order = this.orders.get(id);
    if (order) {
      order.attempts++;
      order.last_error = error;
      if (order.attempts > 10) {
        // hard stop after 10 attempts
        this.orders.delete(id);
      }
    }
  }

  remove(id: string) {
    this.orders.delete(id);
  }

  size(): number {
    return this.orders.size;
  }
}

// Global order queue instance
export const globalOrderQueue = new OrderQueue();
