import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist-electron/**",
      "proxy/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    // Electron main/preload run in a Node context, not the browser.
    files: ["electron/**/*.js"],
    rules: {
      "@next/next/no-assign-module-variable": "off",
    },
  },
];

export default eslintConfig;
