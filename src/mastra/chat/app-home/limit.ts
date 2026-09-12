const MAX_HOME_BLOCKS = 100;

type Block = Record<string, unknown>;

export interface HomeSection {
  fixed: Block[];
  overflow?: (dropped: number) => Block;
  rows?: Block[][];
  trailing?: Block[];
}

export function fitHome(sections: HomeSection[]): Block[] {
  const paged = sections.filter((section) => section.rows?.length);
  const alwaysShown = sections.reduce(
    (total, section) =>
      total + section.fixed.length + (section.trailing?.length ?? 0),
    0
  );
  let left = MAX_HOME_BLOCKS - alwaysShown - paged.length;

  const shown = new Map<HomeSection, number>();
  for (let dealt = true; dealt; ) {
    dealt = false;
    for (const section of paged) {
      const taken = shown.get(section) ?? 0;
      const row = section.rows?.[taken];
      if (!row || row.length > left) {
        continue;
      }
      shown.set(section, taken + 1);
      left -= row.length;
      dealt = true;
    }
  }

  return sections.flatMap((section) => {
    const rows = section.rows ?? [];
    const taken = paged.includes(section)
      ? (shown.get(section) ?? 0)
      : rows.length;
    const dropped = rows.length - taken;
    return [
      ...section.fixed,
      ...rows.slice(0, taken).flat(),
      ...(dropped > 0 && section.overflow ? [section.overflow(dropped)] : []),
      ...(section.trailing ?? []),
    ];
  });
}
