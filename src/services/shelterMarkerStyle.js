const SHELTER_STATUS_COLOR = {
  open: '#22c55e',
  full: '#f97316',
  closed: '#94a3b8',
}

const SHELTER_FALLBACK_COLOR = '#94a3b8'

export function getShelterMarkerColor(status) {
  return SHELTER_STATUS_COLOR[status] ?? SHELTER_FALLBACK_COLOR
}

export function getShelterMarkerIcon() {
  return '🏠'
}
