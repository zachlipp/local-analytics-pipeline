/**
 * Where to get the file this node wants.
 *
 * Opens in a new tab so the pipeline the user is filling in doesn't get
 * navigated away from — losing every upload already made.
 */
export function SourceLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      // nodrag keeps React Flow from treating a click on this as the start of
      // a node drag; it's inert in the slides and harmless there.
      className={`dag-source nodrag ${className ?? ""}`}
      href={href}
      target="_blank"
      rel="noreferrer"
      // The canvas dismisses a pinned edge bundle on click, and the slides
      // sit inside a control — neither should react to following a link.
      onClick={(e) => e.stopPropagation()}
    >
      {label(href)}
    </a>
  );
}

/**
 * A full URL is too long for a node box, and the host alone doesn't say which
 * file it is, so this shows the filename with its host as context.
 */
function label(href: string): string {
  try {
    const url = new URL(href);
    const file = url.pathname.split("/").filter(Boolean).pop();
    return file ? `${url.host}/…/${file}` : url.host;
  } catch {
    return href;
  }
}
