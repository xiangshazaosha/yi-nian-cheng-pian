import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { getCaptionAt } from '../data/srt';
import { COLORS, EASE, FONT_SIZE, RADIUS } from '../lib/theme';

// 底部字幕条
// 仅 A-roll 段使用：根据 srt 渲染当前帧对应的字幕
// 位置：画面底部 85-92%，水平居中
// 样式：半透明黑底 80% 透明度，白字，圆角 12px
// 关键词高亮：黄底 #FFE600 或绿底 #CCFF00 黑字（通过 highlights prop 指定）
// 入场/出场：跟随字幕自然淡入淡出（每条字幕 4 帧过渡）

interface CaptionBarProps {
  // 字幕在主时间轴的偏移（用于 A-roll 全屏段以外的场景）
  // 默认 0：字幕直接基于全局 frame 查询
  frameOffset?: number;
  // 关键词高亮（数组：每个元素为 {keyword, color}）
  highlights?: Array<{ keyword: string; color: 'yellow' | 'green' }>;
  // 字幕条宽度占画面宽度的比例
  widthRatio?: number;
  // 字幕条底部位置（相对画面高度的比例，0-1）
  bottomRatio?: number;
  // 关键词高亮模式：'keyword' 高亮关键词，'all' 整条字幕高亮
  highlightMode?: 'keyword' | 'all';
  highlightColor?: 'yellow' | 'green';
  // 入场/出场淡入淡出帧数
  fadeFrames?: number;
}

// 将字幕文本按关键词分段，返回 React 节点数组
const renderHighlightedText = (
  text: string,
  highlights: Array<{ keyword: string; color: 'yellow' | 'green' }> | undefined
): React.ReactNode => {
  if (!highlights || highlights.length === 0) {
    return text;
  }

  // 按所有关键词拆分文本
  const segments: Array<{ text: string; highlight?: 'yellow' | 'green' }> = [{ text }];

  for (const { keyword, color } of highlights) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.highlight) continue; // 已高亮的不再拆

      const idx = seg.text.indexOf(keyword);
      if (idx === -1) continue;

      const before = seg.text.slice(0, idx);
      const match = seg.text.slice(idx, idx + keyword.length);
      const after = seg.text.slice(idx + keyword.length);

      const replacement: typeof segments = [];
      if (before) replacement.push({ text: before });
      replacement.push({ text: match, highlight: color });
      if (after) replacement.push({ text: after });

      segments.splice(i, 1, ...replacement);
      i += replacement.length - 1;
    }
  }

  return segments.map((seg, i) => {
    if (!seg.highlight) return <span key={i}>{seg.text}</span>;
    const bg = seg.highlight === 'yellow' ? COLORS.yellow : COLORS.green;
    return (
      <span
        key={i}
        style={{
          background: bg,
          color: '#000000',
          padding: '2px 8px',
          borderRadius: 6,
          margin: '0 2px',
        }}
      >
        {seg.text}
      </span>
    );
  });
};

export const CaptionBar: React.FC<CaptionBarProps> = ({
  frameOffset = 0,
  highlights,
  widthRatio = 0.6,
  bottomRatio = 0.88,
  highlightMode = 'keyword',
  highlightColor,
  fadeFrames = 4,
}) => {
  const frame = useCurrentFrame();
  const actualFrame = frame + frameOffset;
  const caption = getCaptionAt(actualFrame);

  if (!caption) return null;

  // 字幕淡入淡出（在每条字幕的开头/结尾 fadeFrames 帧）
  const captionLength = caption.endFrame - caption.startFrame;
  const captionProgress = (actualFrame - caption.startFrame) / captionLength;

  const fadeIn = interpolate(
    captionProgress,
    [0, Math.min(1, fadeFrames / captionLength)],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const fadeOut = interpolate(
    captionProgress,
    [Math.max(0, 1 - fadeFrames / captionLength), 1],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const opacity = Math.min(fadeIn, fadeOut);

  // 整条字幕高亮模式
  const isAllHighlight = highlightMode === 'all' && highlightColor;
  const bgAll = isAllHighlight
    ? (highlightColor === 'yellow' ? COLORS.yellow : COLORS.green)
    : COLORS.captionBg;
  const textAll = isAllHighlight ? '#000000' : COLORS.captionText;

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: `${(1 - bottomRatio) * 100}%`,
        transform: 'translateX(-50%)',
        opacity,
        background: bgAll,
        color: textAll,
        padding: '14px 32px',
        borderRadius: RADIUS.caption,
        maxWidth: `${widthRatio * 100}%`,
        fontSize: FONT_SIZE.caption,
        fontWeight: 700,
        lineHeight: 1.4,
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
        fontFamily: '"PingFang SC", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.50)',
      }}
    >
      {isAllHighlight ? caption.text : renderHighlightedText(caption.text, highlights)}
    </div>
  );
};
