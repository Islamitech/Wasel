import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'IDEMPOTENT_KEY';

export interface IdempotentOptions {
  required?: boolean;
}

export const Idempotent = (options: IdempotentOptions = { required: true }) =>
  SetMetadata(IDEMPOTENT_KEY, options);
