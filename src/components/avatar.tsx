'use client';
import { useState, useEffect } from 'react';
export function Avatar({ userId, name }: { userId?:string|null; name:string }) {
  const [failed,setFailed]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{ const refresh=()=>{setFailed(false);setRevision(value=>value+1);};window.addEventListener('blueprint-avatar-updated',refresh);return()=>window.removeEventListener('blueprint-avatar-updated',refresh); },[]);
  return <span className="avatar" aria-hidden="true">{userId&&!failed ? /* Authenticated dynamic image, never a public optimization URL. */
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/account/avatar?user=${encodeURIComponent(userId)}&v=${revision}`} alt="" onError={()=>setFailed(true)} width={24} height={24}/>:name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()}</span>;
}
