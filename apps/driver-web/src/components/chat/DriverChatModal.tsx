import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button.js';
import { apiClient } from '../../api.js';

interface DriverChatModalProps {
  agreementId: string;
  onClose: () => void;
}

export const DriverChatModal: React.FC<DriverChatModalProps> = ({
  agreementId,
  onClose,
}) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchMessages = () => {
      apiClient.messaging
        .list(agreementId)
        .then((msgs: any[]) => {
          if (isMounted && Array.isArray(msgs)) {
            setMessages(msgs);
          }
        })
        .catch(() => {});
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [agreementId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      await apiClient.messaging.send(agreementId, {
        content: newMessage.trim(),
      });
      setNewMessage('');
      const updated = await apiClient.messaging.list(agreementId);
      if (Array.isArray(updated)) setMessages(updated);
    } catch (err) {
      console.warn('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 1200,
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-sheet, #ffffff)',
          width: '100%',
          height: '75vh',
          borderRadius: '24px 24px 0 0',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--color-border, #e5e7eb)',
            paddingBottom: '12px',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>
            💬 المحادثة الفورية مع العميل
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق المحادثة"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.3rem',
              cursor: 'pointer',
              color: 'var(--color-ink)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Message list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '30px', fontSize: '0.9rem' }}>
              لا توجد رسائل سابقة. يمكنك إرسال رسالة توضيحية للعميل الآن.
            </div>
          ) : (
            messages.map((msg) => {
              const isDriver = msg.senderRole === 'driver';
              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: isDriver ? 'flex-start' : 'flex-end',
                    maxWidth: '80%',
                    backgroundColor: isDriver ? 'var(--color-ink)' : 'var(--color-chip)',
                    color: isDriver ? '#ffffff' : 'var(--color-ink)',
                    padding: '10px 14px',
                    borderRadius: '16px',
                    fontSize: '0.9rem',
                    lineHeight: 1.4,
                  }}
                >
                  {msg.content}
                </div>
              );
            })
          )}
        </div>

        {/* Input bar */}
        <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px', paddingTop: '10px' }}>
          <input
            type="text"
            placeholder="اكتب رسالتك للعميل..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            style={{
              flex: 1,
              height: '50px',
              padding: '0 14px',
              borderRadius: 'var(--radius-sm, 14px)',
              border: '1.5px solid var(--color-ink, #12302b)',
              fontSize: '0.95rem',
            }}
          />
          <Button
            type="submit"
            variant="primary"
            isLoading={isSending}
            style={{ width: '90px', minHeight: '50px', height: '50px' }}
          >
            إرسال
          </Button>
        </form>
      </div>
    </div>
  );
};
