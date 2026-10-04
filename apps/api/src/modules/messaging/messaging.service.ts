import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import {
  conversations,
  messages,
  agreements,
  users,
} from '../../database/schema/index.js';
import { eq, asc } from 'drizzle-orm';
import { EventBusService } from '../../common/events/event-bus.service.js';
import { AuditService } from '../audit/index.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { SendMessageDto, ErrorCode, UserRole } from '@wasel/shared';

@Injectable()
export class MessagingService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(EventBusService) private readonly eventBus: EventBusService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Inject(RedisService) private readonly redisService: RedisService,
  ) {}

  async getAgreementMessages(agreementId: string, userId: string, rolesList: string[]) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.id, agreementId))
      .limit(1);

    if (!agreement) {
      throw new NotFoundException('الاتفاق غير موجود');
    }

    const isAdmin = rolesList.includes(UserRole.ADMIN);
    const isParty = agreement.customerId === userId || agreement.driverId === userId;

    if (!isAdmin && !isParty) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك باستعراض محادثات هذا الاتفاق',
      });
    }

    const conversation = await this.getOrCreateConversation(agreement);

    if (isAdmin && !isParty) {
      await this.auditService.log({
        userId,
        action: 'admin_view_conversation',
        entityType: 'conversations',
        entityId: conversation.id,
        afterState: { agreementId },
      });
    }

    const messageList = await this.dbService.db
      .select({
        msg: messages,
        sender: {
          id: users.id,
          fullName: users.fullName,
        },
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(asc(messages.createdAt));

    return messageList.map((m) => ({
      id: m.msg.id,
      conversationId: m.msg.conversationId,
      senderId: m.msg.senderId,
      senderName: m.sender.fullName,
      content: m.msg.content,
      mediaKey: m.msg.mediaKey,
      readAt: m.msg.readAt?.toISOString() || null,
      createdAt: m.msg.createdAt.toISOString(),
    }));
  }

  async sendMessage(agreementId: string, senderId: string, dto: SendMessageDto, rolesList: string[]) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.id, agreementId))
      .limit(1);

    if (!agreement) {
      throw new NotFoundException('الاتفاق غير موجود');
    }

    const isAdmin = rolesList.includes(UserRole.ADMIN);
    const isParty = agreement.customerId === senderId || agreement.driverId === senderId;

    if (!isAdmin && !isParty) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك بإرسال رسائل في هذا الاتفاق',
      });
    }

    // Check agreement activity & grace period
    if (agreement.status !== 'active') {
      const gracePeriodMinutes = await this.settingsService.getMessagingGracePeriodMinutes();
      const agreementTime = agreement.updatedAt || agreement.createdAt;
      const elapsedMs = Date.now() - new Date(agreementTime).getTime();
      if (elapsedMs > gracePeriodMinutes * 60 * 1000) {
        throw new ForbiddenException({
          errorCode: ErrorCode.MESSAGING_EXPIRED,
          message: 'انتهت مهلة المراسلة لهذا الاتفاق بعد إغلاقه',
        });
      }
    }

    // Rate limiting via Redis
    const rateKey = `ratelimit:msg:${senderId}`;
    const currentCount = await this.redisService.incr(rateKey);
    if (currentCount === 1) {
      await this.redisService.set(rateKey, '1', 60);
    }
    const maxRate = await this.settingsService.getMessagingRateLimitPerMinute();
    if (currentCount > maxRate) {
      throw new HttpException(
        {
          errorCode: ErrorCode.RATE_LIMITED,
          message: 'تجاوزت الحد الأقصى لإرسال الرسائل، يرجى الانتظار قليلاً',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const conversation = await this.getOrCreateConversation(agreement);

    const [msg] = await this.dbService.db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        senderId,
        content: dto.content,
        mediaKey: dto.mediaKey,
      })
      .returning();

    // Determine recipient
    const recipientId = senderId === agreement.customerId ? agreement.driverId : agreement.customerId;

    await this.eventBus.publish('message.created', msg!.id, {
      messageId: msg!.id,
      conversationId: conversation.id,
      agreementId,
      senderId,
      recipientId,
      content: dto.content,
    });

    return msg;
  }

  async markMessageRead(messageId: string, userId: string) {
    const [record] = await this.dbService.db
      .select({
        msg: messages,
        conv: conversations,
        agr: agreements,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .innerJoin(agreements, eq(conversations.orderId, agreements.orderId))
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!record) {
      throw new NotFoundException('الرسالة غير موجودة');
    }

    const isParticipant =
      record.agr.customerId === userId || record.agr.driverId === userId;

    if (!isParticipant) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك بالاطلاع على هذه المحادثة',
      });
    }

    if (record.msg.senderId === userId) {
      return { success: true };
    }

    await this.dbService.db
      .update(messages)
      .set({ readAt: new Date() })
      .where(eq(messages.id, messageId));

    return { success: true };
  }

  private async getOrCreateConversation(agreement: any) {
    const [existing] = await this.dbService.db
      .select()
      .from(conversations)
      .where(eq(conversations.orderId, agreement.orderId))
      .limit(1);

    if (existing) return existing;

    const [created] = await this.dbService.db
      .insert(conversations)
      .values({
        orderId: agreement.orderId,
        customerId: agreement.customerId,
        driverId: agreement.driverId,
        isActive: true,
      })
      .returning();

    return created!;
  }
}
