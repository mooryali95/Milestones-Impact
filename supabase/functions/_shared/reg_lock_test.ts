import { assertEquals } from "jsr:@std/assert@1.0.19";
import { lockFields } from "./reg-lock.js";

const NOW = "2026-11-27T12:00:00.000Z";
Deno.test("reg-lock: المسجل لا يمسح القفل", () => {
  assertEquals(lockFields({ submitted: true, reopenRequested: true }, { submitted: false, reopenRequested: false, submittedAt: null }, NOW), {});
});
Deno.test("reg-lock: التقديم الأول بوقت الخادم، وطلب إعادة الفتح", () => {
  assertEquals(lockFields({ submitted: false }, { submitted: true, submittedAt: "x" }, NOW), { submitted: true, submittedAt: NOW });
  assertEquals(lockFields({ submitted: true, reopenRequested: false }, { reopenRequested: true }, NOW), { reopenRequested: true });
});
