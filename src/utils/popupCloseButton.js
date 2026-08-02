/**
 * Shared close-button markup for every "modern card" MapLibre popup
 * (disaster/shelter/drill-event/community-report/exposure-feature/region).
 * Deliberately NOT MapLibre's built-in close button: that one positions
 * itself relative to .maplibregl-popup-content, whose rendered width is
 * governed by the Popup's `maxWidth` option — our cards' own min-width can
 * disagree with that, and the built-in button can end up anchored to a box
 * that doesn't match the visible card's real edges. This markup is inserted
 * as the first child of the card element itself (which has its own
 * position:relative), so its position is tied unambiguously to that card.
 * Popups using this must pass `closeButton: false` to `new maplibregl.Popup`
 * and call MapView.vue's registerPopupCascade(popup), which wires the click
 * handler once the popup's `open` event fires.
 */
export const POPUP_CLOSE_BTN_HTML =
  '<button type="button" class="popup-close-x" aria-label="Kapat">&times;</button>'
