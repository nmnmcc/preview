import { cn } from "~/lib/utils";

export const PreviewMark = ({ className }: { readonly className?: string }) => (
  <svg
    aria-hidden="true"
    className={cn("size-7", className)}
    fill="none"
    viewBox="0 0 32 32"
  >
    <rect fill="currentColor" height="32" rx="9" width="32" />
    <path
      d="M10 9.5h7.2c3.7 0 6.3 2.2 6.3 5.6s-2.6 5.7-6.3 5.7h-2.8v3.7H10v-15Zm6.7 7.8c1.5 0 2.4-.8 2.4-2.2 0-1.3-.9-2.1-2.4-2.1h-2.3v4.3h2.3Z"
      fill="white"
    />
    <circle cx="23.5" cy="23.5" fill="#c4b5fd" r="2.5" />
  </svg>
);
