import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const PERMISSIONS_KEY = 'PERMISSIONS_KEY';
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
