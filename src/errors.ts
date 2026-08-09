export class LayoutError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "LayoutError";
  }
}

export class UnsupportedLayoutError extends LayoutError {
  constructor(message: string) {
    super(message, "UNSUPPORTED_LAYOUT");
    this.name = "UnsupportedLayoutError";
  }
}
