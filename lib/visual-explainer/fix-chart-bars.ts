const BAR_WIDTH_STOPS: ReadonlyArray<{ cls: string; pct: number }> = [
  { cls: "bar-w-10", pct: 10 },
  { cls: "bar-w-20", pct: 20 },
  { cls: "bar-w-25", pct: 25 },
  { cls: "bar-w-33", pct: 33 },
  { cls: "bar-w-40", pct: 40 },
  { cls: "bar-w-50", pct: 50 },
  { cls: "bar-w-66", pct: 66 },
  { cls: "bar-w-75", pct: 75 },
  { cls: "bar-w-85", pct: 85 },
  { cls: "bar-w-full", pct: 100 },
];

const BAR_CLASS_PATTERN =
  /\bbar-w-(10|20|25|33|40|50|66|75|85|full)\b/;

const ROW_OPEN_PATTERN =
  /<div class="[^"]*\bflex\b[^"]*\bitems-center\b[^"]*\bgap-3\b[^"]*"[^>]*>/i;

const ROW_OPEN_AT_START_PATTERN =
  /^<div class="[^"]*\bflex\b[^"]*\bitems-center\b[^"]*\bgap-3\b[^"]*"[^>]*>/i;

const FILL_PATTERN =
  /<div class="([^"]*\bbar-w-(?:10|20|25|33|40|50|66|75|85|full)\b[^"]*)"[^>]*>\s*<\/div>/i;

export function parseChartLabelValue(label: string): number | null {
  const text = label
    .replace(/<[^>]+>/g, "")
    .replace(/&[^;\s]+;/g, "")
    .trim();
  if (!text || !/\d/.test(text)) return null;

  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) return Number.parseFloat(percentMatch[1]!);

  return null;
}

export function ratioToBarClass(ratioPct: number): string {
  const clamped = Math.max(0, Math.min(100, ratioPct));
  let best = BAR_WIDTH_STOPS[BAR_WIDTH_STOPS.length - 1]!;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const stop of BAR_WIDTH_STOPS) {
    const diff = Math.abs(clamped - stop.pct);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = stop;
    }
  }

  return best.cls;
}

function swapBarClass(classAttr: string, barClass: string): string {
  if (BAR_CLASS_PATTERN.test(classAttr)) {
    return classAttr.replace(BAR_CLASS_PATTERN, barClass);
  }
  return `${classAttr} ${barClass}`.trim();
}

function findBalancedDiv(
  html: string,
  start: number,
): { block: string; end: number } | null {
  if (!ROW_OPEN_AT_START_PATTERN.test(html.slice(start))) return null;

  let depth = 0;
  let i = start;

  while (i < html.length) {
    const rest = html.slice(i);
    if (/^<div(?:\s|>)/.test(rest)) {
      depth += 1;
      const close = html.indexOf(">", i);
      if (close === -1) return null;
      i = close + 1;
      continue;
    }
    if (rest.startsWith("</div>")) {
      depth -= 1;
      i += 6;
      if (depth === 0) {
        return { block: html.slice(start, i), end: i };
      }
      continue;
    }
    i += 1;
  }

  return null;
}

type ParsedBarRow = {
  block: string;
  start: number;
  end: number;
  value: number;
  fillClassAttr: string;
};

function parseBarRow(
  block: string,
  start: number,
  end: number,
): ParsedBarRow | null {
  if (!block.includes("overflow-hidden") || !BAR_CLASS_PATTERN.test(block)) {
    return null;
  }

  const fillMatch = block.match(FILL_PATTERN);
  if (!fillMatch) return null;

  const spans = [...block.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)];
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const value = parseChartLabelValue(spans[i]![1]!);
    if (value !== null) {
      return {
        block,
        start,
        end,
        value,
        fillClassAttr: fillMatch[1]!,
      };
    }
  }

  return null;
}

function fixRowBlock(row: ParsedBarRow, maxValue: number): string {
  const ratio = (row.value / maxValue) * 100;
  const barClass = ratioToBarClass(ratio);
  const nextClassAttr = swapBarClass(row.fillClassAttr, barClass);
  return row.block.replace(
    `<div class="${row.fillClassAttr}"`,
    `<div class="${nextClassAttr}"`,
  );
}

function isGapOnlyBetween(html: string, from: number, to: number): boolean {
  return html.slice(from, to).trim().length === 0;
}

/**
 * 図解 HTML 内の比較バー（bar-w-*）を、同一グラフ内の数値ラベルに合わせて補正する。
 */
export function fixChartBarScales(html: string): string {
  if (!html.includes("bar-w-")) return html;

  type RowGroup = ParsedBarRow[];
  const groups: RowGroup[] = [];

  let scanAt = 0;
  let pending: RowGroup | null = null;
  let pendingEnd = 0;

  const flush = () => {
    if (pending && pending.length > 0) groups.push(pending);
    pending = null;
    pendingEnd = 0;
  };

  while (scanAt < html.length) {
    const relativeIndex = html.slice(scanAt).search(ROW_OPEN_PATTERN);
    if (relativeIndex === -1) break;

    const rowStart = scanAt + relativeIndex;
    const openLength = html.slice(rowStart).match(ROW_OPEN_PATTERN)?.[0]?.length ?? 0;
    const balanced = findBalancedDiv(html, rowStart);
    if (!balanced) {
      scanAt = rowStart + Math.max(openLength, 1);
      flush();
      continue;
    }

    const parsed = parseBarRow(balanced.block, rowStart, balanced.end);
    if (!parsed) {
      flush();
      scanAt = balanced.end;
      continue;
    }

    if (
      pending &&
      pending.length > 0 &&
      isGapOnlyBetween(html, pendingEnd, rowStart)
    ) {
      pending.push(parsed);
      pendingEnd = balanced.end;
    } else {
      flush();
      pending = [parsed];
      pendingEnd = balanced.end;
    }

    scanAt = balanced.end;
  }

  flush();

  if (groups.length === 0) return html;

  const replacements: Array<{ start: number; end: number; text: string }> = [];

  for (const group of groups) {
    if (group.length === 0) continue;

    const maxValue =
      group.length >= 2
        ? Math.max(...group.map((row) => row.value))
        : Math.max(100, group[0]!.value);

    if (maxValue <= 0) continue;

    for (const row of group) {
      const fixed = fixRowBlock(row, maxValue);
      if (fixed !== row.block) {
        replacements.push({ start: row.start, end: row.end, text: fixed });
      }
    }
  }

  if (replacements.length === 0) return html;

  replacements.sort((a, b) => b.start - a.start);

  let result = html;
  for (const rep of replacements) {
    result = result.slice(0, rep.start) + rep.text + result.slice(rep.end);
  }

  return result;
}
