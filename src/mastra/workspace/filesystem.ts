import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  CopyOptions,
  FileContent,
  FileEntry,
  FileStat,
  FilesystemGrepOptions,
  FilesystemGrepResult,
  FilesystemInfo,
  ListOptions,
  ProviderStatus,
  ReadOptions,
  RemoveOptions,
  WalkEntry,
  WalkOptions,
  WriteOptions,
} from '@mastra/core/workspace';
import {
  DirectoryNotEmptyError,
  DirectoryNotFoundError,
  FileExistsError,
  FileNotFoundError,
  IsDirectoryError,
  MastraFilesystem,
  NotDirectoryError,
  PermissionError,
  StaleFileError,
  UnsupportedGrepPatternError,
} from '@mastra/core/workspace';
import type { E2BSandbox } from '@mastra/e2b';
import {
  CommandExitError,
  FileNotFoundError as E2BFileNotFoundError,
  type EntryInfo,
  FileType,
} from 'e2b';
import { lookup } from 'mime-types';
import { file as fileLimits, sandbox as sandboxConfig } from '../config';
import { sh } from '../lib/utils';
import { parseRipgrepJson, ripgrepCommand } from './ripgrep';

function modifiedTime(info: { modifiedTime?: Date }): Date {
  return info.modifiedTime ?? new Date(0);
}

export function confinePath({
  basePath = sandboxConfig.workdir,
  inputPath,
}: {
  basePath?: string;
  inputPath: string;
}): string {
  const resolved = path.posix.resolve(basePath, inputPath);
  if (!(resolved === basePath || resolved.startsWith(`${basePath}/`))) {
    throw new PermissionError(inputPath, `access outside ${basePath}`);
  }
  return resolved;
}

export class E2BFilesystem extends MastraFilesystem {
  readonly id: string;
  readonly name = 'E2BFilesystem';
  readonly provider = 'e2b';
  readonly basePath: string;
  status: ProviderStatus = 'pending';

  constructor({
    basePath,
    sandbox,
  }: { basePath: string; sandbox: E2BSandbox }) {
    super({ name: 'E2BFilesystem' });
    this.id = `${sandbox.id}-filesystem`;
    this.basePath = path.posix.normalize(basePath);
    this.sandbox = sandbox;
  }

  private readonly sandbox: E2BSandbox;

  async init(): Promise<void> {
    await this.sandbox.ensureRunning();
    await this.sandbox.retryOnDead(() =>
      this.sandbox.e2b.files.makeDir(this.basePath)
    );
  }

  async readFile(
    inputPath: string,
    options?: ReadOptions
  ): Promise<string | Buffer> {
    await this.ensureReady();
    const filePath = this.resolve(inputPath);

    return this.attempt({
      absent: 'file',
      inputPath,
      run: async () => {
        const info = await this.sandbox.retryOnDead(() =>
          this.sandbox.e2b.files.getInfo(filePath)
        );
        if (info.type === FileType.DIR) {
          throw new IsDirectoryError(inputPath);
        }
        if (info.size > fileLimits.maxReadBytes) {
          throw new Error(
            `${inputPath} is ${Math.round(info.size / 1_000_000)}MB, over the ${Math.round(fileLimits.maxReadBytes / 1_000_000)}MB read limit. Read a slice with execute_command (head, sed, tail) instead.`
          );
        }

        if (options?.encoding) {
          if (
            options.encoding === 'base64' ||
            options.encoding === 'hex' ||
            options.encoding === 'binary'
          ) {
            const bytes = await this.sandbox.retryOnDead(() =>
              this.sandbox.e2b.files.read(filePath, { format: 'bytes' })
            );
            return Buffer.from(bytes).toString(options.encoding);
          }

          return this.sandbox.retryOnDead(() =>
            this.sandbox.e2b.files.read(filePath, { format: 'text' })
          );
        }

        const bytes = await this.sandbox.retryOnDead(() =>
          this.sandbox.e2b.files.read(filePath, { format: 'bytes' })
        );
        return Buffer.from(bytes);
      },
    });
  }

