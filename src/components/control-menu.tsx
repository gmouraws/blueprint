'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

export function ControlMenu({ label, children, icon = 'more', className = '', triggerContent, triggerClassName = '' }: {
  label: string; children: ReactNode; icon?: 'more' | 'settings'; className?: string; triggerContent?: ReactNode; triggerClassName?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 12, left: 12 });
  const reposition = useCallback(() => {
    if (!trigger.current || !panel.current) return;
    const button = trigger.current.getBoundingClientRect();
    const above = className.includes('call-settings');
    const ceiling = trigger.current.closest('.call-controls')?.getBoundingClientRect().top ?? button.top;
    if (above) panel.current.style.maxHeight = `${Math.max(80, ceiling - 24)}px`;
    const bounds = panel.current.getBoundingClientRect();
    setPosition({ top: Math.max(12, above ? ceiling - bounds.height - 10 : Math.min(button.bottom + 6, window.innerHeight - bounds.height - 12)), left: Math.max(12, Math.min(button.right - bounds.width, window.innerWidth - bounds.width - 12)) });
  }, [className]);
  useEffect(() => {
    if (!open) return;
    const observer = new ResizeObserver(reposition); if(panel.current) observer.observe(panel.current);
    window.addEventListener('resize', reposition);
    return () => {observer.disconnect();window.removeEventListener('resize', reposition);};
  }, [open, reposition]);
  return <>
    <button ref={trigger} type="button" className={triggerContent ? triggerClassName : 'icon-button'} popoverTarget={id} aria-label={label} title={label} aria-expanded={open}>{triggerContent ?? <Icon name={icon} />}</button>
    <div ref={panel} id={id} popover="auto" className={`control-menu ${className}`} style={position} role="group" aria-label={label} onToggle={event => {
      const visible = event.newState === 'open'; setOpen(visible);
      if (visible) reposition();
    }}>
      {children}
      <button className="popover-close" type="button" popoverTarget={id} popoverTargetAction="hide">Fechar</button>
    </div>
  </>;
}
