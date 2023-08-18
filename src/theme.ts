import Alpine from "alpinejs/dist/module.esm";

const iconElm = document.head.querySelector("link[rel=icon]");
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
  iconElm?.setAttribute("href", "/icons/icon_dark.svg");
} else {
  document.documentElement.classList.remove("dark");
  iconElm?.setAttribute("href", "/icons/icon_light.svg");
}

Alpine.store("theme", {
  isDark: document.documentElement.classList.contains("dark"),
  toggle() {
    this.isDark = !this.isDark;
    if (this.isDark) {
      document.documentElement.classList.add("dark");
      iconElm?.setAttribute("href", "/icons/icon_dark.svg");
    } else {
      document.documentElement.classList.remove("dark");
      iconElm?.setAttribute("href", "/icons/icon_light.svg");
    }
    localStorage.setItem("localcast:theme", this.isDark);
  },
  init() {
    const stored = localStorage.getItem("localcast:theme");
    if (stored) {
      this.isDark = stored === "true";
    }
    if (this.isDark) {
      document.documentElement.classList.add("dark");
      iconElm?.setAttribute("href", "/icons/icon_dark.svg");
    } else {
      document.documentElement.classList.remove("dark");
      iconElm?.setAttribute("href", "/icons/icon_light.svg");
    }
  },
});

// (function () {
//   var s = document.createElement("script");
//   s.src = "https://cdn.jsdelivr.net/npm/eruda";
//   document.body.append(s);
//   s.onload = function () {
//     eruda.init();
//   };
// })();