  async writeFile(
    inputPath: string,
    content: FileContent,
    options?: WriteOptions
  ): Promise<void> {
    await this.ensureReady();
    const filePath = this.resolve(inputPath);

    if (options?.recursive === false) {
      await this.assertParent({ filePath, inputPath });
    } else {
      await this.sandbox.retryOnDead(() =>
        this.sandbox.e2b.files.makeDir(path.posix.dirname(filePath))
      );
    }

    if (options?.overwrite === false && (await this.exists(inputPath))) {
      throw new FileExistsError(inputPath);
    }

    if (options?.expectedMtime) {
      const current = await this.infoOrAbsent(filePath);
      const modifiedAt = current && modifiedTime(current);
      if (
        modifiedAt &&
        modifiedAt.getTime() !== options.expectedMtime.getTime()
      ) {
        throw new StaleFileError(inputPath, options.expectedMtime, modifiedAt);
      }
    }

    await this.sandbox.retryOnDead(() =>
      this.sandbox.e2b.files.write(filePath, this.e2bContent(content))
    );
  }

  // Appended in the sandbox, so the existing file never crosses the E2B API.
  async appendFile(inputPath: string, content: FileContent): Promise<void> {
    await this.ensureReady();
    const filePath = this.resolve(inputPath);
    const staged = `/tmp/gorkie-append-${randomUUID()}`;
    await this.sandbox.retryOnDead(async () => {
      await this.sandbox.e2b.files.makeDir(path.posix.dirname(filePath));
      await this.sandbox.e2b.files.write(staged, this.e2bContent(content));
      await this.sandbox.e2b.commands.run(
        `cat -- ${sh(staged)} >> ${sh(filePath)}; code=$?; rm -f -- ${sh(staged)}; exit $code`
      );
    });
  }

  async deleteFile(inputPath: string, options?: RemoveOptions): Promise<void> {
    await this.ensureReady();
    const filePath = this.resolve(inputPath);

    try {
      await this.attempt({
        absent: 'file',
        inputPath,
        run: async () => {
          const info = await this.sandbox.retryOnDead(() =>
            this.sandbox.e2b.files.getInfo(filePath)
          );
          if (info.type === FileType.DIR) {
            throw new IsDirectoryError(inputPath);
          }
          await this.sandbox.retryOnDead(() =>
            this.sandbox.e2b.files.remove(filePath)
          );
        },
      });
    } catch (error) {
      if (!(options?.force && error instanceof FileNotFoundError)) {
        throw error;
      }
    }
  }

  async copyFile(
    src: string,
    dest: string,
    options?: CopyOptions
  ): Promise<void> {
    await this.ensureReady();
    const srcPath = this.resolve(src);
    const destPath = this.resolve(dest);

    if (options?.overwrite === false && (await this.exists(dest))) {
      throw new FileExistsError(dest);
    }

    await this.attempt({
      absent: 'file',
      inputPath: src,
      run: async () => {
        const info = await this.sandbox.retryOnDead(() =>
          this.sandbox.e2b.files.getInfo(srcPath)
        );
        if (info.type === FileType.DIR) {
          throw new IsDirectoryError(src);
        }
        await this.sandbox.retryOnDead(async () => {
          await this.sandbox.e2b.files.makeDir(path.posix.dirname(destPath));
          await this.sandbox.e2b.commands.run(
            `cp -T -- ${sh(srcPath)} ${sh(destPath)}`
          );
        });
      },
    });
  }

  async moveFile(
    src: string,
    dest: string,
    options?: CopyOptions
  ): Promise<void> {
    await this.ensureReady();
    const srcPath = this.resolve(src);
    const destPath = this.resolve(dest);

    if (options?.overwrite === false && (await this.exists(dest))) {
      throw new FileExistsError(dest);
    }

    await this.sandbox.retryOnDead(() =>
      this.sandbox.e2b.files.makeDir(path.posix.dirname(destPath))
    );
    await this.attempt({
      absent: 'file',
      inputPath: src,
      run: () =>
        this.sandbox.retryOnDead(() =>
          this.sandbox.e2b.files.rename(srcPath, destPath)
        ),
    });
  }

