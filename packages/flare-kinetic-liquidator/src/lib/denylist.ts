import fs from "fs";
import path from "path";

const DEF_PATH = process.env.DENYLIST_FILE || path.resolve(__dirname, "../../config/denylist.txt");

let denyset = new Set<string>();

/**
 * Load denylist from file. Each line should be a single address.
 * Empty lines and whitespace are ignored.
 */
export function loadDenylist(filePath = DEF_PATH): boolean {
  try {
    const txt = fs.readFileSync(filePath, "utf8");
    denyset = new Set(
      txt
        .split(/\r?\n/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
    );
    console.log(`[Denylist] Loaded ${denyset.size} addresses from ${filePath}`);
    return true;
  } catch (e: any) {
    if (e.code === "ENOENT") {
      console.log(`[Denylist] File not found: ${filePath}, starting with empty denylist`);
    } else {
      console.warn(`[Denylist] Failed to load: ${e.message}`);
    }
    denyset = new Set();
    return false;
  }
}

/**
 * Check if an address is on the denylist
 */
export function isDenied(addr: string): boolean {
  return denyset.has(addr.toLowerCase());
}

/**
 * Add an address to the in-memory denylist
 */
export function addDenied(addr: string): void {
  denyset.add(addr.toLowerCase());
}

/**
 * Remove an address from the in-memory denylist
 */
export function removeDenied(addr: string): void {
  denyset.delete(addr.toLowerCase());
}

/**
 * Get count of denied addresses
 */
export function getDenylistSize(): number {
  return denyset.size;
}

/**
 * Optional: hot-reload file on change for ops convenience
 */
export function watchDenylist(filePath = DEF_PATH): void {
  try {
    fs.watchFile(filePath, { interval: 2000 }, () => {
      console.log(`[Denylist] File changed, reloading...`);
      loadDenylist(filePath);
    });
    console.log(`[Denylist] Watching ${filePath} for changes`);
  } catch (e: any) {
    console.warn(`[Denylist] Failed to watch file: ${e.message}`);
  }
}

// Initially load on module import
loadDenylist();

