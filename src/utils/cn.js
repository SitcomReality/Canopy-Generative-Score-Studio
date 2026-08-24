// Joins class names, skipping falsy entries. Replaces the old clsx +
// tailwind-merge helper; tailwind merging is no longer needed without
// utility classes.
export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}
