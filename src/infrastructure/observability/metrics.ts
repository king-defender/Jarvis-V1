export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly timings = new Map<string, number[]>();

  incr(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  timing(name: string, ms: number): void {
    const arr = this.timings.get(name) ?? [];
    arr.push(ms);
    if (arr.length > 200) arr.shift();
    this.timings.set(name, arr);
  }

  snapshot(): Record<string, unknown> {
    const timings: Record<string, { count: number; avgMs: number }> = {};
    for (const [name, values] of this.timings) {
      const avg = values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
      timings[name] = { count: values.length, avgMs: Math.round(avg) };
    }
    return {
      counters: Object.fromEntries(this.counters),
      timings,
    };
  }
}

export class TracingService {
  private readonly spans: Array<Record<string, unknown>> = [];

  start(name: string, attrs: Record<string, unknown> = {}): string {
    const id = crypto.randomUUID();
    this.spans.push({
      id,
      name,
      attrs,
      startedAt: new Date().toISOString(),
    });
    if (this.spans.length > 500) this.spans.shift();
    return id;
  }

  end(id: string, attrs: Record<string, unknown> = {}): void {
    const span = this.spans.find((s) => s.id === id);
    if (span) {
      span.endedAt = new Date().toISOString();
      span.endAttrs = attrs;
    }
  }

  recent(limit = 20): Record<string, unknown>[] {
    return this.spans.slice(-limit);
  }
}
