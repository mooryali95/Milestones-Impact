import { assertEquals } from "jsr:@std/assert@1.0.19";
import { orphanPaths, uploadRefusal, UPLOAD_LIMITS } from "./upload-limits.js";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 36e5).toISOString();
Deno.test("upload-limits: العدد والحجم", () => {
  assertEquals(uploadRefusal({ issued: UPLOAD_LIMITS.perDay, files: [], now: NOW }), "count");
  assertEquals(uploadRefusal({ issued: 0, files: [{ created_at: ago(2), metadata: { size: UPLOAD_LIMITS.bytesPerDay } }], now: NOW }), "bytes");
  assertEquals(uploadRefusal({ issued: 0, files: [{ created_at: ago(25), metadata: { size: UPLOAD_LIMITS.bytesPerDay } }], now: NOW }), null);
});
Deno.test("upload-limits: اليتيم غير المربوط الأقدم من المدة وحده", () => {
  const objs = [{ path: "p/cv/a.pdf", created_at: ago(72) }, { path: "p/cv/b.pdf", created_at: ago(72) }, { path: "p/cv/c.pdf", created_at: ago(2) }];
  assertEquals(orphanPaths(objs, new Set(["p/cv/a.pdf"]), NOW), ["p/cv/b.pdf"]);
});
