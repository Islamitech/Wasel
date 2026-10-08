import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button.js';
import { Search, MapPin, X, ShoppingBag, Package, Truck, Compass } from 'lucide-react';
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

  const popularPlaces: PlaceDto[] = [
    {
      id: 'pop-1',
      nameAr: 'بوابة 1 (حورس)',
      latitude: 29.9805,
      longitude: 31.1150,
      isVerified: true,
      category: 'gate',
      addressText: 'طريق مصر الفيوم',
    },
    {
      id: 'pop-2',
      nameAr: 'بوابة 2 (خفرع)',
      latitude: 29.9750,
      longitude: 31.1080,
      isVerified: true,
      category: 'gate',
      addressText: 'شارع الثروة المعدنية',
    },
    {
      id: 'pop-3',
      nameAr: 'بوابة 4 (مينا)',
      latitude: 29.9850,
      longitude: 31.1250,
      isVerified: true,
      category: 'gate',
      addressText: 'الطريق الدائري',
    },
    {
      id: 'pop-4',
      nameAr: 'شارع الجيش المركزي',
      latitude: 29.9820,
      longitude: 31.1180,
      isVerified: true,
      category: 'street',
      addressText: 'حدائق الأهرام',
    },
    {
      id: 'pop-5',
      nameAr: 'شارع الثروة المعدنية',
      latitude: 29.9760,
      longitude: 31.1120,
      isVerified: true,
      category: 'street',
      addressText: 'حدائق الأهرام',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Search Input Bar */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0 16px',
            height: '52px',
            borderRadius: '16px',
            border: '1.5px solid #e2e8f0',
            backgroundColor: 'var(--color-sheet, #ffffff)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <Search size={20} color="#64748b" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن متجر، صيدلية، أو بوابة بحدائق الأهرام..."
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
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} color="#64748b" />
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {searchResults.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: '58px',
              left: 0,
              right: 0,
              backgroundColor: '#fff',
              borderRadius: '16px',
              boxShadow: '0 -8px 25px rgba(0,0,0,0.15)',
              border: '1px solid #e2e8f0',
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
                  padding: '12px 18px',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.15s ease',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-ink)' }}>{p.nameAr}</div>
                  {p.addressText && (
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>{p.addressText}</div>
                  )}
                </div>
                <span style={{ fontSize: '0.82rem', color: '#d97706', fontWeight: 700 }}>
                  تحديد المكان 📍
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Services Grid */}
      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-ink)', marginBottom: '10px' }}>
          ماذا تريد أن تفعل اليوم؟
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          <div
            onClick={onOpenActionMenu}
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '14px',
              padding: '12px 8px',
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#fef3c7',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShoppingBag size={20} />
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-ink)' }}>شراء طلبات</span>
          </div>

          <div
            onClick={onOpenActionMenu}
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '14px',
              padding: '12px 8px',
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#e0f2fe',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Package size={20} />
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-ink)' }}>استلام وتوصيل</span>
          </div>

          <div
            onClick={onOpenActionMenu}
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '14px',
              padding: '12px 8px',
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#dcfce7',
                color: '#16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Truck size={20} />
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-ink)' }}>نقل وشحن</span>
          </div>
        </div>
      </div>

      {/* Popular Shortcuts in Hadayek al-Ahram */}
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--mut)', marginBottom: '8px' }}>
          أماكن ووجهات شائعة بحدائق الأهرام:
        </div>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {popularPlaces.map((pl) => (
            <button
              key={pl.id}
              onClick={() => onSelectPlace(pl)}
              style={{
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '20px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--color-ink)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <MapPin size={13} color="#f59e0b" />
              <span>{pl.nameAr}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Helpful Hint */}
      {showHint && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            backgroundColor: 'var(--color-chip, #eef3ef)',
            borderRadius: '12px',
            color: 'var(--color-ink, #12302b)',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Compass size={18} color="var(--color-accent, #f2a20c)" />
            <span>نصيحة: اضغط مطولاً على أي نقطة على الخريطة لتحديد موقعها فوراً</span>
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
              padding: '2px',
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Primary Start CTA Button */}
      <Button
        variant="primary"
        onClick={onOpenActionMenu}
        style={{
          minHeight: '52px',
          height: '54px',
          fontSize: '1.1rem',
          fontWeight: 800,
          backgroundColor: 'var(--color-ink, #12302b)',
          color: 'var(--color-accent, #f2a20c)',
          boxShadow: '0 4px 14px rgba(18, 48, 43, 0.25)',
        }}
      >
        ماذا تحتاج؟
      </Button>
    </div>
  );
};
