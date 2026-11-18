import type { ReactNode } from 'react'
import type { ItemDef, Slot } from '../../../shared/avatar.js'

const SKIN = '#d9a273'
const SKIN_SHADE = '#b5804f'
const HAIR = '#4a3020'
const LINEN = '#cdbb94'
const INK = '#2a1c10'

const MIRROR = 'translate(200 0) scale(-1 1)'

export type Worn = Partial<Record<Slot, ItemDef>>

const outline = { stroke: 'rgba(20,12,6,0.55)', strokeWidth: 0.8 } as const

export function taper(d: string, width: number, end = width * 0.8): string {
  const [x1, y1, x2, y2] = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number) as [number, number, number, number]
  const length = Math.hypot(x2 - x1, y2 - y1) || 1
  const nx = -(y2 - y1) / length
  const ny = (x2 - x1) / length
  const p = (x: number, y: number, w: number, sign: number) =>
    `${(x + (nx * w * sign) / 2).toFixed(2)} ${(y + (ny * w * sign) / 2).toFixed(2)}`
  return [
    `M${p(x1, y1, width, 1)}`,
    `L${p(x2, y2, end, 1)}`,
    `A${(end / 2).toFixed(2)} ${(end / 2).toFixed(2)} 0 0 0 ${p(x2, y2, end, -1)}`,
    `L${p(x1, y1, width, -1)}`,
    `A${(width / 2).toFixed(2)} ${(width / 2).toFixed(2)} 0 0 0 ${p(x1, y1, width, 1)}`,
    'Z',
  ].join(' ')
}

function Limb({ d, width, colour, end }: { d: string; width: number; colour: string; end?: number }) {
  return <path d={taper(d, width, end)} fill={colour} stroke="rgba(20,12,6,0.55)" strokeWidth={0.8} />
}

