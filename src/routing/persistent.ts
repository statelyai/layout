/** Path-copying AVL map. Updating k entries costs O(k log n), never a whole Map copy. */
interface Node<V> {
  readonly key: string;
  readonly value: V;
  readonly left?: Node<V>;
  readonly right?: Node<V>;
  readonly height: number;
  readonly size: number;
}
const height = <V>(n?: Node<V>) => n?.height ?? 0;
const size = <V>(n?: Node<V>) => n?.size ?? 0;
function node<V>(key: string, value: V, left?: Node<V>, right?: Node<V>): Node<V> {
  return {
    key,
    value,
    left,
    right,
    height: 1 + Math.max(height(left), height(right)),
    size: 1 + size(left) + size(right),
  };
}
function balance<V>(n: Node<V>): Node<V> {
  if (height(n.left) - height(n.right) > 1) {
    let l = n.left!;
    if (height(l.right) > height(l.left)) {
      const r = l.right!;
      l = node(r.key, r.value, node(l.key, l.value, l.left, r.left), r.right);
    }
    return node(l.key, l.value, l.left, node(n.key, n.value, l.right, n.right));
  }
  if (height(n.right) - height(n.left) > 1) {
    let r = n.right!;
    if (height(r.left) > height(r.right)) {
      const l = r.left!;
      r = node(l.key, l.value, l.left, node(r.key, r.value, l.right, r.right));
    }
    return node(r.key, r.value, node(n.key, n.value, n.left, r.left), r.right);
  }
  return n;
}
function put<V>(n: Node<V> | undefined, key: string, value: V): Node<V> {
  if (!n) return node(key, value);
  if (key === n.key) return Object.is(value, n.value) ? n : node(key, value, n.left, n.right);
  return balance(
    key < n.key
      ? node(n.key, n.value, put(n.left, key, value), n.right)
      : node(n.key, n.value, n.left, put(n.right, key, value)),
  );
}
function remove<V>(n: Node<V> | undefined, key: string): Node<V> | undefined {
  if (!n) return n;
  if (key < n.key) return balance(node(n.key, n.value, remove(n.left, key), n.right));
  if (key > n.key) return balance(node(n.key, n.value, n.left, remove(n.right, key)));
  if (!n.left) return n.right;
  if (!n.right) return n.left;
  let successor = n.right;
  while (successor.left) successor = successor.left;
  return balance(node(successor.key, successor.value, n.left, remove(n.right, successor.key)));
}
function* entries<V>(n?: Node<V>): Generator<[string, V]> {
  if (!n) return;
  yield* entries(n.left);
  yield [n.key, n.value];
  yield* entries(n.right);
}
export class PersistentMap<V> implements ReadonlyMap<string, V> {
  readonly #root?: Node<V>;
  constructor(root?: Node<V>) {
    this.#root = root;
    Object.freeze(this);
  }
  get size() {
    return size(this.#root);
  }
  get [Symbol.toStringTag]() {
    return "PersistentMap";
  }
  get(key: string): V | undefined {
    let n = this.#root;
    while (n) {
      if (key === n.key) return n.value;
      n = key < n.key ? n.left : n.right;
    }
  }
  has(key: string) {
    let n = this.#root;
    while (n) {
      if (key === n.key) return true;
      n = key < n.key ? n.left : n.right;
    }
    return false;
  }
  set(key: string, value: V): PersistentMap<V> {
    return new PersistentMap(put(this.#root, key, value));
  }
  delete(key: string): PersistentMap<V> {
    return this.has(key) ? new PersistentMap(remove(this.#root, key)) : this;
  }
  *entries(): MapIterator<[string, V]> {
    yield* entries(this.#root);
  }
  *keys(): MapIterator<string> {
    for (const [key] of this) yield key;
  }
  *values(): MapIterator<V> {
    for (const [, value] of this) yield value;
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  forEach(
    callback: (value: V, key: string, map: ReadonlyMap<string, V>) => void,
    thisArg?: unknown,
  ) {
    for (const [key, value] of this) callback.call(thisArg, value, key, this);
  }
}
