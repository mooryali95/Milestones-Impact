// في ملف مستقل لا داخل index.html، كي تمنع CSP كل سكربت مضمّن.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  );
}