function Rivet({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={1.2} fill="#e6e0d0" stroke="rgba(20,12,6,0.5)" strokeWidth={0.4} />
}

export function Legs({ item }: { item?: ItemDef }) {
  if (!item) return null
  if (item.kind === 'greaves') {
    return (
      <g data-part="legs">
        <path d="M74 164 L126 164 L124 200 L76 200 Z" fill={item.secondary} {...outline} />
        <Limb d="M89 196 L86 256" width={25} colour={item.secondary} />
        <Limb d="M111 196 L114 256" width={25} colour={item.secondary} />
        <Limb d="M86 254 L86 300" width={19} colour={item.secondary} />
        <Limb d="M114 254 L114 300" width={19} colour={item.secondary} />
        {[0, 1].map((side) => (
          <g key={side} transform={side ? MIRROR : undefined}>
            <rect x={77} y={202} width={22} height={44} rx={6} fill={item.primary} {...outline} />
            <path d="M80 210 L96 210 M80 222 L96 222 M80 234 L96 234" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
            <circle cx={86} cy={256} r={9} fill={item.primary} {...outline} />
            <circle cx={84} cy={253} r={3} fill="rgba(255,255,255,0.45)" />
            <rect x={78} y={265} width={16} height={36} rx={5} fill={item.primary} {...outline} />
            <path d="M86 268 L86 298" stroke="rgba(255,255,255,0.4)" strokeWidth={1.4} />
          </g>
        ))}
      </g>
    )
  }
  return (
    <g data-part="legs">
      <path d="M74 164 L126 164 L124 202 L76 202 Z" fill={item.primary} {...outline} />
      <Limb d="M89 196 L86 256" width={26} colour={item.primary} />
      <Limb d="M111 196 L114 256" width={26} colour={item.primary} />
      <Limb d="M86 254 L86 302" width={20} colour={item.primary} />
      <Limb d="M114 254 L114 302" width={20} colour={item.primary} />
      <path d="M100 172 L100 204" stroke="rgba(0,0,0,0.3)" strokeWidth={1.2} />
      <path d="M80 250 Q86 254 92 250 M108 250 Q114 254 120 250" stroke="rgba(0,0,0,0.3)" strokeWidth={1.2} fill="none" />
      <rect x={74} y={163} width={52} height={6} fill={item.secondary} {...outline} />
    </g>
  )
}

export function Boots({ item }: { item?: ItemDef }) {
  if (!item) return null
  return (
    <g data-part="boots">
      {[0, 1].map((side) => (
        <g key={side} transform={side ? MIRROR : undefined}>
          <Limb d="M86 286 L86 314" width={21} colour={item.primary} />
          <ellipse cx={83} cy={322} rx={13} ry={7.5} fill={item.primary} {...outline} />
          {item.kind === 'sabatons' ? (
            <>
              <path d="M73 320 Q83 315 95 320 M74 324 Q83 319 94 324" stroke="rgba(0,0,0,0.35)" strokeWidth={1} fill="none" />
              <circle cx={86} cy={300} r={3} fill="rgba(255,255,255,0.4)" />
              <rect x={74} y={282} width={24} height={7} rx={2} fill={item.secondary} {...outline} />
            </>
          ) : (
            <>
              <rect x={74} y={282} width={24} height={8} rx={3} fill={item.secondary} {...outline} />
              <path d="M78 296 L94 296" stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
            </>
          )}
        </g>
      ))}
    </g>
  )
}

export function Chest({ item }: { item?: ItemDef }) {
  if (!item) return null
  const fill = item.kind === 'mail' ? 'url(#avatar-mail)' : item.primary
  return (
    <g data-part="chest">
      <path d="M63 88 Q100 79 137 88 L131 134 Q129 160 127 186 L73 186 Q71 160 69 134 Z" fill={item.primary} {...outline} />
      {item.kind === 'mail' ? (
        <path d="M63 88 Q100 79 137 88 L131 134 Q129 160 127 186 L73 186 Q71 160 69 134 Z" fill={fill} />
      ) : (
        <path d="M90 84 L100 104 L110 84" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={1.6} />
      )}
      <path d="M84 120 Q100 126 116 120" stroke="rgba(0,0,0,0.2)" strokeWidth={1.2} fill="none" />
      <rect x={72} y={164} width={56} height={8} fill={item.secondary} {...outline} />
      <rect x={95} y={163} width={10} height={10} rx={1.5} fill="#c9a24a" stroke="rgba(20,12,6,0.6)" strokeWidth={0.8} />
    </g>
  )
}

export function Sleeve({ item }: { item?: ItemDef }) {
  if (!item) return null
  return item.kind === 'mail' ? (
    <>
      <Limb d="M66 92 L58 150" width={19} colour={item.primary} />
      <path d={taper('M66 92 L58 150', 19)} fill="url(#avatar-mail)" />
      <Limb d="M58 150 L57 170" width={17} colour={item.primary} />
    </>
  ) : (
    <Limb d="M66 92 L60 128" width={20} colour={item.primary} />
  )
}

export function Glove({ item }: { item?: ItemDef }) {
  if (!item) return null
  if (item.kind === 'gauntlets') {
    return (
      <g data-part="gloves">
        <path d="M48 186 L66 186 L64 206 L50 206 Z" fill={item.primary} {...outline} />
        <circle cx={56} cy={214} r={9.5} fill={item.primary} {...outline} />
        <path d="M50 213 L62 213 M50 217 L62 217" stroke="rgba(0,0,0,0.35)" strokeWidth={0.9} />
        <circle cx={53} cy={210} r={2.4} fill="rgba(255,255,255,0.45)" />
        <rect x={47} y={184} width={20} height={4} rx={1} fill={item.secondary} {...outline} />
      </g>
    )
  }
  return (
    <g data-part="gloves">
      <Limb d="M57 192 L56 206" width={16} colour={item.primary} />
      <circle cx={56} cy={214} r={9} fill={item.primary} {...outline} />
      <rect x={48} y={190} width={16} height={4} rx={1.5} fill={item.secondary} {...outline} />
    </g>
  )
}

export function Shoulder({ item }: { item?: ItemDef }) {
  if (!item) return null
  if (item.kind === 'pauldrons') {
    return (
      <g data-part="shoulders">
        <path d="M46 104 Q44 80 68 78 Q84 80 84 92 Q70 92 60 106 Z" fill={item.primary} {...outline} />
        <path d="M48 110 Q48 94 62 92 Q72 94 74 100 Q62 102 56 114 Z" fill={item.primary} {...outline} />
        <path d="M50 116 Q52 104 62 104 Q68 106 68 110 Q60 112 56 120 Z" fill={item.primary} {...outline} />
        <path d="M52 92 Q60 82 74 84" stroke="rgba(255,255,255,0.5)" strokeWidth={1.6} fill="none" />
        <path d="M58 79 Q70 74 82 86" stroke={item.secondary} strokeWidth={2.4} fill="none" />
        <Rivet x={70} y={86} />
        <Rivet x={60} y={98} />
      </g>
    )
  }
  return (
    <g data-part="shoulders">
      <ellipse cx={65} cy={92} rx={16} ry={10} transform="rotate(-18 65 92)" fill={item.primary} {...outline} />
      <path d="M53 96 Q64 86 78 88" stroke={item.secondary} strokeWidth={1} strokeDasharray="2 2" fill="none" />
    </g>
  )
}

export function Head({ item }: { item?: ItemDef }) {
  if (!item) return null
  if (item.kind === 'helm') {
    return (
      <g data-part="head">
        <path d="M81 50 Q80 22 100 21 Q120 22 119 50 L119 58 L113 58 L113 48 L87 48 L87 58 L81 58 Z" fill={item.primary} {...outline} />
        <path d="M86 30 Q100 22 114 30" stroke="rgba(255,255,255,0.5)" strokeWidth={1.6} fill="none" />
        <path d="M100 22 L100 46" stroke={item.secondary} strokeWidth={2.4} />
        <rect x={80} y={44} width={40} height={6} rx={1.5} fill={item.secondary} {...outline} />
        <rect x={98} y={48} width={4} height={14} rx={1} fill={item.primary} {...outline} />
      </g>
    )
  }
  return (
    <g data-part="head">
      <path
        d="M76 60 Q74 18 100 17 Q126 18 124 60 L122 80 Q100 90 78 80 Z M86 52 Q86 32 100 31 Q114 32 114 52 Q114 68 100 70 Q86 68 86 52 Z"
        fill={item.primary}
        fillRule="evenodd"
        {...outline}
      />
      <path d="M86 52 Q86 32 100 31 Q114 32 114 52" stroke={item.secondary} strokeWidth={2} fill="none" />
    </g>
  )
}

export function MainHand({ item }: { item?: ItemDef }) {
  if (!item) return null
  if (item.kind === 'mace') {
    return (
      <g data-part="mainHand">
        <path d="M56 200 L56 290" stroke={item.secondary} strokeWidth={4.5} strokeLinecap="round" />
        <circle cx={56} cy={296} r={10} fill={item.primary} {...outline} />
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <path key={angle} d="M56 284 L59 292 L53 292 Z" fill={item.primary} transform={`rotate(${angle} 56 296)`} {...outline} />
        ))}
        <circle cx={53} cy={292} r={3} fill="rgba(255,255,255,0.45)" />
      </g>
    )
  }
  return (
    <g data-part="mainHand">
      <path d="M56 204 L56 222" stroke={item.secondary} strokeWidth={4} />
      <circle cx={56} cy={202} r={3.2} fill="#c9a24a" {...outline} />
      <path d="M53 224 L59 224 L58.5 300 L56 310 L53.5 300 Z" fill={item.primary} {...outline} />
      <path d="M56 228 L56 298" stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
      <rect x={45} y={221} width={22} height={4} rx={1.5} fill="#c9a24a" {...outline} />
    </g>
  )
}

