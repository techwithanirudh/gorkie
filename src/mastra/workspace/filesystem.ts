import path from 'node:path';
import type {
  CopyOptions,
  FileContent,
  FileEntry,
  FileStat,
  FilesystemInfo,
  ListOptions,
  ProviderStatus,
  ReadOptions,
  RemoveOptions,
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
  WorkspaceReadOnlyError,
} from '@mastra/core/workspace';
import type { E2BSandbox } from '@mastra/e2b';
import { FileNotFoundError as E2BFileNotFoundError, FileType } from 'e2b';
import { lookup } from 'mime-types';
import { sandbox as config } from '../config';

interface E2BFilesystemOptions {
  basePath?: string;
  readOnly?: boolean;
  sandbox: E2BSandbox;
}

export class E2BFilesystem extends MastraFilesystem {
  readonly id: string;
  readonly name = 'E2BFilesystem';
  readonly provider = 'e2b';
  readonly readOnly?: boolean;
  readonly basePath: string;
  status: ProviderStatus = 'pending';

  constructor(options: E2BFilesystemOptions) {
    super({ name: 'E2BFilesystem' });
    this.id = `${options.sandbox.id}-filesystem`;
    this.basePath = path.posix.normalize(options.basePath ?? config.workdir);
    this.readOnly = options.readOnly;
    this.sandbox = options.sandbox;
  }

  private readonly sandbox: E2BSandbox;

  async init(): Promise<void> {
    await this.sandbox.ensureRunning();
    await this.sandbox.retryOnDead(() =>
      this.sandbox.e2b.files.makeDir(this.basePath)
    );
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }

  async readFile(
    inputPath: string,
    options?: ReadOptions
  ): Promise<string | Buffer> {
    await this.ensureReady();
    const filePath = this.resolve(inputPath);

    try {
      const info = await this.e2b(() =>
        this.sandbox.e2b.files.getInfo(filePath)
      );
      if (info.type === FileType.DIR) {
        throw new IsDirectoryError(inputPath);
      }

      if (options?.encoding) {
        if (options.encoding === 'base64' || options.encoding === 'hex') {
          const bytes = await this.e2b(() =>
            this.sandbox.e2b.files.read(filePath, { format: 'bytes' })
          );
          return Buffer.from(bytes).toString(options.encoding);
        }

        if (options.encoding === 'binary') {
          const bytes = await this.e2b(() =>
            this.sandbox.e2b.files.read(filePath, { format: 'bytes' })
          );
          return Buffer.from(bytes).toString('binary');
        }

        return this.e2b(() =>
          this.sandbox.e2b.files.read(filePath, { format: 'text' })
        );
      }

      const bytes = await this.e2b(() =>
        this.sandbox.e2b.files.read(filePath, { format: 'bytes' })
      );
      return Buffer.from(bytes);
    } catch (error) {
      if (error instanceof IsDirectoryError) {
        throw error;
      }
      if (this.isNotFound(error)) {
        throw new FileNotFoundError(inputPath);
      }
      throw error;
    }
  }

  async writeFile(
    inputPath: string,
    content: FileContent,
    options?: WriteOptions
  ): Promise<void> {
    await this.ensureReady();
    this.assertWritable('writeFile');
    const filePath = this.resolve(inputPath);

    if (options?.recursive === false) {
      await this.assertParentDirectory(filePath, inputPath);
    } else {
      await this.e2b(() =>
        this.sandbox.e2b.files.makeDir(path.posix.dirname(filePath))
      );
    }

    if (options?.overwrite === false && (await this.exists(inputPath))) {
      throw new FileExistsError(inputPath);
    }

    if (options?.expectedMtime) {
      try {
        const info = await this.e2b(() =>
          this.sandbox.e2b.files.getInfo(filePath)
        );
        const modifiedAt = info.modifiedTime ?? new Date(0);
        if (modifiedAt.getTime() !== options.expectedMtime.getTime()) {
          throw new StaleFileError(
            inputPath,
            options.expectedMtime,
            modifiedAt
          );
        }
      } catch (error) {
        if (error instanceof StaleFileError) {
          throw error;
        }
        if (!this.isNotFound(error)) {
          throw error;
        }
      }
    }

    await this.e2b(() =>
      this.sandbox.e2b.files.write(filePath, this.toE2BContent(content))
    );
  }

