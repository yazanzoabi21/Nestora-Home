/// <reference lib="webworker" />

import {
  DINO_DTYPE,
  DINO_EMBEDDING_DIMENSION,
  DINO_MODEL_ID,
  DINO_POOLING_STRATEGY,
} from '../config';
import {
  DinoRuntime,
  DinoWorkerRequest,
  DinoWorkerResponse,
  VisualSearchError,
  VisualSearchFailure,
} from '../models/dino-worker.model';
import { normalizeEmbedding } from '../utils/image-embedding.util';

import type {
  ImageFeatureExtractionPipeline,
  RawImage,
  Tensor,
} from '@huggingface/transformers';

type ModelProgressInfo =
  | { readonly status: 'initiate' | 'download' | 'done'; readonly file: string }
  | {
      readonly status: 'progress';
      readonly file: string;
      readonly progress: number;
      readonly loaded: number;
      readonly total: number;
    }
  | { readonly status: 'ready'; readonly task: string; readonly model: string };

interface ImagePipelineModule {
  readonly pipeline: (
    task: 'image-feature-extraction',
    model: string,
    options: {
      readonly dtype: typeof DINO_DTYPE;
      readonly device: DinoRuntime;
      readonly progress_callback: (info: ModelProgressInfo) => void;
    },
  ) => Promise<ImageFeatureExtractionPipeline>;
  readonly RawImage: { fromBlob(blob: Blob): Promise<RawImage> };
}

let extractor: ImageFeatureExtractionPipeline | null = null;
let runtime: DinoRuntime | null = null;
let modelPromise: Promise<void> | null = null;
let requestedRuntime: DinoRuntime = 'wasm';
let inferenceQueue = Promise.resolve();

function respond(message: DinoWorkerResponse): void {
  postMessage(message);
}

function progressValue(info: ModelProgressInfo): number | null {
  return info.status === 'progress' && Number.isFinite(info.progress)
    ? Math.max(0, Math.min(100, info.progress))
    : null;
}

async function createPipeline(device: DinoRuntime): Promise<ImageFeatureExtractionPipeline> {
  const transformers = (await import('@huggingface/transformers')) as unknown as ImagePipelineModule;
  return transformers.pipeline('image-feature-extraction', DINO_MODEL_ID, {
    dtype: DINO_DTYPE,
    device,
    progress_callback: (info: ModelProgressInfo) => {
      respond({ type: 'MODEL_PROGRESS', progress: progressValue(info) });
    },
  });
}

async function disposeExtractor(): Promise<void> {
  const current = extractor;
  extractor = null;
  runtime = null;
  if (current) await current.dispose();
}

function failure(
  code: VisualSearchFailure['code'],
  stage: VisualSearchFailure['stage'],
  error: unknown,
  activeRuntime = runtime ?? requestedRuntime,
): VisualSearchError {
  const originalError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return new VisualSearchError({
    code,
    stage,
    runtime: activeRuntime,
    message: originalError,
    originalError,
  }, { cause: error });
}

function modelFailureCode(
  targetRuntime: DinoRuntime,
  error: unknown,
): VisualSearchFailure['code'] {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('download') ||
    message.includes('404') ||
    message.includes('403')
  ) {
    return 'MODEL_DOWNLOAD_FAILED';
  }
  return targetRuntime === 'webgpu'
    ? 'WEBGPU_INITIALIZATION_FAILED'
    : 'WASM_INITIALIZATION_FAILED';
}

function toFailure(error: unknown): VisualSearchFailure {
  if (error instanceof VisualSearchError) return error.failure;
  return failure(
    'EMBEDDING_GENERATION_FAILED',
    'embedding-generation',
    error,
  ).failure;
}

async function loadModel(targetRuntime = requestedRuntime): Promise<void> {
  if (extractor && runtime) return;
  if (modelPromise) return modelPromise;

  requestedRuntime = targetRuntime;

  modelPromise = (async () => {
    try {
      extractor = await createPipeline(targetRuntime);
      runtime = targetRuntime;
      respond({ type: 'MODEL_READY', runtime });
    } catch (error: unknown) {
      await disposeExtractor();
      throw failure(
        modelFailureCode(targetRuntime, error),
        modelFailureCode(targetRuntime, error) === 'MODEL_DOWNLOAD_FAILED'
          ? 'model-download'
          : 'model-initialization',
        error,
        targetRuntime,
      );
    }
  })().catch((error: unknown) => {
    modelPromise = null;
    throw error;
  });

  return modelPromise;
}

function clsEmbedding(tensor: Tensor): number[] {
  const dimensions = tensor.dims;
  if (dimensions.length === 2 && dimensions[0] === 1 && dimensions[1] === DINO_EMBEDDING_DIMENSION) {
    return normalizeEmbedding(tensor.data as ArrayLike<number>);
  }
  if (
    dimensions.length === 3 &&
    dimensions[0] === 1 &&
    dimensions[1] >= 1 &&
    dimensions[2] === DINO_EMBEDDING_DIMENSION
  ) {
    return normalizeEmbedding(
      Array.from(tensor.data as ArrayLike<number>).slice(0, DINO_EMBEDDING_DIMENSION),
    );
  }
  throw failure(
    'INVALID_EMBEDDING_DIMENSION',
    'embedding-validation',
    new Error(`Unexpected ${DINO_POOLING_STRATEGY} tensor shape: [${dimensions.join(', ')}].`),
  );
}

async function generateEmbedding(requestId: string, image: Blob): Promise<void> {
  try {
    await loadModel();
    if (!extractor || !runtime) {
      throw failure('MODEL_INITIALIZATION_FAILED', 'model-initialization', new Error('Pipeline missing.'));
    }
    const transformers = (await import('@huggingface/transformers')) as unknown as ImagePipelineModule;
    let rawImage: RawImage;
    try {
      rawImage = await transformers.RawImage.fromBlob(image);
    } catch (error: unknown) {
      throw failure('IMAGE_DECODE_FAILED', 'image-decode', error);
    }

    let features: Tensor;
    try {
      features = await extractor(rawImage, { pool: false });
    } catch (error: unknown) {
      const failedRuntime = runtime;
      await disposeExtractor();
      modelPromise = null;
      throw failure('EMBEDDING_GENERATION_FAILED', 'embedding-generation', error, failedRuntime ?? requestedRuntime);
    }
    try {
      let embedding: number[];
      try {
        embedding = clsEmbedding(features);
      } catch (error: unknown) {
        if (error instanceof VisualSearchError) throw error;
        throw failure('INVALID_EMBEDDING_VALUES', 'embedding-validation', error);
      }
      respond({ type: 'EMBEDDING_RESULT', requestId, embedding, runtime });
    } finally {
      features.dispose();
    }
  } catch (error: unknown) {
    respond({
      type: 'ERROR',
      requestId,
      failure: toFailure(error),
    });
  }
}

addEventListener('message', (event: MessageEvent<DinoWorkerRequest>) => {
  const message = event.data;
  if (message.type === 'LOAD_MODEL') {
    requestedRuntime = message.runtime;
    void loadModel(message.runtime).catch((error: unknown) => {
      respond({
        type: 'ERROR',
        failure: toFailure(error),
      });
    });
    return;
  }

  inferenceQueue = inferenceQueue.then(() => generateEmbedding(message.requestId, message.image));
});
