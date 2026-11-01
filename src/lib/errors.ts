export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(code);
  }
}
export function ensure(
  value: unknown,
  code: string,
  status = 400,
): asserts value {
  if (!value) throw new DomainError(code, status);
}
