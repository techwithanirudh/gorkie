const SLACK_APP_HOME_BLOCK_LIMIT = 100;

type Block = Record<string, unknown>;

export interface HomeSection {
  fixed: Block[];
  overflow?: (dropped: number) => Block;
  rows?: Block[][];
  trailing?: Block[];
}

export function fitHome(sections: HomeSection[]): Block[] {
  const reserved = sections.filter((section) => section.rows?.length).length;
  let budget =
    SLACK_APP_HOME_BLOCK_LIMIT -
    sections.reduce(
      (total, section) =>
        total + section.fixed.length + (section.trailing?.length ?? 0),
      0
    ) -
    reserved;

  return sections.flatMap((section) => {
    const rows = section.rows ?? [];
    let taken = 0;
    while (taken < rows.length && rows[taken].length <= budget) {
      budget -= rows[taken].length;
      taken++;
    }
    const dropped = rows.length - taken;
    return [
      ...section.fixed,
      ...rows.slice(0, taken).flat(),
      ...(dropped > 0 && section.overflow ? [section.overflow(dropped)] : []),
      ...(section.trailing ?? []),
    ];
  });
}
