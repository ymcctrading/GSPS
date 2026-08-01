// §9: Broker status transparency component
'use client';

import { AlertCircle, CheckCircle, Zap, RotateCw } from 'lucide-react';
import type { BrokerHealthStatus, BrokerProvider } from '@/lib/brokers/health';
import { getAllBrokerHealthStatus, resetBrokerErrors } from '@/lib/brokers/health';
import { useCallback, useEffect, useState } from 'react';

export function BrokerStatusPanel() {
  const [brokerStatuses, setBrokerStatuses] = useState<BrokerHealthStatus[]>([]);

  const refreshStatuses = useCallback(() => {
    const statuses = getAllBrokerHealthStatus();
    setBrokerStatuses(statuses);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshStatuses();
    const interval = setInterval(() => {
      refreshStatuses();
    }, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [refreshStatuses]);

  const handleReset = (provider: string) => {
    resetBrokerErrors(provider as BrokerProvider);
    refreshStatuses();
  };

  if (brokerStatuses.length === 0) {
    return (
      <div className="text-xs text-muted">
        Broker health: Initializing...
      </div>
    );
  }

  const allHealthy = brokerStatuses.every((s) => s.health === 'healthy');
  const anyFailed = brokerStatuses.some((s) => s.health === 'failed');

  return (
    <div className={`p-3 rounded-lg border ${
      allHealthy
        ? 'border-green-200 bg-green-50'
        : anyFailed
        ? 'border-red-200 bg-red-50'
        : 'border-yellow-200 bg-yellow-50'
    }`}>
      {/* Summary */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {allHealthy ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : anyFailed ? (
            <AlertCircle className="h-4 w-4 text-red-600" />
          ) : (
            <Zap className="h-4 w-4 text-yellow-600" />
          )}
          <span className="text-xs font-semibold">
            {allHealthy ? 'All brokers healthy' : anyFailed ? 'Broker issues detected' : 'Degraded performance'}
          </span>
        </div>
        <button
          onClick={refreshStatuses}
          className="text-xs font-medium hover:underline"
        >
          <RotateCw className="h-3 w-3 inline mr-1" />
          Refresh
        </button>
      </div>

      {/* Individual broker status */}
      <div className="space-y-2">
        {brokerStatuses.map((status) => (
          <div key={status.provider} className="p-2 bg-white rounded border border-gray-200">
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    status.health === 'healthy'
                      ? 'bg-green-600'
                      : status.health === 'degraded'
                      ? 'bg-yellow-600'
                      : 'bg-red-600'
                  }`}
                />
                <span className="text-xs font-semibold">{status.provider}</span>
              </div>
              <span className={`text-xs font-medium ${
                status.health === 'healthy'
                  ? 'text-green-700'
                  : status.health === 'degraded'
                  ? 'text-yellow-700'
                  : 'text-red-700'
              }`}>
                {status.health}
              </span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-1 mb-2 text-xs">
              {status.endpoints.length > 0 && (
                <>
                  <div>
                    <span className="text-gray-600">Success:</span>
                    <span className="font-mono ml-1">
                      {status.endpoints.reduce((sum, e) => sum + e.successCount, 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Errors:</span>
                    <span className="font-mono ml-1 text-red-600">
                      {status.endpoints.reduce((sum, e) => sum + e.errorCount, 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Latency:</span>
                    <span className="font-mono ml-1">
                      {Math.max(...status.endpoints.map((e) => e.latencyMs))}ms
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Fails:</span>
                    <span className="font-mono ml-1">
                      {status.consecutiveErrors}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Recommendation */}
            <p className="text-xs text-gray-700 mb-2 italic">
              {status.recommendation}
            </p>

            {/* Last error */}
            {status.endpoints.some((e) => e.lastError) && (
              <div className="mb-2 text-xs bg-red-50 p-1.5 rounded border border-red-200">
                <p className="font-mono text-red-700">
                  {status.endpoints.find((e) => e.lastError)?.lastErrorCode}:{' '}
                  {status.endpoints.find((e) => e.lastError)?.lastErrorMsg}
                </p>
              </div>
            )}

            {/* Reset button for failed brokers */}
            {status.health !== 'healthy' && (
              <button
                onClick={() => handleReset(status.provider)}
                className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                Clear Errors
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Capability matrix */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-xs font-semibold mb-2">Broker Capabilities:</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {brokerStatuses.map((status) => (
            <div key={`cap-${status.provider}`} className="text-gray-700">
              <p className="font-medium">{status.provider}:</p>
              <ul className="text-gray-600 ml-2">
                {status.capabilities.supports.equities && <li>• Equities</li>}
                {status.capabilities.supports.options && <li>• Options</li>}
                {status.capabilities.supports.crypto && <li>• Crypto</li>}
                {status.capabilities.supports.extendedHours && <li>• Pre/Post</li>}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
