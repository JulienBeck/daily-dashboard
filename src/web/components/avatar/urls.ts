import type { Body } from '../../../shared/avatar.js'

const root = `${import.meta.env.BASE_URL}avatar/`

export const modelUrl = (body: Body) => `${root}${body}.glb`

export const iconUrl = (id: string) => `${root}icons/${id}.png`
