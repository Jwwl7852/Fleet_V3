const accents = {
  vehicle: "#dce8ee",
  scooter: "#e8f7f8",
  machine: "#fff3da",
  equipment: "#edf0f3",
};

export function UnitThumbnail({ unit, large = false }) {
  const type = unit?.type || "equipment";
  return (
    <span className={`unit-thumbnail ${large ? "is-large" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 160 92">
        <rect width="160" height="92" rx="10" fill={accents[type]} />
        <ellipse cx="81" cy="76" rx="58" ry="6" fill="#8ba0ae" opacity=".2" />
        {type === "vehicle" ? (
          <g fill="none" stroke="#274258" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M24 62V40c0-4 3-7 7-7h65l17 17h19c4 0 7 3 7 7v5" fill="#fff" />
            <path d="M29 52h82l-13-14H67v14M55 34v28" />
            <circle cx="47" cy="64" r="10" fill="#263d4f" /><circle cx="118" cy="64" r="10" fill="#263d4f" />
            <circle cx="47" cy="64" r="4" stroke="#fff" /><circle cx="118" cy="64" r="4" stroke="#fff" />
          </g>
        ) : null}
        {type === "scooter" ? (
          <g fill="none" stroke="#233d51" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="45" cy="67" r="13" fill="#314b5f" /><circle cx="119" cy="67" r="13" fill="#314b5f" />
            <path d="M45 67h35l20-32h15M103 35l13 32H79l-12-28H52M111 27h12" />
            <path d="M67 39h23l-6 14H73z" fill="#087f8f" stroke="#087f8f" />
            <path d="M53 36h18" />
          </g>
        ) : null}
        {type === "machine" ? (
          <g fill="none" stroke="#263e50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="46" y="29" width="48" height="35" rx="4" fill="#fff" /><path d="M61 29V18h25l8 11M94 38h17v26H94M39 64h84" />
            <circle cx="55" cy="66" r="12" fill="#344e60" /><circle cx="106" cy="66" r="12" fill="#344e60" />
            <path d="M112 51h24M136 41v28M136 69h13" />
          </g>
        ) : null}
        {type === "equipment" ? (
          <g fill="none" stroke="#263e50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="42" y="26" width="76" height="47" rx="8" fill="#fff" /><path d="M60 26v-8h40v8M53 43h54M61 57h38" />
            <circle cx="57" cy="74" r="6" fill="#314b5f" /><circle cx="103" cy="74" r="6" fill="#314b5f" />
            <path d="M78 42v17" stroke="#087f8f" />
          </g>
        ) : null}
      </svg>
    </span>
  );
}
