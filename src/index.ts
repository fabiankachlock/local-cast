import Alpine from "alpinejs/dist/module.esm";

import "./theme";

Alpine.data("select", () => ({
  mode: "stream" as "stream" | "call" | "broadcast",
  select(id: string) {
    this.mode = id;
  },
}));

Alpine.start();
