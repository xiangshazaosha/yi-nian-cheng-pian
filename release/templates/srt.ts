// Empty public timeline. Populate from the current film's verified authority;
// no actual user captions or previous film data are distributed.
export interface Caption {
  index: number;
  startFrame: number;
  endFrame: number;
  text: string;
}
export const CAPTIONS: Caption[] = [];
export const getCaptionAt = (frame: number): Caption | null =>
  CAPTIONS.find(c => frame >= c.startFrame && frame < c.endFrame) || null;
