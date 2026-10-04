import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { ErrorCode, UserRole } from '@wasel/shared';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly defaultReflector = new Reflector();

  constructor(@Optional() @Inject(Reflector) private readonly reflector?: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const reflector = this.reflector || this.defaultReflector;
    const requiredRoles = reflector.getAllAndOverride<(UserRole | string)[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.roles) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'غير مصرح لك بتنفيذ هذه العملية (المستخدم غير معروف)',
      });
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'غير مصرح لك بتنفيذ هذه العملية بحسابك الحالي',
      });
    }

    return true;
  }
}
