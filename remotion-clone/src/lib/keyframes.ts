import { interpolate } from 'remotion';

// 关键帧数据：frames（时间点）与 values（对应值）等长数组，供 interpolate 求值。
// 用于把 SegmentX 里 interpolate(frame, [...], [...]) 的额外动效解析成数据，挂到组件实例上。
export interface Keyframes {
  frames: number[];
  values: number[];
}

/** 有关键帧则 interpolate 求值（左右 clamp），否则返回 fallback（兼容原静态参数）。 */
export function evalKeyframes(frame: number, kf: Keyframes | undefined, fallback: number): number {
  if (!kf || kf.frames.length < 2 || kf.values.length < 2) return fallback;
  return interpolate(frame, kf.frames, kf.values, {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}
