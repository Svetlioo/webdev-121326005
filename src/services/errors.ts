/** A refusal a person can read. Route handlers turn `status` into the HTTP status code. */
export class AppError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}
