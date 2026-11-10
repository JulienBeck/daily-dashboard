import type { ReactElement, SVGProps } from 'react'
import type { AmpelState } from '../shared/types.js'

type IconProps = SVGProps<SVGSVGElement> & { title?: string }

const Svg = ({ title, children, ...rest }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    role={title ? 'img' : 'presentation'}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    {...rest}
  >
    {title ? <title>{title}</title> : null}
    {children}
  </svg>
)

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export const StatusGood = (props: IconProps) => (
  <Svg data-icon="good" {...props}>
    <path d="m5 12.6 4.6 4.6L19 7.4" {...stroke} strokeWidth={2.6} />
  </Svg>
)

export const StatusWarning = (props: IconProps) => (
  <Svg data-icon="warning" {...props}>
    <path d="M12 5.5v8.2" {...stroke} strokeWidth={2.6} />
    <circle cx="12" cy="18.2" r="1.5" fill="currentColor" />
  </Svg>
)

export const StatusCritical = (props: IconProps) => (
  <Svg data-icon="critical" {...props}>
    <path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6" {...stroke} strokeWidth={2.6} />
  </Svg>
)

export const StatusRunning = (props: IconProps) => (
  <Svg data-icon="running" {...props}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" {...stroke} strokeWidth={2.4} />
    <path d="M20 4.2V10h-5.8" {...stroke} strokeWidth={2.4} />
  </Svg>
)

export const StatusIdle = (props: IconProps) => (
  <Svg data-icon="idle" {...props}>
    <path d="M6.5 12h11" {...stroke} strokeWidth={2.6} />
  </Svg>
)

export const StatusWaiting = (props: IconProps) => (
  <Svg data-icon="waiting" {...props}>
    <path d="M9.2 5.5v13M14.8 5.5v13" {...stroke} strokeWidth={2.8} />
  </Svg>
)

export const STATUS_ICON: Record<AmpelState, (props: IconProps) => ReactElement> = {
  good: StatusGood,
  warning: StatusWarning,
  critical: StatusCritical,
  running: StatusRunning,
  idle: StatusIdle,
}

export const IconSprint = (props: IconProps) => (
  <Svg {...props}>
    <g {...stroke}>
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </g>
  </Svg>
)

export const IconBoard = (props: IconProps) => (
  <Svg {...props}>
    <g {...stroke}>
      <rect x="2.8" y="4.4" width="5" height="15.2" rx="1.4" />
      <rect x="9.5" y="4.4" width="5" height="10.6" rx="1.4" />
      <rect x="16.2" y="4.4" width="5" height="7" rx="1.4" />
    </g>
  </Svg>
)

export const IconBurndown = (props: IconProps) => (
  <Svg {...props}>
    <g {...stroke}>
      <path d="M3.4 3.6v16.8h17.2" />
      <path d="M5.8 6.4h3.4v3.6h3.6v4.2h3.6v4.2h3.6" />
    </g>
  </Svg>
)

export const IconMerge = (props: IconProps) => (
  <Svg {...props}>
    <g {...stroke}>
      <circle cx="6.5" cy="5.5" r="2.4" />
      <circle cx="6.5" cy="18.5" r="2.4" />
      <circle cx="17.5" cy="12" r="2.4" />
      <path d="M6.5 7.9v8.2M15.1 12h-3.3A5.3 5.3 0 0 1 6.5 6.7" />
    </g>
  </Svg>
)

export const IconPeople = (props: IconProps) => (
  <Svg {...props}>
    <g {...stroke}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.2 19.4a5.8 5.8 0 0 1 11.6 0" />
      <path d="M16 5.8a3.2 3.2 0 0 1 0 5.4M17.6 14.6a5.8 5.8 0 0 1 3.2 4.8" />
    </g>
  </Svg>
)

export const IconTimer = (props: IconProps) => (
  <Svg {...props}>
    <g {...stroke}>
      <circle cx="12" cy="13.6" r="7.6" />
      <path d="M12 9.6v4h3M9.4 2.4h5.2" />
    </g>
  </Svg>
)

export const IconFlag = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 21V4.2h11.6l-2.2 4 2.2 4H6" {...stroke} />
  </Svg>
)

export const IconChevron = (props: IconProps) => (
  <Svg {...props}>
    <path d="m9 5.5 7 6.5-7 6.5" {...stroke} strokeWidth={2.2} />
  </Svg>
)

export const IconPencil = (props: IconProps) => (
  <Svg {...props}>
    <g {...stroke}>
      <path d="M4.5 19.5h4l10-10a2.5 2.5 0 0 0-3.5-3.5l-10 10z" />
      <path d="M13.5 7.5 17 11" />
    </g>
  </Svg>
)

export const IconEpic = (props: IconProps) => (
  <Svg {...props}>
    <path d="M13.5 2.5 5 13.2h5.3l-1 8.3L18.8 10h-5.4z" {...stroke} />
  </Svg>
)

export const IconRefresh = (props: IconProps) => (
  <Svg {...props}>
    <g {...stroke}>
      <path d="M4.76 10.06a7.5 7.5 0 0 1 14.48 0" />
      <path d="M19.73 7.3 19.24 10.06 17.44 7.92" />
      <path d="M19.24 13.94a7.5 7.5 0 0 1-14.48 0" />
      <path d="M4.27 16.7 4.76 13.94 6.56 16.08" />
    </g>
  </Svg>
)

export const IconWarning = (props: IconProps) => (
  <Svg {...props}>
    <g {...stroke}>
      <path d="M10.3 4.1 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.4v4.4M12 17.2h.01" />
    </g>
  </Svg>
)

export const IconStale = (props: IconProps) => (
  <Svg {...props}>
    <g {...stroke}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3.2 2" />
    </g>
  </Svg>
)
