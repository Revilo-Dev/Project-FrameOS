import type { ClockFont } from '../types/settings';

export const CLOCK_FONTS: { id: ClockFont; name: string; description: string }[] = [
  { id: 'modern', name: 'Modern', description: 'Clean and balanced' },
  { id: 'rounded', name: 'Rounded', description: 'Soft, rounded numerals' },
  { id: 'minimal', name: 'Minimal', description: 'Light and understated' },
  { id: 'bold', name: 'Bold', description: 'Strong, condensed digits' },
  { id: 'digital', name: 'Digital', description: 'Geometric digital display' },
  { id: 'classic', name: 'Classic', description: 'Original FrameOS serif' },
];
export function isClockFont(value: unknown): value is ClockFont {
  return CLOCK_FONTS.some(font => font.id === value);
}
