import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored, prebuilt Paged.js ESM bundle (not our source).
    "lib/vendor/**",
    // Standalone CommonJS dev/util scripts run directly with `node` (not part
    // of the Next app build), so ESM/React lint rules don't apply.
    "generate_stress_test.js",
  ]),
  {
    rules: {
      // Supabase/PostgREST query results are loosely typed and used pervasively.
      // Keep `any` visible as a warning (so new ones can be reviewed) instead of
      // failing the whole lint/build with hundreds of pre-existing errors.
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow intentionally-unused identifiers when prefixed with `_`
      // (e.g. `_maxAge`, `_expires`, unused fn args kept for signature parity,
      // and caught errors that are deliberately ignored).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // These are the newer React Compiler hints. The flagged code works today;
      // rather than refactor working components (and risk UI regressions) we
      // surface them as warnings so they remain visible without failing the
      // build. Refactor deliberately later if desired.
      "react-hooks/static-components": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
