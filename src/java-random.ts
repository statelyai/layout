/** Java's 48-bit `java.util.Random`, used by ELK for seeded tie-breaking. */
export class JavaRandom {
  static readonly #multiplier = 0x5deece66dn;
  static readonly #addend = 0xbn;
  static readonly #mask = (1n << 48n) - 1n;
  #seed: bigint;

  constructor(seed: number | bigint) {
    this.#seed = (BigInt(seed) ^ JavaRandom.#multiplier) & JavaRandom.#mask;
  }

  #next(bits: number): number {
    this.#seed = (this.#seed * JavaRandom.#multiplier + JavaRandom.#addend) & JavaRandom.#mask;
    return Number(this.#seed >> BigInt(48 - bits));
  }

  nextDouble(): number {
    return (this.#next(26) * 2 ** 27 + this.#next(27)) / 2 ** 53;
  }

  nextFloat(): number {
    return this.#next(24) / 2 ** 24;
  }

  nextBoolean(): boolean {
    return this.#next(1) !== 0;
  }

  nextLong(): bigint {
    const high = BigInt.asIntN(32, BigInt(this.#next(32)));
    const low = BigInt.asIntN(32, BigInt(this.#next(32)));
    return BigInt.asIntN(64, (high << 32n) + low);
  }

  nextInt(bound: number): number {
    if (bound <= 0) throw new RangeError("bound must be positive");
    if ((bound & -bound) === bound) return Math.floor((bound * this.#next(31)) / 2 ** 31);
    let bits: number;
    let value: number;
    do {
      bits = this.#next(31);
      value = bits % bound;
    } while (bits - value + (bound - 1) >= 2 ** 31);
    return value;
  }
}
