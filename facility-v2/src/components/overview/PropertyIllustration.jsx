export function PropertyIllustration({ variant = 'office' }) {
  const palettes = {
    office: ['#d8eef1', '#7595a3', '#eff7f8'],
    harbour: ['#dbeaf2', '#6d8798', '#c8e7ec'],
    garden: ['#e2efdf', '#718e78', '#d8e9ed'],
    city: ['#e4e7ef', '#727f98', '#cfedf0'],
  };
  const [sky, building, accent] = palettes[variant] ?? palettes.office;
  return (
    <svg className="property-illustration" viewBox="0 0 320 170" role="img" aria-label="Neutral ejendomsillustration">
      <rect width="320" height="170" fill={sky} />
      <circle cx="276" cy="35" r="20" fill="#fff" opacity=".7" />
      <path d="M0 132 70 112l60 18 78-25 112 27v38H0Z" fill="#afc7bd" />
      <path d="M52 54h208v92H52z" fill={building} />
      <path d="M70 36h172v110H70z" fill="#f8fbfc" />
      <path d="M82 50h34v23H82zm47 0h34v23h-34zm47 0h34v23h-34zm47 0h8v23h-8zM82 84h34v23H82zm47 0h34v23h-34zm47 0h34v23h-34zm47 0h8v23h-8z" fill={accent} />
      <path d="M82 119h34v27H82zm47 0h34v27h-34zm47 0h34v27h-34zm47 0h8v27h-8z" fill="#bed9de" />
      <path d="M0 146h320v24H0z" fill="#e7edef" />
    </svg>
  );
}
