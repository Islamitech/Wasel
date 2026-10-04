import React, { useState, useEffect, useRef } from 'react';
import { MessageResponseDto } from '@wasel/api-client';
import { X, Send } from 'lucide-react';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: MessageResponseDto[];
  currentUserId: string;
  onSendMessage: (text: string) => Promise<void>;
  driverName?: string;
}

export const ChatModal: React.FC<ChatModalProps> = ({
  isOpen,
  onClose,
  messages,
  currentUserId,
  onSendMessage,
  driverName,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;
    const text = inputText;
    setInputText('');
    setIsSending(true);
    try {
      await onSendMessage(text);
    } catch {
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          height: '75vh',
          backgroundColor: 'var(--color-sheet, #ffffff)',
          borderTopLeftRadius: 'var(--radius-lg, 24px)',
          borderTopRightRadius: 'var(--radius-lg, 24px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>
              محادثة مع الكابتن {driverName || 'معتمد'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-ok, #1f8a5b)', fontWeight: 600 }}>
              محادثة مباشرة مؤمنة للمشوار الحالي
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق المحادثة"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Messages Feed */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '40px', fontSize: '0.9rem' }}>
              لا توجد رسائل سابقة. يمكنك إرسال تعليمات إضافية للكابتن هنا.
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.senderId === currentUserId;
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    backgroundColor: isMe ? 'var(--color-ink, #12302b)' : 'var(--color-chip, #eef3ef)',
                    color: isMe ? '#ffffff' : 'var(--color-ink, #12302b)',
                    padding: '10px 14px',
                    borderRadius: '16px',
                    borderBottomRightRadius: isMe ? '4px' : '16px',
                    borderBottomLeftRadius: isMe ? '16px' : '4px',
                    fontSize: '0.95rem',
                    lineHeight: 1.4,
                  }}
                >
                  <div>{m.content}</div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: isMe ? '#cbd5e1' : '#6b7280',
                      textAlign: 'left',
                      marginTop: '4px',
                    }}
                  >
                    {new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={handleSend}
          style={{
            padding: '12px 16px calc(16px + var(--safe-bottom, 0px)) 16px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="اكتب رسالتك للكابتن..."
            aria-label="نص الرسالة"
            style={{
              flex: 1,
              height: '48px',
              padding: '0 14px',
              borderRadius: 'var(--radius-sm, 14px)',
              border: '1.5px solid #d1d5db',
              fontFamily: 'var(--font-family)',
              fontSize: '0.95rem',
              outline: 'none',
              backgroundColor: 'var(--color-sheet, #ffffff)',
              color: 'var(--color-ink, #12302b)',
            }}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            aria-label="إرسال الرسالة"
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-sm, 14px)',
              border: 'none',
              backgroundColor: 'var(--color-ink, #12302b)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: !inputText.trim() || isSending ? 'not-allowed' : 'pointer',
              opacity: !inputText.trim() || isSending ? 0.5 : 1,
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};
