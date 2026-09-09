/** Inline stroke icons — no icon dependency, consistent 1.8px weight. */
import type { SVGProps } from 'react';

const base = {
  width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

type P = SVGProps<SVGSVGElement>;

export const IconDashboard = (p: P) => (<svg {...base} {...p}><path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-5H3zM13 8h8V3h-8z" /></svg>);
export const IconLedger = (p: P) => (<svg {...base} {...p}><path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z" /><path d="M8 8h7M8 12h7M8 16h4" /></svg>);
export const IconSparkles = (p: P) => (<svg {...base} {...p}><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>);
export const IconInbox = (p: P) => (<svg {...base} {...p}><path d="M4 13h4l1.5 3h5L16 13h4" /><path d="M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /></svg>);
export const IconChart = (p: P) => (<svg {...base} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>);
export const IconWallet = (p: P) => (<svg {...base} {...p}><path d="M3 7a2 2 0 0 1 2-2h12v4" /><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H5a2 2 0 0 1-2-2z" /><circle cx="17" cy="14" r="1.2" /></svg>);
export const IconTarget = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>);
export const IconBudget = (p: P) => (<svg {...base} {...p}><path d="M12 3v9l6.5 3.8" /><circle cx="12" cy="12" r="9" /></svg>);
export const IconReport = (p: P) => (<svg {...base} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>);
export const IconSettings = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>);
export const IconPlus = (p: P) => (<svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>);
export const IconSearch = (p: P) => (<svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const IconCheck = (p: P) => (<svg {...base} {...p}><path d="m20 6-11 11-5-5" /></svg>);
export const IconX = (p: P) => (<svg {...base} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>);
export const IconEdit = (p: P) => (<svg {...base} {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>);
export const IconTrash = (p: P) => (<svg {...base} {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>);
export const IconCamera = (p: P) => (<svg {...base} {...p}><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></svg>);
export const IconSun = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const IconMoon = (p: P) => (<svg {...base} {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8" /></svg>);
export const IconArrowUp = (p: P) => (<svg {...base} {...p}><path d="M12 19V5M5 12l7-7 7 7" /></svg>);
export const IconArrowDown = (p: P) => (<svg {...base} {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></svg>);
export const IconAlert = (p: P) => (<svg {...base} {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>);
export const IconInfo = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>);
export const IconTrendUp = (p: P) => (<svg {...base} {...p}><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>);
export const IconImport = (p: P) => (<svg {...base} {...p}><path d="M12 3v10M8 9l4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>);
export const IconDownload = (p: P) => (<svg {...base} {...p}><path d="M12 3v12M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>);
export const IconFilter = (p: P) => (<svg {...base} {...p}><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>);
export const IconChevron = (p: P) => (<svg {...base} {...p}><path d="m9 18 6-6-6-6" /></svg>);
export const IconMessage = (p: P) => (<svg {...base} {...p}><path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-4.6A8 8 0 0 1 13 4a8 8 0 0 1 8 8z" /></svg>);
export const IconShield = (p: P) => (<svg {...base} {...p}><path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>);
