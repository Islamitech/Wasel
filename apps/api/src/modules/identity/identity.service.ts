import {
  Injectable,
  Inject,
  Optional,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { MetricsService } from '../metrics/index.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { DatabaseService, type DatabaseTransaction } from '../../database/database.service.js';
import {
  users,
  roles,
  userRoles,
  permissions,
  rolePermissions,
  sessions,
  otpChallenges,
  regions,
  customerProfiles,
  driverProfiles,
  pushSubscriptions,
  vehicles,
} from '../../database/schema/index.js';
import { eq, and, desc, isNull, inArray, sql, lt } from 'drizzle-orm';
import {
  IOtpProvider,
  OTP_PROVIDER_TOKEN,
} from '../../common/providers/otp/otp.provider.interface.js';
import { EventBusService } from '../../common/events/event-bus.service.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import { AppConfigService } from '../../config/config.service.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { TokenService } from './token.service.js';
import { AuditService } from '../audit/index.js';
import { normalizeEgyptianPhone, ErrorCode, UserRole } from '@wasel/shared';

// Constant time bcrypt comparison dummy hash (cost 10)
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(EventBusService) private readonly eventBus: EventBusService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Inject(AppConfigService) private readonly configService: AppConfigService,
    @Inject(RedisService) private readonly redisService: RedisService,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(OTP_PROVIDER_TOKEN) private readonly otpProvider: IOtpProvider,
    @Optional() @Inject(MetricsService) private readonly metricsService?: MetricsService,
  ) {}

  /**
   * Request OTP code for a phone number
   */
  async requestOtp(rawPhone: string, requestedRole: string = UserRole.CUSTOMER, ip?: string) {
    const phone = normalizeEgyptianPhone(rawPhone);

    // Driver Login Gate: Drivers must be officially registered in DB
    if (requestedRole === 'driver') {
      const [existingUser] = await this.dbService.db
        .select()
        .from(users)
        .where(eq(users.phone, phone))
        .limit(1);

      if (!existingUser) {
        throw new BadRequestException({
          errorCode: ErrorCode.NOT_FOUND,
          message: 'هذا الرقم غير مسجل كـ كابتن في منصة واصل. يرجى التواصل مع إدارة العمليات لفتح حساب واعتماده أولاً.',
        });
      }

      if (!existingUser.isActive) {
        throw new BadRequestException({
          errorCode: ErrorCode.FORBIDDEN,
          message: 'حساب الكابتن معلق أو بانتظار التفعيل والاعتماد من قبل إدارة واصل.',
        });
      }
    }

    // 1. Check existing active challenge for cooldown
    const existingChallenges = await this.dbService.db
      .select()
      .from(otpChallenges)
      .where(eq(otpChallenges.phone, phone))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);

    const now = new Date();
    const lastChallenge = existingChallenges[0];

    if (lastChallenge && lastChallenge.resendAvailableAt > now) {
      const waitSeconds = Math.ceil(
        (lastChallenge.resendAvailableAt.getTime() - now.getTime()) / 1000,
      );
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_COOLDOWN,
        message: `يرجى الانتظار ${waitSeconds} ثانية قبل إعادة إرسال رمز التحقق`,
        details: { waitSeconds },
      });
    }

    // 2. Fetch configurable settings
    const expiryMinutes = await this.settingsService.get<number>('otp_expiry_minutes', undefined, 5);
    const cooldownSeconds = await this.settingsService.get<number>(
      'otp_resend_cooldown_seconds',
      undefined,
      60,
    );
    const maxAttempts = await this.settingsService.get<number>('otp_max_attempts', undefined, 3);

    // 3. Generate 6-digit OTP code (deterministic 123456 ONLY in development/test with OTP_PROVIDER=dev)
    const appEnv = this.configService.get('APP_ENV');
    const otpProvider = this.configService.get('OTP_PROVIDER');
    const isDevOrTest =
      (appEnv === 'development' || appEnv === 'test') && otpProvider === 'dev';

    const code = isDevOrTest
      ? '123456'
      : crypto.randomInt(100000, 1000000).toString();

    const hashedCode = await bcrypt.hash(code, 10);
    const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);
    const resendAvailableAt = new Date(now.getTime() + cooldownSeconds * 1000);

    // 4. Save challenge to DB
    const [challenge] = await this.dbService.db
      .insert(otpChallenges)
      .values({
        phone,
        hashedCode,
        attempts: 0,
        maxAttempts,
        resendAvailableAt,
        expiresAt,
      })
      .returning();

    // 5. Send OTP via configured provider
    try {
      await this.otpProvider.sendOtp({
        phone,
        code,
        expiresInMinutes: expiryMinutes,
        ip,
      });
      this.metricsService?.recordOtpDelivery('success', this.otpProvider.providerName);
    } catch (err) {
      this.metricsService?.recordOtpDelivery('failure', this.otpProvider.providerName);
      throw err;
    }

    // 6. Record domain event
    await this.eventBus.publish('otp.requested', phone, {
      challengeId: challenge?.id,
      phone,
      role: requestedRole,
    });

    return {
      success: true,
      message: 'تم إرسال رمز التحقق بنجاح',
      resendCooldownSeconds: cooldownSeconds,
    };
  }

  /**
   * Verify OTP and establish user session
   */
  async verifyOtp(
    rawPhone: string,
    code: string,
    deviceInfo = 'Web Browser',
    ipAddress?: string,
    userAgent?: string,
    requestedRole: string = UserRole.CUSTOMER,
  ) {
    // S-01: Disallow admin/support roles via OTP
    if (requestedRole === 'admin' || requestedRole === 'support') {
      throw new BadRequestException({
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'غير مصرح بتسجيل حسابات الإدارة أو الدعم عبر رمز التحقق',
      });
    }

    const phone = normalizeEgyptianPhone(rawPhone);
    const now = new Date();

    // 1. Fetch latest active unverified challenge for this phone
    const [challenge] = await this.dbService.db
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.verifiedAt)))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);

    if (!challenge) {
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_INVALID,
        message: 'لا يوجد طلب تحقق نشط لهذا الرقم، يرجى طلب رمز جديد',
      });
    }

    // 2. Check if expired
    if (challenge.expiresAt < now) {
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_EXPIRED,
        message: 'انتهت صلاحية رمز التحقق، يرجى طلب رمز جديد',
      });
    }

    // 3. Atomic attempt increment and bounds check
    const updatedChallenges = await this.dbService.db
      .update(otpChallenges)
      .set({ attempts: sql`${otpChallenges.attempts} + 1` })
      .where(
        and(
          eq(otpChallenges.id, challenge.id),
          lt(otpChallenges.attempts, challenge.maxAttempts),
          isNull(otpChallenges.verifiedAt),
        ),
      )
      .returning();

    if (updatedChallenges.length === 0) {
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_MAX_ATTEMPTS,
        message: 'تم استنفاد المحاولات المسموح بها، يرجى طلب رمز جديد',
      });
    }

    const currentAttempts = updatedChallenges[0]!.attempts;

    // 4. Verify code match
    const isValid = await bcrypt.compare(code, challenge.hashedCode);
    if (!isValid) {
      const remaining = challenge.maxAttempts - currentAttempts;
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_INVALID,
        message:
          remaining > 0
            ? `رمز التحقق غير صحيح. المحاولات المتبقية: ${remaining}`
            : 'تم استنفاد الحد الأقصى للمحاولات',
        details: { remainingAttempts: Math.max(0, remaining) },
      });
    }

    // 5-9. Atomically consume challenge, provision/update user & role, establish session, and publish events
    return await this.dbService.transaction(
      async (tx) => {
        // 5. Atomic challenge consumption
        const consumedChallenges = await tx
          .update(otpChallenges)
          .set({ verifiedAt: now })
          .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.verifiedAt)))
          .returning();

        if (consumedChallenges.length === 0) {
          throw new BadRequestException({
            errorCode: ErrorCode.OTP_EXPIRED,
            message: 'تم استهلاك رمز التحقق مسبقاً',
          });
        }

        // 6. Find or create user
        let isNewUser = false;
        let [user] = await tx
          .select()
          .from(users)
          .where(eq(users.phone, phone))
          .limit(1);

        if (user) {
          // S-06: Inactive user rejected
          if (!user.isActive) {
            throw new UnauthorizedException({
              errorCode: ErrorCode.UNAUTHORIZED,
              message: 'حساب المستخدم معطل أو غير نشط من قبل الإدارة',
            });
          }

          // S-01: For existing user, only allow adding the other public role (customer <-> driver)
          const { userRoleNames } = await this.getUserRolesAndPermissions(user.id, tx);
          if (
            (requestedRole === 'customer' || requestedRole === 'driver') &&
            !userRoleNames.includes(requestedRole)
          ) {
            const [roleRecord] = await tx
              .select()
              .from(roles)
              .where(eq(roles.name, requestedRole))
              .limit(1);

            if (roleRecord) {
              await tx.insert(userRoles).values({
                userId: user.id,
                roleId: roleRecord.id,
              });

              await this.tokenService.invalidateUserCache(user.id);

              await this.auditService.log(
                {
                  userId: user.id,
                  action: 'identity.role_added',
                  entityType: 'user_roles',
                  beforeState: { existingRoles: userRoleNames },
                  afterState: { addedRole: requestedRole },
                  ipAddress,
                  userAgent,
                },
                tx,
              );
            }
          }

          // Ensure driver profile exists with pending status if missing
          if (requestedRole === 'driver') {
            const [existingProfile] = await tx
              .select()
              .from(driverProfiles)
              .where(eq(driverProfiles.id, user.id))
              .limit(1);

            if (!existingProfile) {
              await tx.insert(driverProfiles).values({
                id: user.id,
                status: 'pending',
                isOnline: false,
              });
            }
          }
        } else {
          // Reject new unregistered drivers - Drivers must be officially created
          if (requestedRole === 'driver') {
            throw new BadRequestException({
              errorCode: ErrorCode.NOT_FOUND,
              message: 'هذا الحساب غير مسجل كـ كابتن في منصة واصل. يرجى التواصل مع الإدارة للتسجيل والاعتماد.',
            });
          }

          // Find default region
          const [defaultRegion] = await tx
            .select()
            .from(regions)
            .where(eq(regions.code, 'EG-GZ-HDA'))
            .limit(1);

          const [newUser] = await tx
            .insert(users)
            .values({
              phone,
              regionId: defaultRegion?.id,
              isActive: true,
            })
            .returning();

          user = newUser!;
          isNewUser = true;

          // Assign initial public role
          const [roleRecord] = await tx
            .select()
            .from(roles)
            .where(eq(roles.name, requestedRole))
            .limit(1);

          if (roleRecord) {
            await tx.insert(userRoles).values({
              userId: user.id,
              roleId: roleRecord.id,
            });
          }

          await this.auditService.log(
            {
              userId: user.id,
              action: 'identity.user_registered',
              entityType: 'users',
              entityId: user.id,
              afterState: { phone: user.phone, role: requestedRole },
              ipAddress,
              userAgent,
            },
            tx,
          );
        }

        // 7. Load roles & permissions
        const { userRoleNames, userPermissionNames } = await this.getUserRolesAndPermissions(user.id, tx);

        // 8. Generate session with cryptographic family_id using tx
        const tokens = await this.generateSession(
          user.id,
          undefined,
          deviceInfo,
          ipAddress,
          userAgent,
          tx,
        );

        // 9. Publish event via transactional outbox inside tx
        if (isNewUser) {
          await this.eventBus.publish(tx, 'user.registered', user.id, {
            userId: user.id,
            phone: user.phone!,
            role: requestedRole,
            regionId: user.regionId!,
          });
        }

        await this.eventBus.publish(tx, 'user.authenticated', user.id, {
          userId: user.id,
          sessionId: tokens.sessionId,
          role: userRoleNames[0] || requestedRole,
          ipAddress,
        });

        return {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: {
            id: user.id,
            phone: user.phone,
            fullName: user.fullName,
            regionId: user.regionId,
            roles: userRoleNames,
            permissions: userPermissionNames,
          },
        };
      },
      { actor: 'system' },
    );
  }

  /**
   * Admin Authentication (Email + Password) - S-16 Hardened
   */
  async adminLogin(
    email: string,
    pass: string,
    deviceInfo = 'Admin Web',
    ipAddress?: string,
    userAgent?: string,
  ) {
    const normalizedEmail = email.toLowerCase().trim();
    const lockoutKey = `admin:lockout:${normalizedEmail}:${ipAddress || 'unknown'}`;

    // S-16: Check temporary lockout (5 failed attempts / 15 minutes)
    const attemptsStr = await this.redisService.get(lockoutKey);
    const currentAttempts = parseInt(attemptsStr || '0', 10);
    if (currentAttempts >= 5) {
      await this.auditService.log({
        action: 'security.admin_login_locked_out',
        entityType: 'admin_login',
        beforeState: { email: normalizedEmail, ipAddress, currentAttempts },
        ipAddress,
        userAgent,
      });

      throw new UnauthorizedException({
        errorCode: ErrorCode.RATE_LIMITED,
        message: 'تم قفل الحساب مؤقتاً لتكرار المحاولات الخاطئة. يرجى المحاولة بعد 15 دقيقة.',
      });
    }

    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // S-16: Constant-time comparison against DUMMY_HASH if account doesn't exist
    const hashToCompare = user?.passwordHash || DUMMY_HASH;
    const isMatch = await bcrypt.compare(pass, hashToCompare);

    if (!user || !user.passwordHash || !user.isActive || !isMatch) {
      await this.redisService.incr(lockoutKey, 15 * 60);

      await this.auditService.log({
        userId: user?.id,
        action: 'security.admin_login_failed',
        entityType: 'admin_login',
        beforeState: { email: normalizedEmail, ipAddress },
        ipAddress,
        userAgent,
      });

      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'بيانات الدخول غير صحيحة أو الحساب غير مفعل',
      });
    }

    const { userRoleNames, userPermissionNames } = await this.getUserRolesAndPermissions(user.id);

    if (!userRoleNames.includes('admin') && !userRoleNames.includes('support')) {
      await this.auditService.log({
        userId: user.id,
        action: 'security.admin_login_unauthorized_role',
        entityType: 'admin_login',
        beforeState: { email: normalizedEmail, roles: userRoleNames },
        ipAddress,
        userAgent,
      });

      throw new UnauthorizedException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'هذا الحساب لا يملك صلاحية الدخول للوحة التحكم',
      });
    }

    // Success: Clear lockout counter
    await this.redisService.del(lockoutKey);

    const tokens = await this.generateSession(
      user.id,
      undefined,
      deviceInfo,
      ipAddress,
      userAgent,
    );

    await this.auditService.log({
      userId: user.id,
      action: 'admin.login_success',
      entityType: 'admin_login',
      entityId: user.id,
      ipAddress,
      userAgent,
    });

    await this.eventBus.publish('user.authenticated', user.id, {
      userId: user.id,
      sessionId: tokens.sessionId,
      role: 'admin',
      ipAddress,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        mustChangePassword: user.mustChangePassword,
        roles: userRoleNames,
        permissions: userPermissionNames,
      },
    };
  }

  /**
   * Rotate refresh token - S-06 Atomic & Family Invalidation
   */
  async refreshAccessToken(rawRefreshToken: string, ipAddress?: string, userAgent?: string) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
        issuer: this.configService.get('JWT_ISSUER'),
        audience: this.configService.get('JWT_AUDIENCE'),
      });
    } catch {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'رمز التحديث منتهي أو غير صالح',
      });
    }

    if (payload.typ !== 'refresh' || !payload.sessionId || !payload.sub) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'رمز التحديث غير صالح',
      });
    }

    const sessionId = payload.sessionId;
    const [session] = await this.dbService.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'الجلسة غير موجودة',
      });
    }

    // S-06: Reuse detection! If session is already revoked, invalidate entire session family
    if (session.revokedAt !== null) {
      await this.dbService.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.familyId, session.familyId), isNull(sessions.revokedAt)));

      await this.auditService.log({
        userId: session.userId,
        action: 'security.refresh_token_reuse_breach',
        entityType: 'sessions',
        entityId: session.id,
        beforeState: { familyId: session.familyId, attemptedSessionId: session.id },
        ipAddress,
        userAgent,
      });

      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'تم اكتشاف محاولة إعادة استخدام رمز أمني غير صالح. تم إبطال كافة الجلسات المرتبطة.',
      });
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً',
      });
    }

    // Cryptographic hash validation
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    if (session.refreshTokenHash !== tokenHash) {
      await this.dbService.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.familyId, session.familyId), isNull(sessions.revokedAt)));

      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'تم رفض الجلسة لأسباب أمنية',
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

    // S-06: Atomic revocation with RETURNING to handle concurrent race conditions
    const revoked = await this.dbService.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)))
      .returning();

    if (revoked.length === 0) {
      // Parallel race condition: another concurrent request already rotated this session!
      await this.dbService.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.familyId, session.familyId), isNull(sessions.revokedAt)));

      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'فشلت معالجة رمز التحديث المتزامن',
      });
    }

    // Generate next session maintaining the same familyId
    const newTokens = await this.generateSession(
      session.userId,
      session.familyId,
      session.deviceInfo || 'Rotated Session',
      ipAddress || session.ipAddress || undefined,
      userAgent || session.userAgent || undefined,
    );

    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    };
  }

  /**
   * Log out session
   */
  async logout(
    rawRefreshToken?: string,
    userId?: string,
    allDevices = false,
    currentSessionId?: string,
  ) {
    const now = new Date();

    if (allDevices && userId) {
      await this.dbService.db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

      if (userId) {
        await this.tokenService.invalidateUserCache(userId);
      }
      return { success: true, message: 'تم تسجيل الخروج من كافة الأجهزة بنجاح' };
    }

    if (currentSessionId) {
      await this.dbService.db
        .update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.id, currentSessionId));
    }

    if (rawRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await this.dbService.db
        .update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.refreshTokenHash, tokenHash));
    }

    if (userId) {
      await this.tokenService.invalidateUserCache(userId);
    }

    return { success: true, message: 'تم تسجيل الخروج بنجاح' };
  }

  /**
   * Fetch user details by ID
   */
  async getUserProfile(userId: string) {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    const { userRoleNames, userPermissionNames } = await this.getUserRolesAndPermissions(user.id);

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.fullName,
      regionId: user.regionId,
      mustChangePassword: user.mustChangePassword,
      roles: userRoleNames,
      permissions: userPermissionNames,
    };
  }

  /**
   * Helper: create tokens and session
   */
  private async generateSession(
    userId: string,
    familyId?: string,
    deviceInfo = 'Web Browser',
    ipAddress?: string,
    userAgent?: string,
    tx?: DatabaseTransaction,
  ) {
    const sessionId = crypto.randomUUID();
    const currentFamilyId = familyId || crypto.randomUUID();

    const accessSecret = this.configService.get('JWT_ACCESS_SECRET');
    const refreshSecret = this.configService.get('JWT_REFRESH_SECRET');
    const issuer = this.configService.get('JWT_ISSUER');
    const audience = this.configService.get('JWT_AUDIENCE');

    // S-06: typ='access', NO permissions in JWT payload
    const accessToken = await this.jwtService.signAsync(
      {
        sub: userId,
        sessionId,
        typ: 'access',
      },
      {
        secret: accessSecret,
        expiresIn: '15m',
        algorithm: 'HS256',
        issuer,
        audience,
      },
    );

    // Refresh token with typ='refresh'
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: userId,
        sessionId,
        familyId: currentFamilyId,
        typ: 'refresh',
      },
      {
        secret: refreshSecret,
        expiresIn: '30d',
        algorithm: 'HS256',
        issuer,
        audience,
      },
    );

    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const dbClient = tx || this.dbService.db;
    await dbClient.insert(sessions).values({
      id: sessionId,
      userId,
      familyId: currentFamilyId,
      refreshTokenHash,
      deviceInfo,
      ipAddress,
      userAgent,
      expiresAt,
    });

    return {
      sessionId,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Helper: retrieve roles and permissions for a user
   */
  private async getUserRolesAndPermissions(userId: string, tx?: DatabaseTransaction) {
    const dbClient = tx || this.dbService.db;
    const userRoleRecords: Array<{ roleId: string; roleName: string }> = await dbClient
      .select({
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    const userRoleNames = userRoleRecords.map((r) => r.roleName);
    const roleIds = userRoleRecords.map((r) => r.roleId);

    let userPermissionNames: string[] = [];
    if (roleIds.length > 0) {
      const permissionRecords: Array<{ permissionName: string }> = await dbClient
        .select({
          permissionName: permissions.name,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(inArray(rolePermissions.roleId, roleIds));

      userPermissionNames = Array.from(new Set(permissionRecords.map((p) => p.permissionName)));
    }

    return { userRoleNames, userPermissionNames };
  }

  async getMe(userId: string) {
    const user = await this.getUserProfile(userId);
    const [custProfile] = await this.dbService.db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.id, userId))
      .limit(1);
    const [drvProfile] = await this.dbService.db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.id, userId))
      .limit(1);

    return {
      ...user,
      customerProfile: custProfile || null,
      driverProfile: drvProfile || null,
    };
  }

  async updateMe(userId: string, data: { fullName?: string; regionId?: string }) {
    await this.dbService.db
      .update(users)
      .set({
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.regionId !== undefined ? { regionId: data.regionId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return this.getMe(userId);
  }

  async registerPushDevice(
    userId: string,
    dto: { endpoint: string; keys: { p256dh: string; auth: string }; deviceInfo?: string },
  ) {
    const [existing] = await this.dbService.db
      .select()
      .from(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, dto.endpoint)),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.dbService.db
        .update(pushSubscriptions)
        .set({
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
          userAgent: dto.deviceInfo,
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.id, existing.id))
        .returning();
      return { success: true, subscriptionId: updated!.id };
    }

    const [created] = await this.dbService.db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.deviceInfo,
      })
      .returning();

    return { success: true, subscriptionId: created!.id };
  }

  async getCustomerProfile(userId: string) {
    const [profile] = await this.dbService.db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.id, userId))
      .limit(1);

    if (!profile) {
      const [created] = await this.dbService.db
        .insert(customerProfiles)
        .values({ id: userId })
        .returning();
      return created;
    }
    return profile;
  }

  async getDriverProfile(userId: string) {
    const [profile] = await this.dbService.db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.id, userId))
      .limit(1);

    if (!profile) {
      throw new NotFoundException({
        errorCode: ErrorCode.NOT_FOUND,
        message: 'ملف الكابتن غير مسجل بعد، يرجى إكمال بيانات التسجيل',
      });
    }

    const driverVehicles = await this.dbService.db
      .select()
      .from(vehicles)
      .where(eq(vehicles.driverId, userId));

    return {
      ...profile,
      vehicles: driverVehicles,
    };
  }
}
