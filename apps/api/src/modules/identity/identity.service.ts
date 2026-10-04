import {
  Injectable,
  Inject,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { DatabaseService } from '../../database/database.service.js';
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
import { eq, and, desc, isNull, inArray } from 'drizzle-orm';
import {
  IOtpProvider,
  OTP_PROVIDER_TOKEN,
} from '../../common/providers/otp/otp.provider.interface.js';
import { EventBusService } from '../../common/events/event-bus.service.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import { normalizeEgyptianPhone, ErrorCode, UserRole } from '@wasel/shared';

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(EventBusService) private readonly eventBus: EventBusService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Inject(OTP_PROVIDER_TOKEN) private readonly otpProvider: IOtpProvider,
  ) {}

  /**
   * Request OTP code for a phone number
   */
  async requestOtp(rawPhone: string, requestedRole = UserRole.CUSTOMER) {
    const phone = normalizeEgyptianPhone(rawPhone);

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

    // 3. Generate 6-digit OTP code (in dev mode, deterministic 123456 or random)
    const code =
      process.env.NODE_ENV === 'test' || process.env.OTP_PROVIDER === 'dev'
        ? '123456'
        : Math.floor(100000 + Math.random() * 900000).toString();

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
    await this.otpProvider.sendOtp({
      phone,
      code,
      expiresInMinutes: expiryMinutes,
    });

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
    requestedRole = UserRole.CUSTOMER,
  ) {
    const phone = normalizeEgyptianPhone(rawPhone);
    const now = new Date();

    // 1. Fetch latest challenge for this phone
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

    // 3. Check attempt limit (brute-force protection)
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_MAX_ATTEMPTS,
        message: 'تم استنفاد المحاولات المسموح بها، يرجى طلب رمز جديد',
      });
    }

    // 4. Verify code match
    const isValid = await bcrypt.compare(code, challenge.hashedCode);
    if (!isValid) {
      const updatedAttempts = challenge.attempts + 1;
      await this.dbService.db
        .update(otpChallenges)
        .set({ attempts: updatedAttempts })
        .where(eq(otpChallenges.id, challenge.id));

      const remaining = challenge.maxAttempts - updatedAttempts;
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_INVALID,
        message:
          remaining > 0
            ? `رمز التحقق غير صحيح. المحاولات المتبقية: ${remaining}`
            : 'تم استنفاد الحد الأقصى للمحاولات',
        details: { remainingAttempts: Math.max(0, remaining) },
      });
    }

    // 5. Mark challenge as verified
    await this.dbService.db
      .update(otpChallenges)
      .set({ verifiedAt: now })
      .where(eq(otpChallenges.id, challenge.id));

    // 6. Find or create user
    let isNewUser = false;
    let [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (!user) {
      // Find default region (Hadayek al-Ahram)
      const [defaultRegion] = await this.dbService.db
        .select()
        .from(regions)
        .where(eq(regions.code, 'EG-GZ-HDA'))
        .limit(1);

      const [newUser] = await this.dbService.db
        .insert(users)
        .values({
          phone,
          regionId: defaultRegion?.id,
          isActive: true,
        })
        .returning();

      user = newUser!;
      isNewUser = true;

      // Assign requested role
      const [roleRecord] = await this.dbService.db
        .select()
        .from(roles)
        .where(eq(roles.name, requestedRole))
        .limit(1);

      if (roleRecord) {
        await this.dbService.db.insert(userRoles).values({
          userId: user.id,
          roleId: roleRecord.id,
        });
      }
    }

    // 7. Load roles & permissions
    const { userRoleNames, userPermissionNames } = await this.getUserRolesAndPermissions(user.id);

    // 8. Generate tokens & session
    const tokens = await this.generateSession(user.id, userRoleNames, userPermissionNames, deviceInfo, ipAddress, userAgent);

    // 9. Publish event
    if (isNewUser) {
      await this.eventBus.publish('user.registered', user.id, {
        userId: user.id,
        phone: user.phone!,
        role: requestedRole,
        regionId: user.regionId!,
      });
    }

    await this.eventBus.publish('user.authenticated', user.id, {
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
  }

  /**
   * Admin Authentication (Email + Password)
   */
  async adminLogin(email: string, pass: string, deviceInfo = 'Admin Web', ipAddress?: string, userAgent?: string) {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user || !user.passwordHash || !user.isActive) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'بيانات الدخول غير صحيحة أو الحساب غير مفعل',
      });
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'بيانات الدخول غير صحيحة',
      });
    }

    const { userRoleNames, userPermissionNames } = await this.getUserRolesAndPermissions(user.id);

    if (!userRoleNames.includes('admin') && !userRoleNames.includes('support')) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'هذا الحساب لا يملك صلاحية الدخول للوحة التحكم',
      });
    }

    const tokens = await this.generateSession(user.id, userRoleNames, userPermissionNames, deviceInfo, ipAddress, userAgent);

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
        roles: userRoleNames,
        permissions: userPermissionNames,
      },
    };
  }

  /**
   * Rotate refresh token
   */
  async refreshAccessToken(rawRefreshToken: string, ipAddress?: string, userAgent?: string) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'super_secret_jwt_refresh_key_min_32_chars_long',
      });
    } catch {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'رمز التحديث منتهي أو غير صالح',
      });
    }

    const sessionId = payload.sessionId;
    const [session] = await this.dbService.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .limit(1);

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً',
      });
    }

    // Hash check
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    if (session.refreshTokenHash !== tokenHash) {
      // Possible reuse attack! Revoke session immediately
      await this.dbService.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, session.id));
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'تم رفض الجلسة لأسباب أمنية',
      });
    }

    // Revoke old session & create new rotated session
    await this.dbService.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, session.id));

    const { userRoleNames, userPermissionNames } = await this.getUserRolesAndPermissions(session.userId);

    const newTokens = await this.generateSession(
      session.userId,
      userRoleNames,
      userPermissionNames,
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
  async logout(rawRefreshToken?: string, userId?: string, allDevices = false) {
    if (allDevices && userId) {
      await this.dbService.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
      return { success: true, message: 'تم تسجيل الخروج من كافة الأجهزة بنجاح' };
    }

    if (rawRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await this.dbService.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.refreshTokenHash, tokenHash));
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
      roles: userRoleNames,
      permissions: userPermissionNames,
    };
  }

  /**
   * Helper: create tokens and session
   */
  private async generateSession(
    userId: string,
    rolesList: string[],
    permissionsList: string[],
    deviceInfo: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const sessionId = crypto.randomUUID();
    const accessSecret = process.env.JWT_ACCESS_SECRET || 'super_secret_jwt_access_key_min_32_chars_long';
    const refreshSecret = process.env.JWT_REFRESH_SECRET || 'super_secret_jwt_refresh_key_min_32_chars_long';

    const accessToken = await this.jwtService.signAsync(
      {
        sub: userId,
        sessionId,
        roles: rolesList,
        permissions: permissionsList,
      },
      {
        secret: accessSecret,
        expiresIn: '15m',
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: userId,
        sessionId,
      },
      {
        secret: refreshSecret,
        expiresIn: '30d',
      },
    );

    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.dbService.db.insert(sessions).values({
      id: sessionId,
      userId,
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
  private async getUserRolesAndPermissions(userId: string) {
    const userRoleRecords = await this.dbService.db
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
      const permissionRecords = await this.dbService.db
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
    const [custProfile] = await this.dbService.db.select().from(customerProfiles).where(eq(customerProfiles.id, userId)).limit(1);
    const [drvProfile] = await this.dbService.db.select().from(driverProfiles).where(eq(driverProfiles.id, userId)).limit(1);

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

  async registerPushDevice(userId: string, dto: { endpoint: string; keys: { p256dh: string; auth: string }; deviceInfo?: string }) {
    const [existing] = await this.dbService.db
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, dto.endpoint)))
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