export function OffHand({ item }: { item?: ItemDef }) {
  if (!item) return null
  if (item.kind === 'dagger') {
    return (
      <g data-part="offHand">
        <path d="M144 204 L144 220" stroke="#5a3c22" strokeWidth={3.6} />
        <path d="M141.5 222 L146.5 222 L146 258 L144 266 L142 258 Z" fill={item.primary} {...outline} />
        <path d="M144 226 L144 256" stroke="rgba(255,255,255,0.55)" strokeWidth={0.9} />
        <path d="M134 219 Q144 225 154 219" stroke={item.secondary} strokeWidth={3} fill="none" strokeLinecap="round" />
      </g>
    )
  }
  return (
    <g data-part="offHand">
      <circle cx={148} cy={210} r={31} fill={item.secondary} {...outline} />
      <circle cx={148} cy={210} r={27} fill={item.primary} />
      <path d="M128 196 L168 196 M124 210 L172 210 M128 224 L168 224" stroke="rgba(0,0,0,0.25)" strokeWidth={1.2} />
      <circle cx={148} cy={210} r={7} fill={item.secondary} {...outline} />
      <circle cx={146} cy={208} r={2.4} fill="rgba(255,255,255,0.5)" />
    </g>
  )
}

function Arm({ worn, side }: { worn: Worn; side: 'right' | 'left' }) {
  return (
    <g className={side === 'right' ? 'avatar-arm-right' : 'avatar-arm-left'}>
      <g transform={side === 'left' ? MIRROR : undefined}>
        <Limb d="M66 92 L58 150" width={17} colour={SKIN} />
        <Limb d="M58 150 L56 206" width={15} colour={SKIN} />
        <circle cx={56} cy={214} r={8.5} fill={SKIN} {...outline} />
        <Sleeve item={worn.chest} />
        <Glove item={worn.gloves} />
        <Shoulder item={worn.shoulders} />
      </g>
      {side === 'right' ? <MainHand item={worn.mainHand} /> : <OffHand item={worn.offHand} />}
    </g>
  )
}

