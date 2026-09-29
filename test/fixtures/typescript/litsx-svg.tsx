import { createRef } from "@litsx/core";

const svgRef = createRef<SVGSVGElement>();
const pathRef = createRef<SVGPathElement>();
const viewBox: string | undefined = "0 0 24 24";
const strokeWidth: string | number = 2;
const hidden: boolean = true;
const shapes = [{ d: "M20 6 9 17l-5-5" }, { d: "M4 12h16" }];

export const SvgFixture = () => (
  <article>
    <svg
      ref={svgRef}
      class="icon"
      style={{ color: "tomato" }}
      viewBox={viewBox}
      width={24}
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={hidden}
    >
      <title>Check</title>
      <defs>
        <clipPath id="clip"><rect x={0} y={0} width={24} height={24} rx={2} ry={2} /></clipPath>
        <mask id="mask" maskUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="white" /></mask>
      </defs>
      <g clipPath="url(#clip)">
        <path ref={pathRef} d="M20 6 9 17l-5-5" />
        <circle cx={12} cy={12} r={10} />
        <ellipse cx="12" cy="12" rx={10} ry={6} />
        <line x1={2} y1={2} x2={22} y2={22} />
        <polygon points="12,2 22,22 2,22" />
        <polyline points="2,12 8,18 22,4" />
        <use href="#shape" x={1} y={1} width={20} height={20} />
        {shapes.map((shape) => <path d={shape.d} />)}
      </g>
      <foreignObject x={0} y={0} width={24} height={24}>
        <div class="html-child">HTML</div>
      </foreignObject>
    </svg>
  </article>
);
