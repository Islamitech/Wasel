import {
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq, and, isNull, gt, inArray } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { AppConfigService } from '../../config/config.service.js';
import { RedisService } from '../../common/redis/redis.service.js';
import {
  sessions,
  users,
  roles,
  userRoles,
  permissions,
  rolePermissions,
} from '../../database/schema/index.js';
import { ErrorCode } from '@wasel/shared';

export interface AuthenticatedUserPayload {
  sub: string;
  id: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
  phone?: string | null;
  email?: string | null;
  regionId?: string | null;
  mustChangePassword?: boolean;
}

interface AccessTokenJwtPayload {
  sub?: string;
  sessionId?: string;
  typ?: string;
}

@Injectable()
export class TokenService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(AppConfigService) private readonly configService: AppConfigService,
    @Inject(RedisService) private readonly redisService: RedisService,
  ) {}

  /**
   * Unified token verification method used by both HTTP JwtAuthGuard and Realtime SSE Stream
   */
  async verifyAccessToken(token: string): Promise<AuthenticatedUserPayload> {
    const accessSecret = this.configService.get('JWT_ACCESS_SECRET');
    const issuer = this.configService.get('JWT_ISSUER');
    const audience = this.configService.get('JWT_AUDIENCE');

    let payload: AccessTokenJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenJwtPayload>(token, {
        secret: accessSecret,
        algorithms: ['HS256'],
        issuer,
        audience,
      });
    } catch {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'انتهت صلاحية جلسة الدخول أو رمز الدخول غير صالح',
      });
    }

    // Verify typ is 'access'
    if (payload.typ !== 'access') {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'نوع رمز الدخول غير صالح (typ must be access)',
      });
    }

    if (!payload.sessionId || !payload.sub) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'بيانات رمز الدخول غير مكتملة',
      });
    }

    // Verify session in DB (must be active and unrevoked)
    const now = new Date();
    const [session] = await this.dbService.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, payload.sessionId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1);

    if (!session) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'جلسة الدخول منتهية أو تم إبطالها',
      });
    }

    // Verify user is active
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'حساب المستخدم معطل أو غير موجود',
      });
    }

    // Load roles & permissions (with 30s Redis cache)
    const cacheKey = `user:perms:${user.id}`;
    const cached = await this.redisService.get(cacheKey);

    let userRoleNames: string[] = [];
    let userPermissionNames: string[] = [];

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        userRoleNames = parsed.roles || [];
        userPermissionNames = parsed.permissions || [];
      } catch {
        // Fallback to DB
      }
    }

    if (userRoleNames.length === 0 && userPermissionNames.length === 0) {
      const userRoleRecords = await this.dbService.db
        .select({
          roleId: roles.id,
          roleName: roles.name,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, user.id));

      userRoleNames = userRoleRecords.map((r) => r.roleName);
      const roleIds = userRoleRecords.map((r) => r.roleId);

      if (roleIds.length > 0) {
        const perms = await this.dbService.db
          .select({
            permissionName: permissions.name,
          })
          .from(rolePermissions)
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(inArray(rolePermissions.roleId, roleIds));

        userPermissionNames = Array.from(new Set(perms.map((p) => p.permissionName)));
      }

      await this.redisService.set(
        cacheKey,
        JSON.stringify({ roles: userRoleNames, permissions: userPermissionNames }),
        30,
      );
    }

    return {
      sub: user.id,
      id: user.id,
      sessionId: session.id,
      roles: userRoleNames,
      permissions: userPermissionNames,
      phone: user.phone,
      email: user.email,
      regionId: user.regionId,
      mustChangePassword: user.mustChangePassword,
    };
  }

  /**
   * Invalidate cached permissions for a user
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.redisService.del(`user:perms:${userId}`);
  }
}
