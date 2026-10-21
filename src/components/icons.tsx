import type { SVGProps } from 'react';

const paths = {
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
  headphones: <><path d="M3 14v-2a9 9 0 0118 0v2" /><rect x="3" y="12" width="4" height="9" rx="2" /><rect x="17" y="12" width="4" height="9" rx="2" /></>,
  headphonesOff: <><path d="m3 3 18 18M3 14v-2a9 9 0 012-5M9 3.5A9 9 0 0121 12v3" /><rect x="3" y="12" width="4" height="9" rx="2" /><path d="M17 17v2a2 2 0 002 2" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8" /></>,
  micOff: <><path d="m3 3 18 18M9 9v2a3 3 0 005 2M9 5V4a3 3 0 016 0v5M5 10v2a7 7 0 0012 5M19 10v2M12 19v3M8 22h8" /></>,
  audioOff: <><path d="m11 4-6 5H2v6h3l6 5V4ZM16 9l6 6m0-6-6 6" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  settings: <><path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="18" r="2" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  attachment: <path d="m8 12 7-7a4 4 0 016 6L10 22a6 6 0 01-8-8L13 3m-8 14 9-9" />,
  screen: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4M7 21h10M12 13V7m-3 3 3-3 3 3" /></>,
  audio: <><path d="m11 4-6 5H2v6h3l6 5V4ZM15 8a6 6 0 010 8M18 5a10 10 0 010 14" /></>,
  leave: <><path d="M9 3H3v18h6M8 12h14m-5-5 5 5-5 5" /></>,
  expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
  send: <path d="m3 3 19 9-19 9 4-9-4-9ZM7 12h15" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 018 0v4M12 14v3" /></>,
};
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
export function Brand() {
  return <span className="brand"><span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span><span>Blueprint <strong>Room</strong></span></span>;
}
