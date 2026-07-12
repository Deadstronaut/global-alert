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
  audioMimeType?: unknown
  audioSizeBytes?: unknown
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024 // 5MB (FR-013)

// Community reporting remaining item: optional voice-note attachment,
// alongside the existing optional photo — same "only validated if present"
// shape as the photo fields above.
const ALLOWED_AUDIO_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav']
const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024 // 10MB — voice notes are short but bitrate varies

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

  // Voice note is optional — only validated if the caller indicates one is present.
  if (payload.audioMimeType != null) {
    if (typeof payload.audioMimeType !== 'string' || !ALLOWED_AUDIO_MIME_TYPES.includes(payload.audioMimeType)) {
      return { valid: false, error: 'unsupported audio file type' }
    }
    if (
      typeof payload.audioSizeBytes !== 'number' ||
      !Number.isFinite(payload.audioSizeBytes) ||
      payload.audioSizeBytes > MAX_AUDIO_SIZE_BYTES
    ) {
      return { valid: false, error: 'audio file is too large' }
    }
  }

  return { valid: true }
}
