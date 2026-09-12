import {
  BoxRenderable,
  createCliRenderer,
  createRendererClipboardAdapter,
  InputRenderable,
  MarkdownRenderable,
  RGBA,
  ScrollBoxRenderable,
  SelectRenderable,
  SyntaxStyle,
  TextRenderable,
} from '@opentui/core';
import { download, permalink, sync } from './api';
import { conversation } from './conversation';
import { names, userName, when } from './names';
import { cleanTitle, group, matches } from './threads';
import type { Item, Run, Thread } from './types';

const THEME = {
  accent: RGBA.fromHex('#7aa2f7'),
  error: RGBA.fromHex('#f7768e'),
  muted: RGBA.fromHex('#565f89'),
  success: RGBA.fromHex('#9ece6a'),
  text: RGBA.fromHex('#c0caf5'),
  warning: RGBA.fromHex('#e0af68'),
};

const HELP =
  ' tab pane · jk scroll · ctrl+d/u page · g/G ends · c context · enter copy url · d download · r refresh · / filter · q quit';

export async function run(initial: Run[]): Promise<void> {
  const resolved = names();
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 30,
    useMouse: true,
  });
  const code = SyntaxStyle.create();
  const clipboard = createRendererClipboardAdapter(renderer);

  const root = new BoxRenderable(renderer, {
    flexDirection: 'column',
    flexGrow: 1,
  });
  const filterBox = new BoxRenderable(renderer, { border: true, height: 3 });
  const READY = ' filter by user, agent, slack link, trace id or text';
  const filter = new InputRenderable(renderer, { placeholder: READY });
  filterBox.add(filter);
  const panes = new BoxRenderable(renderer, {
    flexDirection: 'row',
    flexGrow: 1,
  });
  const list = new BoxRenderable(renderer, {
    border: true,
    title: ' threads ',
    width: '50%',
  });
  const detail = new ScrollBoxRenderable(renderer, {
    border: true,
    flexGrow: 1,
    title: ' run ',
  });
  const help = new TextRenderable(renderer, {
    content: HELP,
    fg: THEME.muted,
    height: 1,
  });
  panes.add(list);
  panes.add(detail);
  root.add(filterBox);
  root.add(panes);
  root.add(help);
  renderer.root.add(root);

  const select = new SelectRenderable(renderer, {
    descriptionColor: THEME.muted,
    flexGrow: 1,
    focusedTextColor: THEME.text,
    selectedBackgroundColor: RGBA.fromHex('#283457'),
    selectedDescriptionColor: THEME.muted,
    selectedTextColor: THEME.text,
    showDescription: true,
    textColor: THEME.text,
  });
  list.add(select);

  let runs = initial;
  let shown: Thread[] = [];
  let items: Item[] = [];
  let openContext = false;
  let token = 0;
  let toast: ReturnType<typeof setTimeout> | undefined;

  const FRAMES = [...'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'];
  let tick = 0;
  let spinner: ReturnType<typeof setInterval> | undefined;
  // The background history sync and a per-thread fetch both want the footer.
  // The sync runs for minutes and the fetch for seconds, so the fetch yields.
  let syncing: (() => string) | undefined;

  const spin = (label: () => string) => {
    clearInterval(spinner);
    spinner = setInterval(() => {
      tick = (tick + 1) % FRAMES.length;
      help.content = ` ${FRAMES[tick]} ${label()}`;
      help.fg = THEME.accent;
    }, 90);
  };

  const settle = () => {
    clearInterval(spinner);
    spinner = undefined;
    if (syncing) {
      spin(syncing);
    }
  };

  const flash = (message: string, fg = THEME.success) => {
    settle();
    help.content = ` ${message}`;
    help.fg = fg;
    clearTimeout(toast);
    toast = setTimeout(() => {
      help.content = HELP;
      help.fg = THEME.muted;
    }, 3000);
  };

  const clear = () => {
    for (const child of detail.content.getChildren().slice()) {
      detail.content.remove(child);
    }
  };

  const say = (content: string, fg: RGBA, paddingLeft = 0) =>
    detail.content.add(
      new TextRenderable(renderer, {
        content,
        fg,
        paddingLeft,
        wrapMode: 'word',
      })
    );

  function paint(): void {
    clear();
    for (const item of items) {
      if (item.kind === 'context') {
        say(
          `${openContext ? '▾' : '▸'} ${item.text} (c to ${openContext ? 'hide' : 'show'})`,
          THEME.muted
        );
        if (openContext && item.collapsed) {
          say(item.collapsed, THEME.muted, 2);
        }
      } else if (item.kind === 'user') {
        say(`\n${item.who || 'user'}`, THEME.success);
        say(item.text, THEME.text, 2);
      } else if (item.kind === 'assistant') {
        say(`\n${item.who || 'assistant'}`, THEME.accent);
        detail.content.add(
          new MarkdownRenderable(renderer, {
            content: item.text,
            paddingLeft: 2,
            syntaxStyle: code,
          })
        );
      } else if (item.kind === 'tool') {
        say(`\n⏺ ${item.text}`, item.failed ? THEME.error : THEME.warning);
        if (item.detail) {
          say(`⎿ ${item.detail}`, item.failed ? THEME.error : THEME.muted, 2);
        }
      } else if (item.kind === 'error') {
        say(`\n✗ ${item.text}`, THEME.error);
      } else {
        say(`\n${item.text}`, THEME.muted);
      }
    }
    detail.scrollTo(0);
  }

  async function open(index: number): Promise<void> {
    const thread = shown[index];
    if (!thread) {
      return;
    }
    const mine = ++token;
    detail.title = ` ${userName(resolved, thread.users[0] ?? '-')} · ${thread.runs.length} turns `;
    clear();
    say('fetching from mastra…', THEME.muted);
    if (!syncing) {
      spin(() => `fetching ${thread.runs.length} turns`);
    }
    const built: Item[] = [];
    for (const turn of [...thread.runs].reverse()) {
      built.push({
        kind: 'meta',
        text: `── ${when(turn.startedAt)} · ${turn.traceId}`,
      });
      built.push(
        // biome-ignore lint/performance/noAwaitInLoops: turns render in order and a parallel fetch would hammer the platform for a thread nobody has scrolled to yet
        ...(await conversation({
          sender: userName(resolved, turn.user || '-'),
          traceId: turn.traceId,
        }))
      );
      // A later selection supersedes this one, and its fetches are already in
      // flight, so abandon rather than paint over the newer thread.
      if (mine !== token) {
        return;
      }
    }
    items = built;
    settle();
    if (!syncing) {
      help.content = HELP;
      help.fg = THEME.muted;
    }
    paint();
  }

  function refill(): void {
    const query = filter.value;
    const all = group(runs);
    shown = all.filter((t) => matches(t, query));
    select.options = shown.slice(0, 2000).map((t) => ({
      description: `   ${when(t.last)}  ${userName(resolved, t.users[0] ?? '-')}  ${t.runs.length}t`,
      name: `${t.errors ? '! ' : '  '}${cleanTitle(t.title)}`,
      value: t.id,
    }));
    list.title = ` threads ${shown.length} of ${all.length} `;
    if (shown.length) {
      open(0).catch((error) => flash(String(error), THEME.error));
    }
  }

  // Search runs locally because the platform list only filters on entityId,
  // so the full index has to be here before a query can mean anything. The
  // first page is already on screen, so this is a background fill, and the
  // filter stays shut until it finishes rather than quietly searching a
  // tenth of the history.
  async function fill(): Promise<void> {
    let at = 0;
    let pages = 0;
    let seen = runs.length;
    filter.focusable = false;
    filter.placeholder = ' loading history, search opens when this finishes';
    syncing = () =>
      `syncing ${at}/${pages || '?'}  ${seen} runs  (browsing works already)`;
    spin(syncing);
    runs = await sync((page, of, count) => {
      at = page;
      pages = of;
      seen = count;
    });
    syncing = undefined;
    filter.focusable = true;
    filter.placeholder = READY;
    refill();
    flash(`${runs.length} runs ready to search`);
  }

  refill();
  select.focus();
  fill().catch((error) => flash(String(error), THEME.error));
  select.on('selectionChanged', (index: number) =>
    open(index).catch((error) => flash(String(error), THEME.error))
  );
  filter.on('input', refill);

  renderer.keyInput.on('keypress', (key: { ctrl?: boolean; name?: string }) => {
    if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
      renderer.destroy();
      process.exit(0);
    }
    if (key.name === 'tab') {
      (select.focused ? filter : select).focus();
      return;
    }
    if (key.name === 'slash' && !filter.focused) {
      filter.focus();
      return;
    }
    if (filter.focused) {
      return;
    }
    const step = Math.max(1, Math.floor(detail.height / 2));
    const selected = shown[select.getSelectedIndex()];
    if (key.name === 'd' && key.ctrl) {
      detail.scrollBy(step);
    } else if (key.name === 'u' && key.ctrl) {
      detail.scrollBy(-step);
    } else if (key.name === 'g') {
      detail.scrollTo(0);
    } else if (key.name === 'G') {
      detail.scrollTo(detail.scrollHeight);
    } else if (key.name === 'j') {
      detail.scrollBy(1);
    } else if (key.name === 'k') {
      detail.scrollBy(-1);
    } else if (key.name === 'c') {
      openContext = !openContext;
      paint();
    } else if (key.name === 'q') {
      renderer.destroy();
      process.exit(0);
    } else if (key.name === 'r') {
      fill().catch((error) => flash(String(error), THEME.error));
    } else if (key.name === 'd' && selected?.runs[0]) {
      const id = selected.runs[0].traceId;
      flash(`downloading ${id}…`, THEME.muted);
      download(id)
        .then((path) => flash(`saved ${path}`))
        .catch((error) => flash(String(error), THEME.error));
    } else if (key.name === 'return' && selected?.runs[0]) {
      const url = permalink(selected.runs[0].traceId);
      flash(
        clipboard.writeText(url, 'clipboard').status === 'attempted'
          ? `copied  ${url}`
          : `clipboard unavailable  ${url}`
      );
    }
  });
}
