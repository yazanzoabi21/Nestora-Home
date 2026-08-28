import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, inject, isDevMode, signal } from '@angular/core';

import {
  DinoRuntimeState,
  DinoWorkerRequest,
  DinoWorkerResponse,
  VisualSearchError,
  VisualSearchFailure,
} from '../models/dino-worker.model';

interface PendingEmbedding {
  readonly resolve: (embedding: number[]) => void;
  readonly reject: (error: Error) => void;
  readonly image: Blob;
}

@Injectable({ providedIn: 'root' })
export class DinoImageEmbeddingService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly pending = new Map<string, PendingEmbedding>();
  private worker: Worker | null = null;
  private runtime: 'webgpu' | 'wasm' = 'wasm';

  readonly state = signal<DinoRuntimeState>('idle');
  readonly progress = signal<number | null>(null);

  prepare(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.state() !== 'idle' && this.state() !== 'error') return;
    if (this.state() === 'error') this.destroyWorker();
    this.runtime = this.canAttemptWebGpu() ? 'webgpu' : 'wasm';
    this.ensureWorker();
    this.state.set('loading');
    this.post({ type: 'LOAD_MODEL', runtime: this.runtime });
    this.log('[VisualSearch] loading DINO', { runtime: this.runtime });
  }

  async generateEmbedding(image: Blob): Promise<number[]> {
    if (!isPlatformBrowser(this.platformId)) throw new Error('Visual search requires a browser.');
    if (!this.worker || this.state() === 'error') this.prepare();
    this.ensureWorker();
    const requestId = crypto.randomUUID();
    this.state.set('processing');

    return new Promise<number[]>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, image });
      this.post({ type: 'GENERATE_EMBEDDING', requestId, image });
    });
  }

  cancel(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    pending.reject(new Error('Image analysis was cancelled.'));
    this.pending.delete(requestId);
  }

  ngOnDestroy(): void {
    this.destroyWorker();
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Visual search was closed.'));
    }
    this.pending.clear();
  }

  private ensureWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(new URL('../workers/dino-image-embedding.worker', import.meta.url), {
      type: 'module',
    });
    this.worker.addEventListener('message', (event: MessageEvent<DinoWorkerResponse>) => {
      this.handleResponse(event.data);
    });
    this.worker.addEventListener('error', () => {
      this.state.set('error');
      const error = new VisualSearchError({
        code: 'MODEL_INITIALIZATION_FAILED',
        stage: 'worker',
        message: 'Unable to start visual search worker.',
        runtime: this.runtime,
      });
      this.logFailure(error.failure);
      this.rejectAll(error);
    });
    this.log('[VisualSearch] worker created', { runtime: this.runtime });
  }

  private post(message: DinoWorkerRequest): void {
    this.worker?.postMessage(message);
  }

  private handleResponse(message: DinoWorkerResponse): void {
    switch (message.type) {
      case 'MODEL_PROGRESS':
        this.progress.set(message.progress);
        break;
      case 'MODEL_READY':
        this.progress.set(100);
        this.state.set(message.runtime === 'webgpu' ? 'ready-webgpu' : 'ready-wasm');
        this.log(`[VisualSearch] model ready: ${message.runtime}`, { runtime: message.runtime });
        break;
      case 'EMBEDDING_RESULT': {
        const pending = this.pending.get(message.requestId);
        if (!pending) return;
        this.pending.delete(message.requestId);
        pending.resolve(message.embedding);
        this.state.set(message.runtime === 'webgpu' ? 'ready-webgpu' : 'ready-wasm');
        this.log('[VisualSearch] embedding generated dimension=384', {
          requestId: message.requestId,
          runtime: message.runtime,
          dimension: message.embedding.length,
        });
        break;
      }
      case 'ERROR': {
        this.logFailure(message.failure, message.requestId);
        if (message.failure.runtime === 'webgpu' && this.runtime === 'webgpu') {
          this.fallbackToWasm();
          return;
        }
        const error = new VisualSearchError(message.failure);
        if (message.requestId) {
          const pending = this.pending.get(message.requestId);
          this.pending.delete(message.requestId);
          pending?.reject(error);
        } else {
          this.rejectAll(error);
        }
        this.state.set('error');
        break;
      }
    }
  }

  private fallbackToWasm(): void {
    this.log('[VisualSearch] WebGPU failed → trying WASM', { runtime: 'webgpu' });
    this.destroyWorker();
    this.runtime = 'wasm';
    this.state.set('loading');
    this.ensureWorker();
    this.post({ type: 'LOAD_MODEL', runtime: 'wasm' });
    for (const [requestId, pending] of this.pending) {
      this.post({ type: 'GENERATE_EMBEDDING', requestId, image: pending.image });
    }
  }

  private canAttemptWebGpu(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  }

  private destroyWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private log(message: string, details: Record<string, unknown>): void {
    if (isDevMode()) console.info(message, details);
  }

  private logFailure(failure: VisualSearchFailure, requestId?: string): void {
    if (!isDevMode()) return;
    console.error('[VisualSearch] failure', {
      stage: failure.stage,
      code: failure.code,
      originalError: failure.originalError ?? failure.message,
      requestId,
      runtime: failure.runtime,
    });
  }
}
