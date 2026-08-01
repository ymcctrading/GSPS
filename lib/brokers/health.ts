// §9: Broker health monitoring and resilience
import type { AssetClass } from '@/lib/learning/types';

export type BrokerProvider = 'alpaca_paper' | 'alpaca_live' | 'snaptrade';
export type BrokerHealth = 'healthy' | 'degraded' | 'failed';

export interface BrokerEndpointMetrics {
  endpoint: string;
  lastPingMs: number;
  successCount: number;
  errorCount: number;
  lastErrorCode?: string;
  lastErrorMsg?: string;
  lastError?: Date;
  latencyMs: number;
  consecutiveErrors: number;
}

export interface BrokerCapability {
  provider: BrokerProvider;
  supports: {
    equities: boolean;
    options: boolean;
    crypto: boolean;
    extendedHours: boolean;
    partialFills: boolean;
    idempotency: boolean; // broker supports idempotent requests
  };
}

export interface BrokerHealthStatus {
  provider: BrokerProvider;
  health: BrokerHealth;
  endpoints: BrokerEndpointMetrics[];
  capabilities: BrokerCapability;
  lastHealthCheckMs?: number;
  consecutiveErrors: number;
  shouldFailover: boolean;
  recommendation: string;
}

// In-memory health tracking (in production, use Redis or similar)
const brokerHealthCache = new Map<BrokerProvider, BrokerHealthStatus>();

// Broker capabilities matrix
const BROKER_CAPABILITIES: Record<BrokerProvider, BrokerCapability> = {
  alpaca_paper: {
    provider: 'alpaca_paper',
    supports: {
      equities: true,
      options: false,
      crypto: true,
      extendedHours: false,
      partialFills: true,
      idempotency: false, // Alpaca v2 API doesn't enforce idempotency natively
    },
  },
  alpaca_live: {
    provider: 'alpaca_live',
    supports: {
      equities: true,
      options: false,
      crypto: true,
      extendedHours: false,
      partialFills: true,
      idempotency: false,
    },
  },
  snaptrade: {
    provider: 'snaptrade',
    supports: {
      equities: true,
      options: true,
      crypto: false,
      extendedHours: true,
      partialFills: true,
      idempotency: true, // SnapTrade supports idempotent requests
    },
  },
};

export function getBrokerCapabilities(provider: BrokerProvider): BrokerCapability {
  return BROKER_CAPABILITIES[provider];
}

export function canBrokerSupport(provider: BrokerProvider, assetClass: AssetClass): boolean {
  const cap = getBrokerCapabilities(provider);
  switch (assetClass) {
    case 'us_equity':
      return cap.supports.equities;
    case 'option':
      return cap.supports.options;
    case 'crypto':
      return cap.supports.crypto;
    case 'forex':
      return false; // not supported by current brokers
    case 'futures':
      return false;
    case 'commodities':
      return false;
  }
}

export function canBrokerHandleExtendedHours(provider: BrokerProvider): boolean {
  return getBrokerCapabilities(provider).supports.extendedHours;
}

export function brokerSupportsIdempotency(provider: BrokerProvider): boolean {
  return getBrokerCapabilities(provider).supports.idempotency;
}

// Record endpoint metrics
export function recordEndpointCall(
  provider: BrokerProvider,
  endpoint: string,
  latencyMs: number,
  success: boolean,
  errorCode?: string,
  errorMsg?: string
) {
  let status = brokerHealthCache.get(provider);
  if (!status) {
    status = {
      provider,
      health: 'healthy',
      endpoints: [],
      capabilities: getBrokerCapabilities(provider),
      consecutiveErrors: 0,
      shouldFailover: false,
      recommendation: 'OK',
    };
    brokerHealthCache.set(provider, status);
  }

  let endpointMetrics = status.endpoints.find((e) => e.endpoint === endpoint);
  if (!endpointMetrics) {
    endpointMetrics = {
      endpoint,
      lastPingMs: Date.now(),
      successCount: 0,
      errorCount: 0,
      latencyMs: 0,
      consecutiveErrors: 0,
    };
    status.endpoints.push(endpointMetrics);
  }

  if (success) {
    endpointMetrics.successCount++;
    endpointMetrics.consecutiveErrors = 0;
    endpointMetrics.latencyMs = latencyMs;
  } else {
    endpointMetrics.errorCount++;
    endpointMetrics.consecutiveErrors++;
    endpointMetrics.lastErrorCode = errorCode;
    endpointMetrics.lastErrorMsg = errorMsg;
    endpointMetrics.lastError = new Date();
    status.consecutiveErrors++;
  }

  endpointMetrics.lastPingMs = Date.now();

  // Determine health status based on error patterns
  const errorRate = endpointMetrics.errorCount / (endpointMetrics.successCount + endpointMetrics.errorCount);
  if (endpointMetrics.consecutiveErrors >= 3) {
    status.health = 'failed';
    status.shouldFailover = true;
  } else if (errorRate > 0.2 || endpointMetrics.latencyMs > 5000) {
    status.health = 'degraded';
  } else {
    status.health = 'healthy';
  }

  // Update recommendation
  updateHealthRecommendation(status);

  brokerHealthCache.set(provider, status);
  return status;
}

function updateHealthRecommendation(status: BrokerHealthStatus) {
  if (status.health === 'healthy') {
    status.recommendation = 'OK — broker responsive';
  } else if (status.health === 'degraded') {
    status.recommendation = 'Degraded — higher latency or intermittent errors; consider alternate broker';
  } else {
    status.recommendation = 'Failed — broker unresponsive; failover to secondary broker if available';
  }
}

export function getBrokerHealthStatus(provider: BrokerProvider): BrokerHealthStatus | undefined {
  return brokerHealthCache.get(provider);
}

export function getAllBrokerHealthStatus(): BrokerHealthStatus[] {
  return Array.from(brokerHealthCache.values());
}

// Determine primary and secondary brokers for failover
export function getBrokerFailoverOrder(): BrokerProvider[] {
  const brokers = Array.from(brokerHealthCache.entries())
    .sort(([_, a], [__, b]) => {
      const aScore = a.health === 'healthy' ? 0 : a.health === 'degraded' ? 1 : 2;
      const bScore = b.health === 'healthy' ? 0 : b.health === 'degraded' ? 1 : 2;
      return aScore - bScore;
    })
    .map(([provider]) => provider);

  return brokers.length > 0 ? brokers : ['alpaca_paper'];
}

// Check if should attempt failover
export function shouldAttemptFailover(provider: BrokerProvider): boolean {
  const status = getBrokerHealthStatus(provider);
  return status ? status.shouldFailover : false;
}

// Clear error state after recovery
export function resetBrokerErrors(provider: BrokerProvider) {
  const status = brokerHealthCache.get(provider);
  if (status) {
    status.health = 'healthy';
    status.shouldFailover = false;
    status.consecutiveErrors = 0;
    status.recommendation = 'OK';
    for (const endpoint of status.endpoints) {
      endpoint.consecutiveErrors = 0;
    }
    brokerHealthCache.set(provider, status);
  }
}
