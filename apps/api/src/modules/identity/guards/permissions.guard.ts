import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { ErrorCode } from '@wasel/shared';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'غير مصرح بالوصول إلى هذا المورد',
      });
    }

    // Admins bypass granular checks if role 'admin'
    if (user.roles?.includes('admin')) {
      return true;
    }

    const userPermissions: string[] = user.permissions || [];
    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!hasAll) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'ليس لديك الصلاحيات الكافية لتنفيذ هذا الإجراء',
      });
    }

    return true;
  }
}
