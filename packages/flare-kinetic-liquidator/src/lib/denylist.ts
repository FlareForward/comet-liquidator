import fs from "fs";
import path from "path";

const DEF_PATH = process.env.DENYLIST_FILE || path.resolve(__dirname, "../../config/denylist.txt");

let denyset = new Set<string>();

// Hard-coded ignore addresses supplied by ops (normalized to lowercase)
export const IGNORE_ADDR = new Set<string>([
  "0x0811e928418f431acddd944c58791b44a64e431d","0x5efaa756663e9eb471576deaa49302bd689a57c0",
  "0x0c9c9008f7150260af1ea1312d30d87cd22ee0d5","0xe92a4d70490ce772ac48b9b588c28e81e17aa702",
  "0x1871efa5823b87ede367d151da466f9b960a35e4","0xa5a9a9bf8e74d5df0bd2eb482679ebffa48838e6",
  "0xd74909725a4c04c977968529fb194c0d213dbdc5","0x80c86921839c3a39b66bdc660d8283df142e00d4",
  "0x37e77065de5d9ea7484b3415783b30bd31870a78","0x5e3cd40b3b329aa21f2112d4d932f3881f6dd648",
  "0xcf6d2c49682e1df129b9409fcfacde64ba74e814","0x019f1d8ec634b10a5388e8aa61d4595f51da0261",
  "0xe71e54850a2406858d5390138456d73586705848","0x21e2d0849082b96563d363dd92f6fcea4a234503",
  "0x6660da98f4bb00ee23d052e2b4dfd701bd43f65b","0x0f0d7e3835a7b424d645884f86d4698689d00096",
  "0xaa2855c6804f0e3363ae05d37bee3f33540e0e0b","0x8df228198d1656c33a5075bba7910811dd2546e1",
  "0x2dae88d93ee9c9e675513ab62f52cfbd8085dc6b","0x1af23a303a1ac34cbd606338bde34746a3970bb8",
  "0x61c021837e5f96a954be1e6a2ec399377463890f","0x91830d51bbdc7010876f3d7cd2cd1866985643f5",
]);

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
  const a = addr.toLowerCase();
  return denyset.has(a) || IGNORE_ADDR.has(a);
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

