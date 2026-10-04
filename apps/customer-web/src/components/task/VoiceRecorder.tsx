import React, { useState, useRef } from 'react';
import { Mic, Square, Trash2, Play, Pause } from 'lucide-react';

interface VoiceRecorderProps {
  onRecorded: (blob: Blob, url: string) => void;
  onClear: () => void;
  existingUrl?: string | null;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onRecorded, onClear, existingUrl }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(existingUrl || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        onRecorded(audioBlob, url);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      alert('يرجى السماح بالوصول إلى الميكروفون لتسجيل الملاحظة الصوتية');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const handleClear = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    setAudioUrl(null);
    setIsPlaying(false);
    onClear();
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current && audioUrl) {
      audioPlayerRef.current = new Audio(audioUrl);
      audioPlayerRef.current.onended = () => setIsPlaying(false);
    }

    if (audioPlayerRef.current) {
      if (isPlaying) {
        audioPlayerRef.current.pause();
        setIsPlaying(false);
      } else {
        audioPlayerRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  return (
    <div style={{ margin: '12px 0' }}>
      {!audioUrl && !isRecording && (
        <button
          type="button"
          onClick={startRecording}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            height: '48px',
            borderRadius: 'var(--radius-sm, 14px)',
            border: '1.5px dashed var(--color-ink, #12302b)',
            background: 'transparent',
            color: 'var(--color-ink, #12302b)',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Mic size={18} />
          تسجيل ملاحظة صوتية للكابتن
        </button>
      )}

      {isRecording && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderRadius: 'var(--radius-sm, 14px)',
            backgroundColor: '#fee2e2',
            color: '#b91c1c',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#dc2626',
                animation: 'pulse 1s infinite',
              }}
            />
            <span style={{ fontWeight: 600 }}>جاري التسجيل ({recordSeconds} ثانية)...</span>
          </div>
          <button
            type="button"
            onClick={stopRecording}
            style={{
              background: '#b91c1c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <Square size={16} />
            إيقاف
          </button>
        </div>
      )}

      {audioUrl && !isRecording && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderRadius: 'var(--radius-sm, 14px)',
            backgroundColor: 'var(--color-chip, #eef3ef)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={togglePlayback}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'var(--color-ink, #12302b)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>ملاحظة صوتية مسجلة</span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#dc2626',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="حذف التسجيل"
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}
    </div>
  );
};
