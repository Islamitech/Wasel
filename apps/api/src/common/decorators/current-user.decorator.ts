import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  sub: string;
  userId?: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;
    if (!user) return null;
    if (data === 'userId' || data === 'sub') return user.sub;
    return data ? user[data] : user;
  },
);