  async mkdir(
    inputPath: string,
    options?: { recursive?: boolean }
  ): Promise<void> {
    await this.ensureReady();
    const dirPath = this.resolve(inputPath);

    if (options?.recursive === false) {
      await this.assertParent({ filePath: dirPath, inputPath });
    }

    const existing = await this.infoOrAbsent(dirPath);
    if (existing && existing.type !== FileType.DIR) {
      throw new FileExistsError(inputPath);
    }

    await this.sandbox.retryOnDead(() =>
      this.sandbox.e2b.files.makeDir(dirPath)
    );
  }

  async rmdir(inputPath: string, options?: RemoveOptions): Promise<void> {
    await this.ensureReady();
    const dirPath = this.resolve(inputPath);

    try {
      await this.attempt({
        absent: 'directory',
        inputPath,
        run: async () => {
          const info = await this.sandbox.retryOnDead(() =>
            this.sandbox.e2b.files.getInfo(dirPath)
          );
          if (info.type !== FileType.DIR) {
            throw new NotDirectoryError(inputPath);
          }
          if (
            !options?.recursive &&
            (await this.readdir(inputPath)).length > 0
          ) {
            throw new DirectoryNotEmptyError(inputPath);
          }
          await this.sandbox.retryOnDead(() =>
            this.sandbox.e2b.files.remove(dirPath)
          );
        },
      });
    } catch (error) {
      if (!(options?.force && error instanceof DirectoryNotFoundError)) {
        throw error;
      }
    }
  }

  async readdir(
    inputPath: string,
    options?: ListOptions
  ): Promise<FileEntry[]> {
    const entries = await this.walk(inputPath, {
      includeHidden: true,
      maxDepth: options?.recursive ? (options.maxDepth ?? 100) : 1,
    });
    let extensions: string[] | undefined;
    if (Array.isArray(options?.extension)) {
      extensions = options.extension;
    } else if (options?.extension) {
      extensions = [options.extension];
    }

    return entries
      .filter((entry) => {
        if (!(extensions && entry.type === 'file')) {
          return true;
        }
        return extensions.some((ext) => {
          const normalized = ext.startsWith('.') ? ext : `.${ext}`;
          return entry.name.endsWith(normalized);
        });
      })
      .map(({ path: relative, ...entry }) => ({ ...entry, name: relative }));
  }

  // One E2B list call for the whole tree. Without this, list_files reads it
  // one directory per round trip.
  async walk(inputPath: string, options?: WalkOptions): Promise<WalkEntry[]> {
    await this.ensureReady();
    const dirPath = this.resolve(inputPath);

    return this.attempt({
      absent: 'directory',
      inputPath,
      run: async () => {
        const info = await this.sandbox.retryOnDead(() =>
          this.sandbox.e2b.files.getInfo(dirPath)
        );
        if (info.type !== FileType.DIR) {
          throw new NotDirectoryError(inputPath);
        }

        const entries = await this.sandbox.retryOnDead(() =>
          this.sandbox.e2b.files.list(dirPath, {
            depth: options?.maxDepth ?? 100,
          })
        );
        return entries.flatMap((entry) => {
          const relative = path.posix.relative(dirPath, entry.path);
          if (
            !options?.includeHidden &&
            relative.split('/').some((segment) => segment.startsWith('.'))
          ) {
            return [];
          }
          return [
            {
              name: entry.name,
              path: relative,
              type: entry.type === FileType.DIR ? 'directory' : 'file',
              size: entry.type === FileType.FILE ? entry.size : undefined,
              isSymlink: Boolean(entry.symlinkTarget) || undefined,
              symlinkTarget: entry.symlinkTarget,
            } satisfies WalkEntry,
          ];
        });
      },
    });
  }

  async exists(inputPath: string): Promise<boolean> {
    await this.ensureReady();
    return this.sandbox.retryOnDead(() =>
      this.sandbox.e2b.files.exists(this.resolve(inputPath))
    );
  }

