/*******************************************************************************
 * Copyright (c) 2019 Kiel University and others.
 *
 * Adapted from elkjs 0.11.1 lib/elk-worker.js.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import ELK from "./index";
import type { ElkLayoutArguments, ElkNode } from "./types";

type WorkerCommand =
  | { id: number; cmd: "register"; algorithms?: string[] }
  | {
      id: number;
      cmd: "layout";
      graph: ElkNode;
      layoutOptions?: Record<string, unknown>;
      options?: ElkLayoutArguments;
    }
  | { id: number; cmd: "algorithms" | "options" | "categories" };

type WorkerAnswer = { id: number; data?: unknown; error?: unknown };

/** In-process implementation of the message interface shipped by elkjs workers. */
export class Worker implements globalThis.Worker {
  onerror: ((this: AbstractWorker, event: ErrorEvent) => unknown) | null = null;
  onmessage: ((this: globalThis.Worker, event: MessageEvent) => unknown) | null = null;
  onmessageerror: ((this: globalThis.Worker, event: MessageEvent) => unknown) | null = null;

  readonly #listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  #elk = new ELK();
  #terminated = false;

  constructor(_url?: string) {}

  postMessage(message: unknown, _transfer: Transferable[]): void;
  postMessage(message: unknown, _options?: StructuredSerializeOptions): void;
  postMessage(message: unknown): void {
    if (this.#terminated) return;
    queueMicrotask(() => void this.#handle(message as WorkerCommand));
  }

  terminate(): void {
    this.#terminated = true;
  }

  addEventListener<K extends keyof WorkerEventMap>(
    type: K,
    listener: (this: globalThis.Worker, event: WorkerEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | AddEventListenerOptions,
  ): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener<K extends keyof WorkerEventMap>(
    type: K,
    listener: (this: globalThis.Worker, event: WorkerEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | EventListenerOptions,
  ): void {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.#listeners.get(event.type) ?? []) {
      if (typeof listener === "function") listener.call(this, event);
      else listener.handleEvent(event);
    }
    return !event.defaultPrevented;
  }

  async #handle(message: WorkerCommand): Promise<void> {
    try {
      let data: unknown;
      switch (message.cmd) {
        case "register":
          this.#elk = new ELK({ algorithms: message.algorithms });
          break;
        case "layout":
          data = await this.#elk.layout(message.graph, {
            ...message.options,
            layoutOptions: message.layoutOptions,
          });
          break;
        case "algorithms":
          data = await this.#elk.knownLayoutAlgorithms();
          break;
        case "options":
          data = await this.#elk.knownLayoutOptions();
          break;
        case "categories":
          data = await this.#elk.knownLayoutCategories();
          break;
      }
      this.#answer({ id: message.id, data });
    } catch (error) {
      this.#answer({ id: message.id, error });
    }
  }

  #answer(answer: WorkerAnswer): void {
    if (this.#terminated) return;
    const event = { data: answer, type: "message" } as MessageEvent<WorkerAnswer>;
    this.onmessage?.call(this, event);
    this.dispatchEvent(event);
  }
}
