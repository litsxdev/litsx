export type Shape = {
  id: string;
  d: string;
};

export type SvgHostProps = {
  viewBox?: string;
  strokeWidth?: string | number;
  pathD?: string;
  hiddenFromA11y?: boolean;
  shapes?: Shape[];
};

const initialShapes: Shape[] = [
  { id: "one", d: "M2 12h20" },
  { id: "two", d: "M12 2v20" },
];

export function SvgHost({
  viewBox = "0 0 24 24",
  strokeWidth = 2,
  pathD = "M20 6 9 17l-5-5",
  hiddenFromA11y = true,
  shapes = initialShapes,
}: SvgHostProps) {
  const circleProps = {
    cx: 12,
    cy: 12,
    r: 10,
    fill: "none",
  };
  const reactNamespacedProps = {
    xlinkHref: "#shape",
    xmlLang: "en",
  };

  return (
    <article data-svg-article>
      <svg
        data-icon
        viewBox={viewBox}
        width={24}
        height={24}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={hiddenFromA11y}
      >
        <title>Check icon</title>
        <g data-group>
          <path data-primary d={pathD} />
          <circle data-spread {...circleProps} />
          <use data-namespaced-spread {...reactNamespacedProps} />
          {shapes.map((shape) => (
            <path data-dynamic={shape.id} d={shape.d} />
          ))}
        </g>
        <foreignObject data-foreign x={0} y={0} width={24} height={8}>
          {["HTML"].map((label) => <div data-html-child>{label}</div>)}
        </foreignObject>
      </svg>
    </article>
  );
}
