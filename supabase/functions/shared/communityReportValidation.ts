// Pure request-payload validation for submit-community-report (spec 036,
// FR-002/FR-013). No I/O — the Edge Function calls this before touching the
// DB or Storage, so a bad request never causes a partial write.

export interface CommunityReportPayload {
  hazardType?: unknown
  description?: unknown
  lat?: unknown
  lng?: unknown
  photoMimeType?: unknown
  photoSizeBytes?: unknown
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024 // 5MB (FR-013)

export function validateReportPayload(payload: CommunityReportPayload): ValidationResult {
  if (typeof payload.hazardType !== 'string' || payload.hazardType.trim() === '') {
    return { valid: false, error: 'hazardType is required' }
  }
  if (typeof payload.description !== 'string' || payload.description.trim() === '') {
    return { valid: false, error: 'description is required' }
  }
  if (typeof payload.lat !== 'number' || !Number.isFinite(payload.lat) || payload.lat < -90 || payload.lat > 90) {
    return { valid: false, error: 'lat is required and must be between -90 and 90' }
  }
  if (typeof payload.lng !== 'number' || !Number.isFinite(payload.lng) || payload.lng < -180 || payload.lng > 180) {
    return { valid: false, error: 'lng is required and must be between -180 and 180' }
  }

  // Photo is optional — only validated if the caller indicates one is present.
  if (payload.photoMimeType != null) {
    if (typeof payload.photoMimeType !== 'string' || !ALLOWED_PHOTO_MIME_TYPES.includes(payload.photoMimeType)) {
      return { valid: false, error: 'unsupported photo file type' }
    }
    if (
      typeof payload.photoSizeBytes !== 'number' ||
      !Number.isFinite(payload.photoSizeBytes) ||
      payload.photoSizeBytes > MAX_PHOTO_SIZE_BYTES
    ) {
      return { valid: false, error: 'photo file is too large' }
    }
  }

  return { valid: true }
}
