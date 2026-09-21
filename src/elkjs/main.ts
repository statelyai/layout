/*******************************************************************************
 * Copyright (c) 2021 Kiel University and others.
 *
 * Adapted from elkjs 0.11.1 lib/main.js.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { ELKConstructorArguments } from "./public-types";
import { Worker } from "./worker";
import { WorkerELK } from "./worker-client";

/** Node-compatible elkjs entry point with an in-process worker fallback. */
export default class ELK extends WorkerELK {
  constructor(options: ELKConstructorArguments = {}) {
    super({
      ...options,
      workerFactory: options.workerFactory ?? ((url?: string) => new Worker(url)),
    });
  }
}
