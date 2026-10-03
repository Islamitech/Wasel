import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ErrorCode } from '@wasel/shared';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'رمز الدخول مفقود أو غير صالح',
      });
    }

    const token = authHeader.split(' ')[1];
    try {
      const payload = await this.jwtService.verifyAsync(token!, {
        secret: process.env.JWT_ACCESS_SECRET || 'super_secret_jwt_access_key_min_32_chars_long',
      });

      (request as any).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'انتهت صلاحية جلسة الدخول أو رمز الدخول غير صالح',
      });
    }
  }
}
