import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "fs";

export default defineConfig({
  plugins: [react()],
  base: "/jaloqa.github.io/",
  build: {
    outDir: "dist",
    rollupOptions: {
      plugins: [
        {
          name: "copy-nojekyll",
          buildEnd() {
            copyFileSync("public/.nojekyll", "dist/.nojekyll");
          },
        },
      ],
    },
  },
});
