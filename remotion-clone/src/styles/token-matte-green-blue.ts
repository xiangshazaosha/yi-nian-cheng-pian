import {greenAvatarSide, MATTE_GREEN_BLUE} from './matte-green-blue';

// Token-four-methods adapter for the approved original matte-green-blue palette.
// All chromatic values come from matte-green-blue.ts; this file only normalizes key names.
export const TOKEN_MATTE_GREEN_BLUE = {
  color: {
    canvas: MATTE_GREEN_BLUE.color.canvas,
    ink: MATTE_GREEN_BLUE.color.text,
    muted: MATTE_GREEN_BLUE.color.muted,
    accent: MATTE_GREEN_BLUE.color.accent,
    card: MATTE_GREEN_BLUE.color.surface,
    brollBlack: MATTE_GREEN_BLUE.color.black,
    lightText: MATTE_GREEN_BLUE.color.text,
    lowBorder: 'rgba(169, 215, 242, 0.24)',
    fullScreenInk: MATTE_GREEN_BLUE.color.canvas,
    fullScreenMuted: MATTE_GREEN_BLUE.color.surface,
  },
  card: {
    radius: 16,
    shadow: '0 10px 28px rgba(4, 22, 16, 0.20)',
  },
  avatar: {
    denseSize: Math.round(greenAvatarSide(MATTE_GREEN_BLUE.avatar.baselineDiameter)),
    radius: MATTE_GREEN_BLUE.avatar.radius,
    borderWidth: MATTE_GREEN_BLUE.avatar.border,
    areaRatio: MATTE_GREEN_BLUE.avatar.areaRatio,
  },
  font: MATTE_GREEN_BLUE.font,
} as const;
