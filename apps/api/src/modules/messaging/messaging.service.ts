import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import {
  conversations,
  messages,
  agreements,
  users,
} from '../../database/schema/index.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import { EventBusService } from '../../common/events/event-bus.service.js';
import { SendMessageDto, ErrorCode, UserRole } from '@wasel/shared';

@Injectable()
export class MessagingService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(EventBusService) private readonly eventBus: EventBusService,
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
      throw new ForbiddenException('غير مصرح لك بإرسال رسائل في هذا الاتفاق');
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
    const [updated] = await this.dbService.db
      .update(messages)
      .set({ readAt: new Date() })
      .where(and(eq(messages.id, messageId), sql`${messages.senderId} <> ${userId}::uuid`))
      .returning();

    return { success: !!updated };
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
