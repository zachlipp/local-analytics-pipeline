/**
 * The spin lives in the SVG rather than a keyframes rule, so dropping this in
 * needs no matching stylesheet entry. It inherits the caller's colour.
 */
export function Spinner({ label = "Working" }: { label?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" role="status" aria-label={label}>
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 8 8"
          to="360 8 8"
          dur="0.7s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}
