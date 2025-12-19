/**
 * 颜色工具函数
 * 包含亮度计算、对比色生成等工具
 */

/**
 * 计算 Hex 颜色的相对亮度 (Relative Luminance)
 * 遵循 WCAG 标准
 * @param hex - Hex 颜色值 (如 #FFFFFF)
 * @returns 亮度值 (0-1)
 */
export const getLuminance = (hex: string): number => {
  const cleaned = hex.replace('#', '');
  const rgb = parseInt(cleaned, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;

  // 转换为相对亮度
  const [lr, lg, lb] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

/**
 * 根据背景色自动计算前景色 (黑或白)
 * 确保文字对背景有足够的对比度
 * @param bgHex - 背景颜色 Hex 值
 * @returns 黑色或白色 (#000000 或 #FFFFFF)
 */
export const getContrastColor = (bgHex: string): string => {
  const luminance = getLuminance(bgHex);
  // 根据 WCAG 标准，亮度 > 0.5 时用黑色，否则用白色
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};

/**
 * 将 RGB 转换为 Hex
 */
export const rgbToHex = (r: number, g: number, b: number): string => {
  return '#' + [r, g, b]
    .map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('')
    .toUpperCase();
};

/**
 * 将 Hex 转换为 RGB
 */
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

/**
 * 混合两个 Hex 颜色
 * @param hex1 - 第一个颜色
 * @param hex2 - 第二个颜色
 * @param ratio - 混合比例 (0-1，0 表示 100% hex1，1 表示 100% hex2)
 */
export const mixColors = (hex1: string, hex2: string, ratio: number = 0.5): string => {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);

  if (!rgb1 || !rgb2) return hex1;

  const r = Math.round(rgb1.r * (1 - ratio) + rgb2.r * ratio);
  const g = Math.round(rgb1.g * (1 - ratio) + rgb2.g * ratio);
  const b = Math.round(rgb1.b * (1 - ratio) + rgb2.b * ratio);

  return rgbToHex(r, g, b);
};

/**
 * 生成带透明度的 Hex 颜色
 * @param hex - 基础 Hex 颜色
 * @param alpha - 透明度 (0-1)
 */
export const withAlpha = (hex: string, alpha: number): string => {
  if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex)) {
    console.warn(`Invalid hex color: ${hex}`);
    return hex;
  }

  const alphaHex = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `${hex}${alphaHex}`;
};

/**
 * 生成 Container 颜色 (用于填充背景)
 * Material Design 3 的 Container 通常是主色加入背景色的混合
 * @param primaryHex - 主要颜色
 * @param isDark - 是否深色模式
 */
export const generateContainerColor = (primaryHex: string, isDark: boolean): string => {
  const ratio = isDark ? 0.25 : 0.1; // 深色模式 25% 主色，浅色模式 10% 主色
  const bgColor = isDark ? '#1C1B1F' : '#FFFBFE';
  return mixColors(primaryHex, bgColor, ratio);
};

/**
 * 计算色彩的对比度 (Contrast Ratio)
 * 用于验证是否满足 WCAG AA 标准 (最小 4.5:1)
 */
export const getContrastRatio = (hex1: string, hex2: string): number => {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * 验证颜色对比度是否满足标准
 */
export const isContrastSafe = (bgHex: string, fgHex: string, minRatio: number = 4.5): boolean => {
  return getContrastRatio(bgHex, fgHex) >= minRatio;
};
