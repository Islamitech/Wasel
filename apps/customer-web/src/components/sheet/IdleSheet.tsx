import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button.js';
import { Search, MapPin, X } from 'lucide-react';
import { PlaceDto } from '@wasel/api-client';

interface IdleSheetProps {
  onOpenActionMenu: () => void;
  onSelectPlace: (place: PlaceDto) => void;
  places: PlaceDto[];
}

export const IdleSheet: React.FC<IdleSheetProps> = ({
  onOpenActionMenu,
  onSelectPlace,
  places,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaceDto[]>([]);

  useEffect(() => {
    const hintDismissed = localStorage.getItem('wasel_hint_longpress_dismissed');
    if (!hintDismissed) {
      setShowHint(true);
    }
  }, []);

  const dismissHint = () => {
    setShowHint(false);
    localStorage.setItem('wasel_hint_longpress_dismissed', 'true');
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const filtered = places.filter(
      (p) =>
        p.nameAr.toLowerCase().includes(q) ||
        (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)),
    );
    setSearchResults(filtered.slice(0, 5));
  }, [searchQuery, places]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* One-time hint */}
      {showHint && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: 'var(--color-chip, #eef3ef)',
            borderRadius: 'var(--radius-sm, 14px)',
            color: 'var(--color-ink, #12302b)',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={18} color="var(--color-accent, #f2a20c)" />
            <span>نصيحة: اضغط مطولاً على أي نقطة على الخريطة لتحديد طلبك مباشرة</span>
          </div>
          <button
            type="button"
            onClick={dismissHint}
            aria-label="إغلاق التلميح"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '4px',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search box alternative */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 14px',
            height: '48px',
            borderRadius: 'var(--radius-sm, 14px)',
            border: '1.5px solid #d1d5db',
            backgroundColor: 'var(--color-sheet, #ffffff)',
          }}
        >
          <Search size={18} color="#6b7280" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن متجر، صيدلية، أو مكان بحدائق الأهرام..."
            aria-label="البحث عن الأماكن"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--font-family)',
              fontSize: '0.95rem',
              color: 'var(--color-ink, #12302b)',
              backgroundColor: 'transparent',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <X size={16} color="#6b7280" />
            </button>
          )}
        </div>

        {/* Autocomplete results dropdown */}
        {searchResults.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: '54px',
              left: 0,
              right: 0,
              backgroundColor: 'var(--color-sheet, #ffffff)',
              borderRadius: 'var(--radius-sm, 14px)',
              boxShadow: '0 -4px 16px rgba(0,0,0,0.12)',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              zIndex: 100,
            }}
          >
            {searchResults.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  onSelectPlace(p);
                  setSearchQuery('');
                }}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.nameAr}</div>
                  {p.addressText && (
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{p.addressText}</div>
                  )}
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-accent, #f2a20c)', fontWeight: 600 }}>
                  تحديد
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Primary single button */}
      <Button
        variant="primary"
        onClick={onOpenActionMenu}
        style={{
          minHeight: '52px',
          height: '56px',
          fontSize: '1.15rem',
          fontWeight: 700,
          backgroundColor: 'var(--color-ink, #12302b)',
        }}
      >
        ماذا تحتاج؟
      </Button>
    </div>
  );
};
