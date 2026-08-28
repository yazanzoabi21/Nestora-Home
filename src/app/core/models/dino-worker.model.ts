export type DinoRuntime = 'webgpu' | 'wasm';

export type VisualSearchErrorCode =
  | 'MODEL_DOWNLOAD_FAILED'
  | 'MODEL_INITIALIZATION_FAILED'
  | 'WEBGPU_INITIALIZATION_FAILED'
  | 'WASM_INITIALIZATION_FAILED'
  | 'IMAGE_DECODE_FAILED'
  | 'IMAGE_PREPROCESS_FAILED'
  | 'EMBEDDING_GENERATION_FAILED'
  | 'INVALID_EMBEDDING_DIMENSION'
  | 'INVALID_EMBEDDING_VALUES'
  | 'RPC_FAILED'
  | 'NO_INDEXED_PRODUCTS'
  | 'NO_MATCHES'
  | 'PRODUCT_FETCH_FAILED';

export type VisualSearchFailureStage =
  | 'worker'
  | 'model-download'
  | 'model-initialization'
  | 'image-decode'
  | 'image-preprocess'
  | 'embedding-generation'
  | 'embedding-validation'
  | 'rpc'
  | 'index-status'
  | 'product-fetch';

export interface VisualSearchFailure {
  readonly code: VisualSearchErrorCode;
  readonly stage: VisualSearchFailureStage;
  readonly message: string;
  readonly runtime?: DinoRuntime;
  readonly originalError?: string;
}

export class VisualSearchError extends Error {
  constructor(
    readonly failure: VisualSearchFailure,
    options?: ErrorOptions,
  ) {
    super(failure.message, options);
    this.name = 'VisualSearchError';
  }
}

export type DinoWorkerRequest =
  | { readonly type: 'LOAD_MODEL'; readonly runtime: DinoRuntime }
  | {
      readonly type: 'GENERATE_EMBEDDING';
      readonly requestId: string;
      readonly image: Blob;
    };

export type DinoWorkerResponse =
  | {
      readonly type: 'MODEL_PROGRESS';
      readonly progress: number | null;
    }
  | { readonly type: 'MODEL_READY'; readonly runtime: DinoRuntime }
  | {
      readonly type: 'EMBEDDING_RESULT';
      readonly requestId: string;
      readonly embedding: number[];
      readonly runtime: DinoRuntime;
    }
  | {
      readonly type: 'ERROR';
      readonly requestId?: string;
      readonly failure: VisualSearchFailure;
    };

export type DinoRuntimeState =
  | 'idle'
  | 'loading'
  | 'ready-webgpu'
  | 'ready-wasm'
  | 'processing'
  | 'error';