export function Defs() {
  return (
    <defs>
      <pattern id="avatar-mail" width="5" height="4" patternUnits="userSpaceOnUse">
        <path d="M0 4 Q2.5 0 5 4" fill="none" stroke="rgba(30,30,34,0.55)" strokeWidth="0.8" />
        <path d="M-2.5 2 Q0 -2 2.5 2 M2.5 2 Q5 -2 7.5 2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.6" />
      </pattern>
      <radialGradient id="avatar-floor">
        <stop offset="0" stopColor="rgba(0,0,0,0.55)" />
        <stop offset="1" stopColor="rgba(0,0,0,0)" />
      </radialGradient>
    </defs>
  )
}

export function Figure({ worn, title }: { worn: Worn; title: string }) {
  return (
    <svg viewBox="0 0 200 340" role="img" aria-label={title} className="avatar h-full w-full overflow-visible">
      <Defs />
      <ellipse cx={100} cy={330} rx={54} ry={8} fill="url(#avatar-floor)" />
      <g className="avatar-idle">
        <g data-part="body-legs">
          <path d="M74 166 L126 166 L122 198 Q100 206 78 198 Z" fill={LINEN} {...outline} />
          <Limb d="M89 190 L86 256" width={24} colour={SKIN} />
          <Limb d="M111 190 L114 256" width={24} colour={SKIN} />
          <Limb d="M86 254 L86 314" width={18} colour={SKIN} />
          <Limb d="M114 254 L114 314" width={18} colour={SKIN} />
          <ellipse cx={84} cy={322} rx={11} ry={6} fill={SKIN} {...outline} />
          <ellipse cx={116} cy={322} rx={11} ry={6} fill={SKIN} {...outline} />
        </g>
        <Legs item={worn.legs} />
        <Boots item={worn.boots} />
        <g className="avatar-breathe">
          <path d="M64 88 Q100 80 136 88 L130 132 Q128 152 124 170 L76 170 Q72 152 70 132 Z" fill={SKIN} {...outline} />
          <path d="M84 116 Q92 122 98 116 M102 116 Q108 122 116 116" stroke={SKIN_SHADE} strokeWidth={1.2} fill="none" />
          <path d="M100 124 L100 150" stroke={SKIN_SHADE} strokeWidth={1} />
          <Chest item={worn.chest} />
        </g>
        <Arm worn={worn} side="right" />
        <Arm worn={worn} side="left" />
        <g className="avatar-head">
          <rect x={92} y={64} width={16} height={24} rx={6} fill={SKIN} {...outline} />
          <ellipse cx={83} cy={50} rx={3} ry={5} fill={SKIN} {...outline} />
          <ellipse cx={117} cy={50} rx={3} ry={5} fill={SKIN} {...outline} />
          <ellipse cx={100} cy={48} rx={17} ry={20} fill={SKIN} {...outline} />
          <path d="M83 46 Q82 24 100 24 Q118 24 117 46 Q111 34 100 35 Q89 34 83 46 Z" fill={HAIR} />
          <path d="M89 43 L96 42 M104 42 L111 43" stroke={HAIR} strokeWidth={1.8} strokeLinecap="round" />
          <g className="avatar-eyes">
            <ellipse cx={93} cy={49} rx={2} ry={2.2} fill={INK} />
            <ellipse cx={107} cy={49} rx={2} ry={2.2} fill={INK} />
          </g>
          <path d="M100 51 L98.5 57 L101 57.5" stroke={SKIN_SHADE} strokeWidth={1} fill="none" />
          <path d="M95 62 Q100 64.5 105 62" stroke="#8a4f3a" strokeWidth={1.3} fill="none" strokeLinecap="round" />
          <Head item={worn.head} />
        </g>
      </g>
    </svg>
  )
}

const CROP: Record<Slot, string> = {
  head: '72 14 56 56',
  shoulders: '42 72 46 46',
  chest: '56 78 88 112',
  gloves: '40 180 32 46',
  legs: '68 160 64 150',
  boots: '68 278 64 54',
  mainHand: '30 196 52 120',
  offHand: '112 174 72 72',
}

const PART: Record<Slot, (props: { item?: ItemDef }) => ReactNode> = {
  head: Head,
  shoulders: Shoulder,
  chest: Chest,
  gloves: Glove,
  legs: Legs,
  boots: Boots,
  mainHand: MainHand,
  offHand: OffHand,
}

export function ItemIcon({ item, slot, faded = false }: { item?: ItemDef; slot: Slot; faded?: boolean }) {
  const Part = PART[slot]
  return (
    <svg viewBox={CROP[slot]} aria-hidden="true" className="size-full" style={faded ? { opacity: 0.18, filter: 'grayscale(1)' } : undefined}>
      <Part item={item} />
    </svg>
  )
}
