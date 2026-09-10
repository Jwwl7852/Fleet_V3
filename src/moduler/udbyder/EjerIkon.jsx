const paths = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V21h13V10.5M9 21v-6h6v6"/></>,
  inbox: <><path d="M4 5h16l2 8v6H2v-6z"/><path d="M2 13h5l2 3h6l2-3h5"/></>,
  pipeline: <><path d="M5 20V10M12 20V4M19 20V7"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2c0-3 2-5 6-5s6 2 6 5v2M16 6c3 0 4 2 4 4s-1 3-3 3M17 14c3 0 5 2 5 5v1"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
  document: <><path d="M6 2h8l5 5v15H6z"/><path d="M14 2v6h5M9 13h6M9 17h6"/></>,
  tag: <><path d="M3 12 12 3h8v8l-9 9z"/><circle cx="16.5" cy="6.5" r="1"/></>,
  layers: <><path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
  chart: <><path d="M4 21V11M10 21V7M16 21V3M22 21H2"/><path d="m4 10 6-4 6 2 5-6"/></>,
  invoice: <><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8M8 11h8M8 16h3M15 16h1"/></>,
  undo: <><path d="M9 8H3v-6"/><path d="M3 8c3-5 9-6 14-3s6 9 3 14-9 6-14 3"/></>,
  book: <><path d="M3 4h7c2 0 3 1 3 3v14c0-2-1-3-3-3H3zM21 4h-7c-2 0-3 1-3 3v14c0-2 1-3 3-3h7z"/></>,
  link: <><path d="m10 13-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0"/><path d="m14 11 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0M8 16l8-8"/></>,
  search: <><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  sparkles: <><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4zM5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9zM19 13l.9 2.1L22 16l-2.1.9L19 19l-.9-2.1L16 16l2.1-.9z"/></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m3 6 9 7 9-7"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  info: <><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
  send: <><path d="m22 2-9 20-3-9-8-4zM10 13 22 2"/></>,
  building: <><path d="M5 21V4h11v17M16 9h4v12M8 8h2M8 12h2M8 16h2M13 8h1M13 12h1M13 16h1M3 21h19"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 2 4 3 8 3s8-1 8-3V5M4 11v6c0 2 4 3 8 3s8-1 8-3v-6"/></>,
  upload: <><path d="M12 16V3M7 8l5-5 5 5"/><path d="M4 15v6h16v-6"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  pencil: <><path d="m4 20 4-1 11-11-3-3L5 16zM14 6l3 3"/></>,
  close: <path d="M5 5l14 14M19 5 5 19"/>,
};

export default function EjerIkon({ navn, size = 24, className = "" }) {
  return <svg className={`ejer-ikon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[navn] || paths.document}</svg>;
}
