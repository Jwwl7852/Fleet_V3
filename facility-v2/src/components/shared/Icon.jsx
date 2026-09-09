const paths = {
  dashboard: <><path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10M10 20v-6h4v6"/></>,
  building: <><path d="M5 21V5h10v16M15 9h4v12M3 21h18"/><path d="M8 8h1m3 0h1m-5 4h1m3 0h1m-5 4h1m3 0h1"/></>,
  installation: <><path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L4 17l3 3 8.3-8.3a4 4 0 0 0 5-5L18 9l-3-3 2.3-2.3"/></>,
  report: <><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/></>,
  queue: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="7" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="17" cy="18" r="1"/></>,
  tasks: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 2 2 5-6"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  service: <><path d="M20 7h-4V3M4 17h4v4"/><path d="M18.7 5.3A8 8 0 0 0 5.3 18.7M5.3 5.3A8 8 0 0 1 18.7 18.7"/></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/></>,
  document: <><path d="M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h6"/></>,
  mobile: <><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  invoice: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4"/></>,
  fleet: <><path d="M3 16V8l2-4h12l3 7v5"/><path d="M5 16h14v3H5z"/><circle cx="7" cy="19" r="1"/><circle cx="17" cy="19" r="1"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  collapse: <path d="m15 18-6-6 6-6"/>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  external: <><path d="M14 3h7v7M10 14 21 3"/><path d="M18 13v8H3V6h8"/></>,
  info: <><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/></>,
};

export function Icon({ name, size = 20, className = '' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] ?? paths.info}
    </svg>
  );
}
