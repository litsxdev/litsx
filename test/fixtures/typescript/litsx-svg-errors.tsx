export const InvalidSvgFixture = () => (
  <svg>
    {/* @ts-expect-error path-only data is not a circle attribute */}
    <circle d="M0 0" />
    {/* @ts-expect-error unknown SVG attributes must not be accepted globally */}
    <path mysterySvgAttribute="nope" />
    {/* @ts-expect-error SVG lengths do not accept arbitrary objects */}
    <rect width={{ value: 20 }} />
    {/* @ts-expect-error linecap is a closed SVG keyword set */}
    <path strokeLinecap="curved" />
  </svg>
);
