export interface ProxyMetricsSnapshot {
  activeConnections: number;
  totalRequests: number;
  totalWsConnections: number;
  status5xx: number;
  originErrors: number;
  latencyMsBuckets: Record<string, number>;
}

const kLatencyBucketsMs = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export class ProxyMetrics {
  activeConnections = 0;
  totalRequests = 0;
  totalWsConnections = 0;
  status5xx = 0;
  originErrors = 0;
  private readonly latencyMsBuckets: Record<string, number> = Object.fromEntries(
    [...kLatencyBucketsMs.map(String), 'inf'].map(k => [k, 0]),
  );

  onRequestStart() {
    this.activeConnections += 1;
    this.totalRequests += 1;
  }

  onRequestEnd(statusCode: number, durationMs: number) {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
    if (statusCode >= 500) {
      this.status5xx += 1;
    }
    this.recordLatency(durationMs);
  }

  onWsStart() {
    this.totalWsConnections += 1;
    this.activeConnections += 1;
  }

  onWsEnd() {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  onOriginError() {
    this.originErrors += 1;
  }

  private recordLatency(durationMs: number) {
    for (const bucket of kLatencyBucketsMs) {
      if (durationMs <= bucket) {
        this.latencyMsBuckets[String(bucket)] += 1;
        return;
      }
    }
    this.latencyMsBuckets.inf += 1;
  }

  snapshot(): ProxyMetricsSnapshot {
    return {
      activeConnections: this.activeConnections,
      totalRequests: this.totalRequests,
      totalWsConnections: this.totalWsConnections,
      status5xx: this.status5xx,
      originErrors: this.originErrors,
      latencyMsBuckets: {...this.latencyMsBuckets},
    };
  }
}
