interface BadgeProps {
  label: string;
  color?: string;
  selected?: boolean;
}

export function Badge({ label, color = "#0d9488", selected = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
        selected ? "ring-2 ring-offset-1 ring-offset-background" : ""
      }`}
      style={{
        borderColor: `${color}55`,
        backgroundColor: `${color}1a`,
        color,
        ...(selected ? ({ "--tw-ring-color": color } as React.CSSProperties) : {}),
      }}
    >
      {label}
    </span>
  );
}
