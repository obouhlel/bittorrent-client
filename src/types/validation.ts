// Validation-related types and interfaces

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  totalSize: number;
  pieceCount: number;
}

export interface ParseResult<T> {
  value: T;
  position: number;
}
