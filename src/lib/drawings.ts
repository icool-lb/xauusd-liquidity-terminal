// ============================================================
// نظام الرسم اليدوي — أدوات المحلل المحترف
// ============================================================

export type ToolId =
  | 'none' | 'res' | 'sup' | 'liqB' | 'liqS' | 'fvg'
  | 'bos' | 'choch' | 'vopen' | 'vclose' | 'erase';

export interface Drawing {
  id: string;
  tool: Exclude<ToolId, 'none' | 'erase'>;
  p1: number;           // سعر
  p2?: number;          // سعر ثانٍ للمناطق
  t1: number;           // وقت unix
  t2?: number;          // وقت ثانٍ للمناطق (فارغ = ممتدة يميناً)
}

export const TOOL_META: Record<string, { label: string; color: string; kind: 'hline' | 'zone' | 'label' | 'vline' }> = {
  res:    { label: 'مقاومة',        color: '#f87171', kind: 'hline' },
  sup:    { label: 'دعم',           color: '#34d399', kind: 'hline' },
  liqB:   { label: 'سيولة شرائية',  color: '#fbbf24', kind: 'zone' },
  liqS:   { label: 'سيولة بيعية',   color: '#a78bfa', kind: 'zone' },
  fvg:    { label: 'FVG',           color: '#64748b', kind: 'zone' },
  bos:    { label: 'BOS',           color: '#22d3ee', kind: 'label' },
  choch:  { label: 'CHoCH',         color: '#e879f9', kind: 'label' },
  vopen:  { label: 'افتتاح سوق',    color: '#22d3ee', kind: 'vline' },
  vclose: { label: 'إغلاق سوق',     color: '#f97316', kind: 'vline' },
};

const key = (symbol: string, day: string) => `xau_draw_${symbol}_${day}`;

export function loadDrawings(symbol: string, day: string): Drawing[] {
  try {
    return JSON.parse(localStorage.getItem(key(symbol, day)) || '[]');
  } catch {
    return [];
  }
}

export function saveDrawings(symbol: string, day: string, ds: Drawing[]) {
  localStorage.setItem(key(symbol, day), JSON.stringify(ds));
}

export const uid = () => Math.random().toString(36).slice(2, 9);
