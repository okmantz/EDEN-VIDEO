// Tiny constructors shared by the template catalogs.
/** A slot for the person's clip or photo. */
export const S = (label, hint, dur, o = {}) => ({ label, hint, dur, ...o });
/** A title card on an animated scene (needs no clip). */
export const CARD = (label, dur, gen, o = {}) => ({ label, card: true, dur, gen, ...o });
/** A text layer. */
export const T = (text, o = {}) => ({ text, ...o });
/** Palette. Colours written as '$primary' etc. follow the brand when it is switched on. */
export const PAL = (primary, secondary, accent, text = '#FFFFFF') => ({ primary, secondary, accent, text });
