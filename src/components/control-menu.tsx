'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

export function ControlMenu({ label, children, icon = 'more', className = '' }: {
  label: string; children: ReactNode; icon?: 'more' | 'settings'; className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 12, left: 12 });
  const reposition = useCallback(() => {
    if (!trigger.current || !panel.current) return;
    const button = trigger.current.getBoundingClientRect();
    const bounds = panel.current.getBoundingClientRect();
    setPosition({ top: Math.max(12, Math.min(button.bottom + 6, window.innerHeight - bounds.height - 12)), left: Math.max(12, Math.min(button.right - bounds.width, window.innerWidth - bounds.width - 12)) });
  }, []);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [open, reposition]);
  return <>
    <button ref={trigger} type="button" className="icon-button" popoverTarget={id} aria-label={label} title={label} aria-expanded={open}><Icon name={icon} /></button>
    <div ref={panel} id={id} popover="auto" className={`control-menu ${className}`} style={position} role="group" aria-label={label} onToggle={event => {
      const visible = event.newState === 'open'; setOpen(visible);
      if (visible) reposition();
    }}>
      {children}
      <button className="popover-close" type="button" popoverTarget={id} popoverTargetAction="hide">Fechar</button>
    </div>
  </>;
}