  async stat(inputPath: string): Promise<FileStat> {
    await this.ensureReady();
    const filePath = this.resolve(inputPath);
    const info = await this.attempt({
      absent: 'file',
      inputPath,
      run: () =>
        this.sandbox.retryOnDead(() =>
          this.sandbox.e2b.files.getInfo(filePath)
        ),
    });

    return {
      name: info.name,
      path: inputPath,
      type: info.type === FileType.DIR ? 'directory' : 'file',
      size: info.size,
      createdAt: modifiedTime(info),
      modifiedAt: modifiedTime(info),
      mimeType: lookup(filePath) || undefined,
    };
  }

  // One ripgrep run inside the sandbox. Without this, Mastra's grep walks the
  // tree and reads every file over the E2B API one request at a time.
  async grep(options: FilesystemGrepOptions): Promise<FilesystemGrepResult[]> {
    await this.ensureReady();
    const root = this.resolve(options.path);

    try {
      const { stdout } = await this.sandbox.retryOnDead(() =>
        this.sandbox.e2b.commands.run(ripgrepCommand({ ...options, root }), {
          timeoutMs: sandboxConfig.executionTimeout,
        })
      );
      return parseRipgrepJson({
        output: stdout,
        contextLines: options.contextLines,
        maxTotalMatches: options.maxTotalMatches,
        root,
      });
    } catch (error) {
      if (!(error instanceof CommandExitError)) {
        throw error;
      }
      const stderr = error.stderr.trim();
      // Mastra catches this and falls back to its host-side grep, which
      // handles the JS regex syntax ripgrep rejects.
      if (/regex parse error|PCRE2|not allowed in a regex/.test(stderr)) {
        const unsupported = new UnsupportedGrepPatternError(
          options.pattern,
          stderr
        );
        unsupported.cause = error;
        throw unsupported;
      }
      throw new Error(`ripgrep exited with ${error.exitCode}: ${stderr}`, {
        cause: error,
      });
    }
  }

  realpath(inputPath: string): Promise<string> {
    return Promise.resolve(this.resolve(inputPath));
  }

  getInfo(): FilesystemInfo<{ basePath: string }> {
    return {
      id: this.id,
      name: this.name,
      provider: this.provider,
      status: this.status,
      metadata: { basePath: this.basePath },
    };
  }

  getInstructions(): string {
    return `Filesystem tools read and write files inside the same E2B sandbox used by shell commands. Relative paths resolve under ${this.basePath}; absolute paths must stay under ${this.basePath}.`;
  }

  private resolve(inputPath: string): string {
    return confinePath({ basePath: this.basePath, inputPath });
  }

  private async assertParent({
    filePath,
    inputPath,
  }: {
    filePath: string;
    inputPath: string;
  }): Promise<void> {
    await this.attempt({
      absent: 'directory',
      inputPath: path.posix.dirname(inputPath),
      run: async () => {
        const info = await this.sandbox.retryOnDead(() =>
          this.sandbox.e2b.files.getInfo(path.posix.dirname(filePath))
        );
        if (info.type !== FileType.DIR) {
          throw new NotDirectoryError(path.posix.dirname(inputPath));
        }
      },
    });
  }

  private e2bContent(content: FileContent): string | ArrayBuffer {
    if (typeof content === 'string') {
      return content;
    }
    const buffer = Buffer.from(content);
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
  }

  private async infoOrAbsent(filePath: string): Promise<EntryInfo | undefined> {
    try {
      return await this.sandbox.retryOnDead(() =>
        this.sandbox.e2b.files.getInfo(filePath)
      );
    } catch (error) {
      if (error instanceof E2BFileNotFoundError) {
        return;
      }
      throw error;
    }
  }

  private async attempt<T>({
    absent,
    inputPath,
    run,
  }: {
    absent: 'directory' | 'file';
    inputPath: string;
    run: () => Promise<T>;
  }): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof E2BFileNotFoundError)) {
        throw error;
      }
      const translated =
        absent === 'directory'
          ? new DirectoryNotFoundError(inputPath)
          : new FileNotFoundError(inputPath);
      translated.cause = error;
      throw translated;
    }
  }
}