  async appendFile(inputPath: string, content: FileContent): Promise<void> {
    await this.ensureReady();
    this.assertWritable('appendFile');
    const filePath = this.resolve(inputPath);
    await this.e2b(() =>
      this.sandbox.e2b.files.makeDir(path.posix.dirname(filePath))
    );
    const current = (await this.exists(inputPath))
      ? await this.e2b(() =>
          this.sandbox.e2b.files.read(filePath, { format: 'bytes' })
        )
      : new Uint8Array();
    await this.e2b(() =>
      this.sandbox.e2b.files.write(
        filePath,
        this.toE2BContent(
          Buffer.concat([Buffer.from(current), Buffer.from(content)])
        )
      )
    );
  }

  async deleteFile(inputPath: string, options?: RemoveOptions): Promise<void> {
    await this.ensureReady();
    this.assertWritable('deleteFile');
    const filePath = this.resolve(inputPath);

    try {
      const info = await this.e2b(() =>
        this.sandbox.e2b.files.getInfo(filePath)
      );
      if (info.type === FileType.DIR) {
        throw new IsDirectoryError(inputPath);
      }
      await this.e2b(() => this.sandbox.e2b.files.remove(filePath));
    } catch (error) {
      if (error instanceof IsDirectoryError) {
        throw error;
      }
      if (this.isNotFound(error)) {
        if (!options?.force) {
          throw new FileNotFoundError(inputPath);
        }
        return;
      }
      throw error;
    }
  }

  async copyFile(
    src: string,
    dest: string,
    options?: CopyOptions
  ): Promise<void> {
    await this.ensureReady();
    this.assertWritable('copyFile');
    const srcPath = this.resolve(src);
    const destPath = this.resolve(dest);

    if (options?.overwrite === false && (await this.exists(dest))) {
      throw new FileExistsError(dest);
    }

    try {
      const info = await this.e2b(() =>
        this.sandbox.e2b.files.getInfo(srcPath)
      );
      if (info.type === FileType.DIR) {
        throw new IsDirectoryError(src);
      }
      await this.e2b(() =>
        this.sandbox.e2b.files.makeDir(path.posix.dirname(destPath))
      );
      const content = await this.e2b(() =>
        this.sandbox.e2b.files.read(srcPath, { format: 'bytes' })
      );
      await this.e2b(() =>
        this.sandbox.e2b.files.write(destPath, this.toE2BContent(content))
      );
    } catch (error) {
      if (error instanceof IsDirectoryError) {
        throw error;
      }
      if (this.isNotFound(error)) {
        throw new FileNotFoundError(src);
      }
      throw error;
    }
  }

