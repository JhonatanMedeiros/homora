const paths = {
  mark: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4-4" />
    </>
  ),
  contrast: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v16" />
    </>
  ),
  logout: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4Z" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  more: (
    <>
      <circle cx="12" cy="5.5" r=".6" />
      <circle cx="12" cy="12" r=".6" />
      <circle cx="12" cy="18.5" r=".6" />
    </>
  ),
  list: <path d="M4 6h16M4 12h16M4 18h16" />,
  server: (
    <>
      <rect x="4" y="4" width="16" height="6" rx="1.5" />
      <rect x="4" y="14" width="16" height="6" rx="1.5" />
      <path d="M8 7h.01M8 17h.01" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
