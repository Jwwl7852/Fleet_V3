const paths = {
  dashboard: ["M3 11l9-8 9 8", "M5 10v10h14V10", "M9 20v-6h6v6"],
  unit: ["M5 17h14l-1.5-7h-11z", "M7 17v2", "M17 17v2", "M7.5 14h.01", "M16.5 14h.01"],
  report: ["M6 3h9l3 3v15H6z", "M9 11h6", "M9 15h6", "M9 7h3"],
  queue: ["M4 5h16v14H4z", "M8 9h8", "M8 13h5", "M8 17h7"],
  workshop: ["M14.7 6.3a4 4 0 01-5 5L4 17l3 3 5.7-5.7a4 4 0 005-5l-3 3-3-3z"],
  service: ["M12 2l2 2 3-.4.4 3L20 8l-1.4 2.6.4 3-3 .4-2 2-2 3-2-3-3-.4.4-3L4 8l2.6-1.4.4-3 3 .4z", "M12 9a3 3 0 100 6 3 3 0 000-6z"],
  map: ["M4 6l5-3 6 3 5-3v15l-5 3-6-3-5 3z", "M9 3v15", "M15 6v15"],
  document: ["M6 3h8l4 4v14H6z", "M14 3v5h5"],
  leasing: ["M5 3h14v18H5z", "M8 8h8", "M8 12h8", "M8 16h5"],
  mobile: ["M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2z", "M10 18h4"],
  economy: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20V7"],
  search: ["M11 19a8 8 0 100-16 8 8 0 000 16z", "M21 21l-4.35-4.35"],
  building: ["M4 21V5l8-3 8 3v16", "M8 9h.01", "M12 9h.01", "M16 9h.01", "M8 13h.01", "M12 13h.01", "M16 13h.01", "M9 21v-4h6v4"],
  bell: ["M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  chevron: ["M9 18l6-6-6-6"],
  down: ["M6 9l6 6 6-6"],
  check: ["M20 6L9 17l-5-5"],
  wrench: ["M14.7 6.3a4 4 0 01-5 5L4 17l3 3 5.7-5.7a4 4 0 005-5l-3 3-3-3z"],
  warning: ["M12 3L2 21h20z", "M12 9v5", "M12 18h.01"],
  external: ["M14 3h7v7", "M10 14L21 3", "M21 14v7H3V3h7"],
  weather: ["M17.5 19H7a5 5 0 010-10 7 7 0 0113.4 2.8A3.7 3.7 0 0117.5 19z", "M8 4V2", "M3.8 6.2L2.4 4.8", "M12.2 6.2l1.4-1.4"],
  leaf: ["M20 4C12 4 5 8 5 16c4 1 8-1 11-4", "M5 20c2-6 6-9 15-16"],
  info: ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 10v6", "M12 7h.01"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  plus: ["M12 5v14", "M5 12h14"],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"],
  table: ["M4 5h16v14H4z", "M4 10h16", "M4 15h16", "M9 5v14"],
  grid: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  edit: ["M4 20h4l11-11-4-4L4 16z", "M13.5 6.5l4 4"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  filter: ["M3 5h18l-7 8v6l-4 2v-8z"],
  odometer: ["M4 16a8 8 0 1116 0", "M12 16l4-5", "M7 16h.01", "M17 16h.01"],
  battery: ["M6 5h11v16H6z", "M9 2h5v3", "M9 9h5v8H9z"],
  pin: ["M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1116 0z", "M12 7a3 3 0 100 6 3 3 0 000-6z"],
  user: ["M20 21a8 8 0 00-16 0", "M12 13a5 5 0 100-10 5 5 0 000 10z"],
  clock: ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 6v6l4 2"],
  shield: ["M12 3l8 4v5c0 5-3 8-8 10-5-2-8-5-8-10V7z"],
  fuel: ["M5 3h9v18H5z", "M8 7h3", "M14 8h2l3 3v8a2 2 0 01-4 0v-4"],
};

export function Icon({ name, size = 20, strokeWidth = 1.8, className = "", title }) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]?.map((path, index) => (
        <path key={`${name}-${index}`} d={path} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
      ))}
    </svg>
  );
}
