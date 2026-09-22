import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "url";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },
      adapter: adapter(),
      paths: {
        base: process.env.NODE_ENV === "production" ? "/spall" : "",
      }
    }),
  ],
  resolve: {
    alias: { "@lucasmelin/spall": fileURLToPath(new URL("../src/spall.ts", import.meta.url)) },
  },
  server: { fs: { allow: [".."] } }, // Vite blocks files outside the website folder by default
});
