/** One stroke weight, one grid, no fills — so a row of them reads as one set. */
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
}

const Icon = ({ children, size = 16, ...rest }) => (
  <svg width={size} height={size} {...base} {...rest} aria-hidden="true">
    {children}
  </svg>
)

export const SearchIcon = (p) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Icon>
)

export const CloseIcon = (p) => (
  <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
)

export const ExternalIcon = (p) => (
  <Icon {...p}><path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Icon>
)

export const LinkIcon = (p) => (
  <Icon {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 6.8" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.5-1.5" /></Icon>
)

export const CopyIcon = (p) => (
  <Icon {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" /></Icon>
)

export const TrashIcon = (p) => (
  <Icon {...p}><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6" /></Icon>
)

export const ImportIcon = (p) => (
  <Icon {...p}><path d="M12 4v11M8 11l4 4 4-4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" /></Icon>
)

export const MediaIcon = (p) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 16l-5-5-6 6" /></Icon>
)

export const QuoteIcon = (p) => (
  <Icon {...p}><path d="M9 7H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3v-3M20 7h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3v-3" /></Icon>
)

export const HeartIcon = (p) => (
  <Icon {...p}><path d="M12 20s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.7 12 20 12 20z" /></Icon>
)

export const RepostIcon = (p) => (
  <Icon {...p}><path d="M17 3l3 3-3 3M20 6H8a3 3 0 0 0-3 3v2M7 21l-3-3 3-3M4 18h12a3 3 0 0 0 3-3v-2" /></Icon>
)

export const ReplyIcon = (p) => (
  <Icon {...p}><path d="M20 17a6 6 0 0 0-6-6H5M9 7l-4 4 4 4" /></Icon>
)

export const BookmarkIcon = (p) => (
  <Icon {...p}><path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4.5L5 20V5a1 1 0 0 1 1-1z" /></Icon>
)
