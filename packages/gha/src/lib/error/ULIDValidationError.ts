export class ULIDValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ULIDValidationError';
    }
  }