  async moveFile(
    src: string,
    dest: string,
    options?: CopyOptions
  ): Promise<void> {
    await this.ensureReady();
    this.assertWritable('moveFile');
    const srcPath = this.resolve(src);
    const destPath = this.resolve(dest);

    if (options?.overwrite === false && (await this.exists(dest))) {
      throw new FileExistsError(dest);
    }

    await this.e2b(() =>
      this.sandbox.e2b.files.makeDir(path.posix.dirname(destPath))
    );
    try {
      await this.e2b(() => this.sandbox.e2b.files.rename(srcPath, destPath));
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new FileNotFoundError(src);
      }
      throw error;
    }
  }

  async mkdir(
    inputPath: string,
    options?: { recursive?: boolean }
  ): Promise<void> {
    await this.ensureReady();
    this.assertWritable('mkdir');
    const dirPath = this.resolve(inputPath);

    if (options?.recursive === false) {
      await this.assertParentDirectory(dirPath, inputPath);
    }

    try {
      const info = await this.e2b(() =>
        this.sandbox.e2b.files.getInfo(dirPath)
      );
      if (info.type !== FileType.DIR) {
        throw new FileExistsError(inputPath);
      }
    } catch (error) {
      if (error instanceof FileExistsError) {
        throw error;
      }
      if (!this.isNotFound(error)) {
        throw error;
      }
    }

    await this.e2b(() => this.sandbox.e2b.files.makeDir(dirPath));
  }

  async rmdir(inputPath: string, options?: RemoveOptions): Promise<void> {
    await this.ensureReady();
    this.assertWritable('rmdir');
    const dirPath = this.resolve(inputPath);

    try {
      const info = await this.e2b(() =>
        this.sandbox.e2b.files.getInfo(dirPath)
      );
      if (info.type !== FileType.DIR) {
        throw new NotDirectoryError(inputPath);
      }
      if (!options?.recursive && (await this.readdir(inputPath)).length > 0) {
        throw new DirectoryNotEmptyError(inputPath);
      }
      await this.e2b(() => this.sandbox.e2b.files.remove(dirPath));
    } catch (error) {
      if (
        error instanceof NotDirectoryError ||
        error instanceof DirectoryNotEmptyError
      ) {
        throw error;
      }
      if (this.isNotFound(error)) {
        if (!options?.force) {
          throw new DirectoryNotFoundError(inputPath);
        }
        return;
      }
      throw error;
    }
  }

  async readdir(
    inputPath: string,
    options?: ListOptions
  ): Promise<FileEntry[]> {
    await this.ensureReady();
    const dirPath = this.resolve(inputPath);

    try {
      const info = await this.e2b(() =>
        this.sandbox.e2b.files.getInfo(dirPath)
      );
      if (info.type !== FileType.DIR) {
        throw new NotDirectoryError(inputPath);
      }

      const entries = await this.e2b(() =>
        this.sandbox.e2b.files.list(dirPath, {
          depth: options?.recursive ? (options.maxDepth ?? 100) : 1,
        })
      );
      let extensions: string[] | undefined;
      if (Array.isArray(options?.extension)) {
        extensions = options.extension;
      } else if (options?.extension) {
        extensions = [options.extension];
      }

      return entries
        .filter((entry) => {
          if (!(extensions && entry.type === FileType.FILE)) {
            return true;
          }
          return extensions.some((ext) => {
            const normalized = ext.startsWith('.') ? ext : `.${ext}`;
            return entry.name.endsWith(normalized);
          });
        })
        .map((entry) => ({
          name: entry.name,
          type: entry.type === FileType.DIR ? 'directory' : 'file',
          size: entry.type === FileType.FILE ? entry.size : undefined,
          isSymlink: Boolean(entry.symlinkTarget) || undefined,
          symlinkTarget: entry.symlinkTarget,
        }));
    } catch (error) {
      if (error instanceof NotDirectoryError) {
        throw error;
      }
      if (this.isNotFound(error)) {
        throw new DirectoryNotFoundError(inputPath);
      }
      throw error;
    }
  }

  async exists(inputPath: string): Promise<boolean> {
    await this.ensureReady();
    return this.e2b(() =>
      this.sandbox.e2b.files.exists(this.resolve(inputPath))
    );
  }

  async stat(inputPath: string): Promise<FileStat> {
    await this.ensureReady();
    const filePath = this.resolve(inputPath);
    let info: Awaited<ReturnType<typeof this.sandbox.e2b.files.getInfo>>;
    try {
      info = await this.e2b(() => this.sandbox.e2b.files.getInfo(filePath));
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new FileNotFoundError(inputPath);
      }
      throw error;
    }

    return {
      name: info.name,
      path: inputPath,
      type: info.type === FileType.DIR ? 'directory' : 'file',
      size: info.size,
      createdAt: info.modifiedTime ?? new Date(),
      modifiedAt: info.modifiedTime ?? new Date(),
      mimeType: lookup(filePath) || undefined,
    };
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
      readOnly: this.readOnly,
      metadata: { basePath: this.basePath },
    };
  }

  getInstructions(): string {
    return `Filesystem tools read and write files inside the same E2B sandbox used by shell commands. Relative paths resolve under ${this.basePath}; absolute paths must stay under ${this.basePath}.`;
  }

  private resolve(inputPath: string): string {
    const resolved = path.posix.normalize(
      path.posix.isAbsolute(inputPath)
        ? inputPath
        : path.posix.join(this.basePath, inputPath)
    );
    if (
      !(resolved === this.basePath || resolved.startsWith(`${this.basePath}/`))
    ) {
      throw new PermissionError(inputPath, 'access');
    }
    return resolved;
  }

  private assertWritable(operation: string): void {
    if (this.readOnly) {
      throw new WorkspaceReadOnlyError(operation);
    }
  }

  private async assertParentDirectory(
    filePath: string,
    inputPath: string
  ): Promise<void> {
    const parentPath = path.posix.dirname(filePath);
    try {
      const info = await this.e2b(() =>
        this.sandbox.e2b.files.getInfo(parentPath)
      );
      if (info.type !== FileType.DIR) {
        throw new NotDirectoryError(path.posix.dirname(inputPath));
      }
    } catch (error) {
      if (error instanceof NotDirectoryError) {
        throw error;
      }
      if (this.isNotFound(error)) {
        throw new DirectoryNotFoundError(path.posix.dirname(inputPath));
      }
      throw error;
    }
  }

  private toE2BContent(content: FileContent): string | ArrayBuffer {
    if (typeof content === 'string') {
      return content;
    }
    const buffer = Buffer.from(content);
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
  }

  private e2b<T>(operation: () => Promise<T>): Promise<T> {
    return this.sandbox.retryOnDead(operation);
  }

  private isNotFound(error: unknown): boolean {
    return (
      error instanceof E2BFileNotFoundError ||
      (error instanceof Error && error.name === 'FileNotFoundError') ||
      (error instanceof Error && error.message.includes('[not_found]'))
    );
  }
}
