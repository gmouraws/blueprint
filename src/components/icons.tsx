import type { SVGProps } from 'react';

const paths = {
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8" /></>,
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
