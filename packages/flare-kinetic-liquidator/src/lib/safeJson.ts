import fs from "fs";

/**
 * Safely load JSON from a file, returning empty object if file doesn't exist or is invalid
 */
export function loadJson(path: string): any {
  try {
    if (!fs.existsSync(path)) return {};
    const s = fs.readFileSync(path, 'utf8');
    return s.trim() ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

/**
 * Atomically save JSON to a file using temp file + rename
 */
export function saveJson(path: string, obj: any): void {
  const tmp = path + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, path);
}

/**
 * Get size of a JSON cache file
 */
export function getCacheSize(path: string): number {
  try {
    const data = loadJson(path);
    if (Array.isArray(data)) return data.length;
    if (typeof data === 'object' && data !== null) return Object.keys(data).length;
    return 0;
  } catch {
    return 0;
  }
}

