import fs from 'fs/promises';
import path from 'path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

const DEFAULT_BACKGROUND_LIBRARY_DIR = path.resolve(__dirname, '../../../backgrounds');

export interface BackgroundAsset {
  id: string;
  name: string;
  folder: string;
  relativePath: string;
  url: string;
}

const toPosixPath = (value: string) => value.split(path.sep).join('/');

const encodePathId = (relativePath: string) => Buffer.from(relativePath, 'utf8').toString('base64url');

const decodePathId = (id: string) => Buffer.from(id, 'base64url').toString('utf8');

const encodePathForUrl = (relativePath: string) => (
  toPosixPath(relativePath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
);

const isImageFile = (filePath: string) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());

const getLibraryRoot = () => process.env.BACKGROUND_LIBRARY_DIR || DEFAULT_BACKGROUND_LIBRARY_DIR;

const ensureWithinLibrary = (libraryRoot: string, absolutePath: string) => {
  const normalizedRoot = path.resolve(libraryRoot);
  const normalizedTarget = path.resolve(absolutePath);
  const relative = path.relative(normalizedRoot, normalizedTarget);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('Background path is outside of the configured library');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
};

const collectFiles = async (directory: string): Promise<string[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(absolutePath);
    }

    return isImageFile(entry.name) ? [absolutePath] : [];
  }));

  return files.flat();
};

const removeEmptyParentDirectories = async (startDirectory: string, rootDirectory: string) => {
  let currentDirectory = startDirectory;
  const normalizedRoot = path.resolve(rootDirectory);

  while (currentDirectory.startsWith(normalizedRoot) && currentDirectory !== normalizedRoot) {
    const children = await fs.readdir(currentDirectory);
    if (children.length > 0) {
      return;
    }

    await fs.rmdir(currentDirectory);
    currentDirectory = path.dirname(currentDirectory);
  }
};

export const backgroundLibrary = {
  getLibraryRoot,

  async list(): Promise<BackgroundAsset[]> {
    const libraryRoot = getLibraryRoot();

    try {
      const files = await collectFiles(libraryRoot);

      return files
        .map((absolutePath) => {
          const relativePath = toPosixPath(path.relative(libraryRoot, absolutePath));
          const folder = relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '';

          return {
            id: encodePathId(relativePath),
            name: path.basename(absolutePath),
            folder,
            relativePath,
            url: `/backgrounds/${encodePathForUrl(relativePath)}`
          };
        })
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'zh-CN'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  },

  async deleteById(id: string): Promise<BackgroundAsset | null> {
    const libraryRoot = getLibraryRoot();
    const relativePath = decodePathId(id);
    const absolutePath = path.resolve(libraryRoot, relativePath);

    ensureWithinLibrary(libraryRoot, absolutePath);

    try {
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile() || !isImageFile(absolutePath)) {
        const error = new Error('Background not found');
        (error as Error & { statusCode?: number }).statusCode = 404;
        throw error;
      }

      await fs.unlink(absolutePath);
      await removeEmptyParentDirectories(path.dirname(absolutePath), libraryRoot);

      const normalizedRelativePath = toPosixPath(path.relative(libraryRoot, absolutePath));

      return {
        id,
        name: path.basename(absolutePath),
        folder: normalizedRelativePath.includes('/')
          ? normalizedRelativePath.slice(0, normalizedRelativePath.lastIndexOf('/'))
          : '',
        relativePath: normalizedRelativePath,
        url: `/backgrounds/${encodePathForUrl(normalizedRelativePath)}`
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }
};
