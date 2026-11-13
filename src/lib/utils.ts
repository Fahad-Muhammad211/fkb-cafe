/**
 * Joins class names, skipping falsy values.
 * Keeps the project free of an extra dependency like clsx.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
