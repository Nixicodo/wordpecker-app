import fs from 'fs/promises';
import path from 'path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const MANIFEST_CACHE_MS = 5 * 60 * 1000;
const DEFAULT_BACKGROUND_LIBRARY_DIR = path.resolve(__dirname, '../../../backgrounds');

export interface BackgroundAsset {
  id: string;
  name: string;
  folder: string;
  relativePath: string;
  url: string;
}

let cachedManifest: BackgroundAsset[] | null = null;
let cachedManifestExpiresAt = 0;
let cachedManifestRoot: string | null = null;
let manifestPromise: Promise<BackgroundAsset[]> | null = null;

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

const scanBackgrounds = async (libraryRoot: string): Promise<BackgroundAsset[]> => {
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
};

const loadManifest = async (forceRefresh = false): Promise<BackgroundAsset[]> => {
  const now = Date.now();
  const libraryRoot = getLibraryRoot();

  if (!forceRefresh && cachedManifest && cachedManifestRoot === libraryRoot && now < cachedManifestExpiresAt) {
    return cachedManifest;
  }

  if (!forceRefresh && manifestPromise && cachedManifestRoot === libraryRoot) {
    return manifestPromise;
  }

  cachedManifestRoot = libraryRoot;
  manifestPromise = scanBackgrounds(libraryRoot)
    .catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    })
    .then((backgrounds) => {
      cachedManifest = backgrounds;
      cachedManifestExpiresAt = Date.now() + MANIFEST_CACHE_MS;
      manifestPromise = null;
      return backgrounds;
    })
    .catch((error) => {
      manifestPromise = null;
      throw error;
    });

  return manifestPromise;
};

const pickRandomBackground = (backgrounds: BackgroundAsset[], excludeId?: string | null) => {
  if (backgrounds.length === 0) {
    return null;
  }

  const candidates = excludeId
    ? backgrounds.filter((background) => background.id !== excludeId)
    : backgrounds;

  if (candidates.length === 0) {
    return null;
  }

  return candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
};

export const backgroundLibrary = {
  getLibraryRoot,

  async list(): Promise<BackgroundAsset[]> {
    return loadManifest();
  },

  async getRandom(options?: {
    excludeId?: string;
    preferredId?: string;
  }): Promise<{ background: BackgroundAsset | null; total: number }> {
    const backgrounds = await loadManifest();
    const preferredBackground = options?.preferredId
      ? backgrounds.find((background) => background.id === options.preferredId) ?? null
      : null;

    if (preferredBackground) {
      return {
        background: preferredBackground,
        total: backgrounds.length
      };
    }

    return {
      background: pickRandomBackground(backgrounds, options?.excludeId ?? null),
      total: backgrounds.length
    };
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
      const deletedBackground = {
        id,
        name: path.basename(absolutePath),
        folder: normalizedRelativePath.includes('/')
          ? normalizedRelativePath.slice(0, normalizedRelativePath.lastIndexOf('/'))
          : '',
        relativePath: normalizedRelativePath,
        url: `/backgrounds/${encodePathForUrl(normalizedRelativePath)}`
      };

      cachedManifest = cachedManifest?.filter((background) => background.id !== id) ?? null;
      cachedManifestRoot = libraryRoot;
      cachedManifestExpiresAt = Date.now() + MANIFEST_CACHE_MS;

      return deletedBackground;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }
};
