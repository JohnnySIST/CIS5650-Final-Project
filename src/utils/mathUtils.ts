type Vec2 = { x: number; y: number };
export function distanceToLineSegment(
  point: Vec2,
  lineStart: Vec2,
  lineEnd: Vec2
) {
  const AB = {
    x: lineEnd.x - lineStart.x,
    y: lineEnd.y - lineStart.y,
  };

  const AP = {
    x: point.x - lineStart.x,
    y: point.y - lineStart.y,
  };

  const ABAP = AB.x * AP.x + AB.y * AP.y;

  const ABAB = AB.x * AB.x + AB.y * AB.y;

  const t = ABAP / ABAB;

  if (t < 0) {
    const dist = Math.sqrt(
      (lineStart.x - point.x) ** 2 + (lineStart.y - point.y) ** 2
    );
    return dist;
  }
  if (t > 1) {
    const dist = Math.sqrt(
      (lineEnd.x - point.x) ** 2 + (lineEnd.y - point.y) ** 2
    );
    return dist;
  }

  const proj = {
    x: lineStart.x + t * AB.x,
    y: lineStart.y + t * AB.y,
  };

  const dist = Math.sqrt((proj.x - point.x) ** 2 + (proj.y - point.y) ** 2);
  return dist;
}
