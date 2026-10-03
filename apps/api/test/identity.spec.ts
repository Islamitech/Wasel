import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { OTP_PROVIDER_TOKEN } from '../src/common/providers/otp/otp.provider.interface.js';
import { DevOtpProvider } from '../src/common/providers/otp/dev-otp.provider.js';

describe('Identity Module Integration Tests (End-to-End)', () => {
  let app: INestApplication;

  // In-memory mock database store for deterministic, standalone test execution
  const mockDb = {
    users: [] as any[],
    roles: [
      { id: 'role-admin-id', name: 'admin', description: 'Admin' },
      { id: 'role-customer-id', name: 'customer', description: 'Customer' },
      { id: 'role-driver-id', name: 'driver', description: 'Driver' },
    ],
    permissions: [
      { id: 'perm-users-read', name: 'users:read', resource: 'users', action: 'read' },
      { id: 'perm-settings-write', name: 'settings:write', resource: 'settings', action: 'write' },
    ],
    userRoles: [] as any[],
    rolePermissions: [
      { roleId: 'role-admin-id', permissionId: 'perm-users-read' },
      { roleId: 'role-admin-id', permissionId: 'perm-settings-write' },
    ],
    sessions: [] as any[],
    otpChallenges: [] as any[],
    settings: [
      { id: 'set-1', key: 'otp_expiry_minutes', value: { value: 5 } },
      { id: 'set-2', key: 'otp_resend_cooldown_seconds', value: { value: 60 } },
      { id: 'set-3', key: 'otp_max_attempts', value: { value: 3 } },
    ],
    regions: [{ id: 'reg-1', code: 'EG-GZ-HDA', nameAr: 'حدائق الأهرام', nameEn: 'Hadayek al-Ahram', isActive: true }],
    auditLogs: [] as any[],
    outbox: [] as any[],
  };

  const createMockQueryBuilder = () => ({
    select: (_fields?: any) => ({
      from: (table: any) => ({
        where: (_condition: any) => {
          // Return simulated query result based on context
          return {
            orderBy: () => ({
              limit: (n: number) => {
                if (table._?.name === 'otp_challenges' || table.name === 'otp_challenges') {
                  return mockDb.otpChallenges.slice(-n);
                }
                return [];
              },
            }),
            limit: (n: number) => {
              if (table._?.name === 'users' || table.name === 'users') {
                return mockDb.users.slice(0, n);
              }
              if (table._?.name === 'roles' || table.name === 'roles') {
                return mockDb.roles.slice(0, n);
              }
              if (table._?.name === 'sessions' || table.name === 'sessions') {
                return mockDb.sessions.slice(0, n);
              }
              return [];
            },
            innerJoin: () => ({
              where: () => [],
            }),
          };
        },
        orderBy: () => ({
          limit: (n: number) => mockDb.otpChallenges.slice(-n),
        }),
        limit: (n: number) => mockDb.users.slice(0, n),
        execute: async () => [{ '?column?': 1 }],
      }),
    }),
    insert: (table: any) => ({
      values: (values: any) => ({
        returning: () => {
          const item = { id: crypto.randomUUID(), ...values, createdAt: new Date() };
          if (table._?.name === 'otp_challenges' || table.name === 'otp_challenges') {
            mockDb.otpChallenges.push(item);
          }
          if (table._?.name === 'users' || table.name === 'users') {
            mockDb.users.push(item);
          }
          if (table._?.name === 'sessions' || table.name === 'sessions') {
            mockDb.sessions.push(item);
          }
          return [item];
        },
      }),
    }),
    update: (_table: any) => ({
      set: (_values: any) => ({
        where: () => {
          return [];
        },
      }),
    }),
    execute: async () => [{ '?column?': 1 }],
  });

  beforeEach(async () => {
    // Reset mock store
    mockDb.users = [
      {
        id: 'admin-user-id',
        email: 'admin@wasel.local',
        passwordHash: await bcrypt.hash('Admin@123456', 10),
        fullName: 'Admin User',
        isActive: true,
        regionId: 'reg-1',
      },
    ];
    mockDb.userRoles = [{ userId: 'admin-user-id', roleId: 'role-admin-id' }];
    mockDb.otpChallenges = [];
    mockDb.sessions = [];

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        onModuleInit: () => {},
        onModuleDestroy: () => {},
        db: createMockQueryBuilder(),
      })
      .overrideProvider(OTP_PROVIDER_TOKEN)
      .useClass(DevOtpProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'ready', 'docs'] });
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Health Endpoints', () => {
    it('GET /health returns 200 ok', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /ready returns 200 ready', async () => {
      const res = await request(app.getHttpServer()).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });
  });

  describe('Phone Normalization & OTP Challenge', () => {
    it('rejects invalid Egyptian phone numbers', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/otp/request')
        .send({ phone: '123' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('accepts valid Egyptian phone and creates challenge', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/otp/request')
        .send({ phone: '01012345678', role: 'customer' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.resendCooldownSeconds).toBe(60);
    });
  });

  describe('Admin Authentication Flow & RBAC', () => {
    it('rejects admin login with wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/admin/login')
        .send({ email: 'admin@wasel.local', password: 'WrongPassword' });

      expect(res.status).toBe(401);
    });

    it('rejects unauthorized access to protected route', async () => {
      const res = await request(app.getHttpServer()).get('/v1/auth/admin/protected-check');
      expect(res.status).toBe(401);
    });
  });
});
