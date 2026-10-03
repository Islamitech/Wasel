export interface ThemeTokens {
  ink: string;
  accent: string;
  ok: string;
  sheet: string;
  chip: string;
  fontFamily: string;
  radii: {
    sm: string;
    md: string;
    lg: string;
  };
  minTouchTarget: string;
}

export const lightTokens: ThemeTokens = {
  ink: '#12302b',
  accent: '#f2a20c',
  ok: '#1f8a5b',
  sheet: '#ffffff',
  chip: '#eef3ef',
  fontFamily: "'Cairo', 'Tahoma', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  radii: {
    sm: '14px',
    md: '18px',
    lg: '24px',
  },
  minTouchTarget: '52px',
};

export const darkTokens: ThemeTokens = {
  ink: '#eaf2ee',
  accent: '#f2a20c',
  ok: '#1f8a5b',
  sheet: '#17211e',
  chip: '#22302b',
  fontFamily: "'Cairo', 'Tahoma', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  radii: {
    sm: '14px',
    md: '18px',
    lg: '24px',
  },
  minTouchTarget: '52px',
};

export const cssTokens = `
:root {
  --color-ink: ${lightTokens.ink};
  --color-accent: ${lightTokens.accent};
  --color-ok: ${lightTokens.ok};
  --color-sheet: ${lightTokens.sheet};
  --color-chip: ${lightTokens.chip};
  --font-family: ${lightTokens.fontFamily};
  --radius-sm: ${lightTokens.radii.sm};
  --radius-md: ${lightTokens.radii.md};
  --radius-lg: ${lightTokens.radii.lg};
  --min-touch-target: ${lightTokens.minTouchTarget};
  --direction: rtl;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-ink: ${darkTokens.ink};
    --color-sheet: ${darkTokens.sheet};
    --color-chip: ${darkTokens.chip};
  }
}

[data-theme="dark"] {
  --color-ink: ${darkTokens.ink};
  --color-sheet: ${darkTokens.sheet};
  --color-chip: ${darkTokens.chip};
}
`;
