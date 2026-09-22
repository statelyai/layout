import type {
  ELK as ElkInterface,
  ELKConstructorArguments,
  ElkLayoutAlgorithmDescription,
  ElkLayoutArguments,
  ElkLayoutCategoryDescription,
  ElkLayoutOptionDescription,
  ElkNode,
  LaidOutElkNode,
  LayoutOptions,
} from "./public-types";

interface WorkerRequest {
  id?: number;
  cmd: "register" | "layout" | "algorithms" | "options" | "categories";
  algorithms?: string[];
  graph?: ElkNode;
  layoutOptions?: LayoutOptions;
  options?: Pick<ElkLayoutArguments, "logging" | "measureExecutionTime">;
}

interface WorkerAnswer {
  id: number;
  data?: unknown;
  error?: unknown;
}

interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerAnswer>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}

class PromisedWorker {
  readonly #worker: WorkerLike;
  readonly #resolvers = new Map<
    number,
    { resolve(value: unknown): void; reject(reason?: unknown): void }
  >();
  #id = 0;
  #failure: Error | undefined;

  constructor(worker: WorkerLike) {
    this.#worker = worker;
    worker.onmessage = (event) => {
      const resolver = this.#resolvers.get(event.data.id);
      if (!resolver) return;
      this.#resolvers.delete(event.data.id);
      if (event.data.error !== undefined) resolver.reject(event.data.error);
      else resolver.resolve(event.data.data);
    };
    worker.onerror = (event) => this.#rejectAll(event.error ?? event.message);
    worker.onmessageerror = (event) => this.#rejectAll(event.data);
  }

  postMessage<T>(message: WorkerRequest): Promise<T> {
    if (this.#failure) return Promise.reject(this.#failure);
    const id = this.#id++;
    return new Promise<T>((resolve, reject) => {
      this.#resolvers.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.#worker.postMessage({ ...message, id });
    });
  }

  terminate(): void {
    this.#worker.terminate();
  }

  #rejectAll(reason: unknown): void {
    const error = reason instanceof Error ? reason : new Error(String(reason ?? "Worker failed"));
    this.#failure = error;
    for (const resolver of this.#resolvers.values()) resolver.reject(error);
    this.#resolvers.clear();
  }
}

export class WorkerELK implements ElkInterface {
  readonly #defaultLayoutOptions: LayoutOptions;
  readonly #worker: PromisedWorker;
  readonly #ready: Promise<unknown>;

  constructor({
    defaultLayoutOptions = {},
    algorithms,
    workerFactory,
    workerUrl,
  }: ELKConstructorArguments = {}) {
    if (workerUrl === undefined && workerFactory === undefined) {
      throw new Error("Cannot construct an ELK without both 'workerUrl' and 'workerFactory'.");
    }
    const factory = workerFactory ?? ((url?: string) => new globalThis.Worker(url!));
    const worker = factory(workerUrl) as WorkerLike;
    if (!worker || typeof worker.postMessage !== "function") {
      throw new TypeError("Created worker does not provide the required 'postMessage' function.");
    }
    this.#defaultLayoutOptions = defaultLayoutOptions;
    this.#worker = new PromisedWorker(worker);
    this.#ready = this.#worker.postMessage({ cmd: "register", algorithms });
  }

  async layout<T extends ElkNode>(
    graph: T,
    args: ElkLayoutArguments = {},
  ): Promise<LaidOutElkNode<T>> {
    if (!graph) throw new Error("Missing mandatory parameter 'graph'.");
    await this.#ready;
    return this.#worker.postMessage({
      cmd: "layout",
      graph,
      layoutOptions: { ...this.#defaultLayoutOptions, ...args.layoutOptions },
      options: {
        logging: args.logging ?? false,
        measureExecutionTime: args.measureExecutionTime ?? false,
      },
    });
  }

  async knownLayoutAlgorithms(): Promise<ElkLayoutAlgorithmDescription[]> {
    await this.#ready;
    return this.#worker.postMessage({ cmd: "algorithms" });
  }

  async knownLayoutOptions(): Promise<ElkLayoutOptionDescription[]> {
    await this.#ready;
    return this.#worker.postMessage({ cmd: "options" });
  }

  async knownLayoutCategories(): Promise<ElkLayoutCategoryDescription[]> {
    await this.#ready;
    return this.#worker.postMessage({ cmd: "categories" });
  }

  terminateWorker(): void {
    this.#worker.terminate();
  }
}
