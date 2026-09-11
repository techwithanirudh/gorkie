// Slack renders at most 100 blocks in a home view and silently drops the rest.

const MAX_HOME_BLOCKS = 100;

type Block = Record<string, unknown>;

export interface HomeSection {
  fixed: Block[];
  overflow?: (dropped: number) => Block;
  rows?: Block[][];
  trailing?: Block[];
}

function allowances(sections: HomeSection[], budget: number): number[] {
  const taken = sections.map(() => 0);
  let left = budget;
  let placed = true;
  while (left > 0 && placed) {
    placed = false;
    for (const [index, section] of sections.entries()) {
      const row = section.rows?.[taken[index] ?? 0];
      if (!row || row.length > left) {
        continue;
      }
      taken[index] = (taken[index] ?? 0) + 1;
      left -= row.length;
      placed = true;
    }
  }
  return taken;
}

export function fitHome(sections: HomeSection[]): Block[] {
  const withRows = sections.filter((section) => section.rows?.length);
  const reserved = sections.reduce(
    (total, section) =>
      total + section.fixed.length + (section.trailing ?? []).length,
    0
  );
  // Every section reserves room for an overflow note it may not need.
  const taken = allowances(
    withRows,
    MAX_HOME_BLOCKS - reserved - withRows.length
  );

  return sections.flatMap((section) => {
    const rows = section.rows ?? [];
    const shown = section.rows?.length
      ? (taken[withRows.indexOf(section)] ?? 0)
      : rows.length;
    const dropped = rows.length - shown;
    return [
      ...section.fixed,
      ...rows.slice(0, shown).flat(),
      ...(dropped > 0 && section.overflow ? [section.overflow(dropped)] : []),
      ...(section.trailing ?? []),
    ];
  });
}
