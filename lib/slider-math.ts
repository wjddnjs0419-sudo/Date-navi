export function snapToStep(rawValue: number, min: number, max: number, step: number): number {
  const snapped = Math.round((rawValue - min) / step) * step + min;
  return Math.min(max, Math.max(min, snapped));
}

export function valueToFraction(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

export function fractionToValue(fraction: number, min: number, max: number, step: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  const raw = min + clamped * (max - min);
  return snapToStep(raw, min, max, step);
}

export function isHorizontalDrag(dx: number, dy: number, threshold = 10): boolean {
  return Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy);
}
