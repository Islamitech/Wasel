import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';
import { ErrorCode } from '@wasel/shared';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema?: ZodSchema) {}

  transform(value: unknown) {
    if (!this.schema) return value;
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          errorCode: ErrorCode.VALIDATION_ERROR,
          message: 'فشل التحقق من صحة البيانات المدخلة',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      throw new BadRequestException('Validation error');
    }
  }
}
