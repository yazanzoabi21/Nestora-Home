import type { AppRealtimeChannel, AppRealtimeFilter, AppRealtimePayload } from '../../models/auth/browser-auth.models';
import { BffApi } from './bff-api';

export class BffRealtimeChannel implements AppRealtimeChannel {
  private readonly listeners: { filter: AppRealtimeFilter; callback: (payload: AppRealtimePayload) => void }[] = [];
  private stream: EventSource | null = null;
  private closed = false;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private retryMs = 1000;

  constructor(private readonly api: BffApi) {}
  on(_type: 'postgres_changes', filter: AppRealtimeFilter, callback: (payload: AppRealtimePayload) => void): this {
    this.listeners.push({ filter, callback });
    return this;
  }
  subscribe(): this { void this.open(); return this; }
  private async open(): Promise<void> {
    if (this.closed || typeof EventSource === 'undefined') return;
    try {
      const { id } = await this.api.json<{ id: string }>('realtime', { changes: this.listeners.map(({ filter }) => filter) });
      if (this.closed) return;
      const stream = new EventSource(`/api/${this.api.audience}/realtime/${encodeURIComponent(id)}`);
      this.stream = stream;
      stream.onopen = () => { this.retryMs = 1000; };
      stream.onmessage = (event: MessageEvent<string>) => {
        if (this.closed) return;
        try {
          const data = JSON.parse(event.data) as { index: number; payload: AppRealtimePayload };
          this.listeners[data.index]?.callback(data.payload);
        } catch { /* Ignore malformed upstream frames. */ }
      };
      stream.onerror = () => { stream.close(); this.retry(); };
    } catch { this.retry(); }
  }
  private retry(): void {
    if (this.closed || this.reconnect) return;
    this.reconnect = setTimeout(() => { this.reconnect = null; void this.open(); }, this.retryMs);
    this.retryMs = Math.min(30_000, this.retryMs * 2);
  }
  async unsubscribe(): Promise<string> {
    this.closed = true;
    this.stream?.close();
    if (this.reconnect) clearTimeout(this.reconnect);
    return 'ok';
  }
}
