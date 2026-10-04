import { z } from 'zod';

export const SendMessageSchema = z
  .object({
    content: z.string().trim().min(1, 'محتوى الرسالة لا يمكن أن يكون فارغاً').max(2000, 'الحد الأقصى للرسالة 2000 حرف').optional(),
    mediaKey: z.string().optional(),
  })
  .refine((data) => !!data.content || !!data.mediaKey, {
    message: 'يجب كتابة رسالة أو إرفاق ملف',
  });

export type SendMessageDto = z.infer<typeof SendMessageSchema>;

export const MessageResponseSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderName: z.string().optional(),
  content: z.string().nullable().optional(),
  mediaKey: z.string().nullable().optional(),
  readAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type MessageResponseDto = z.infer<typeof MessageResponseSchema>;

export const ConversationResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  driverId: z.string().uuid(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type ConversationResponseDto = z.infer<typeof ConversationResponseSchema>;
