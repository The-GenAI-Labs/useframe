import pluginNext from "@next/eslint-plugin-next";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// React, React hooks and Next.js rules, applied on top of the base config to `files`.
// rootDir is the Next.js app's directory relative to the repo root.
export function nextJsConfig(files, rootDir) {
  return [
    {
      files,
      ...pluginReact.configs.flat.recommended,
      languageOptions: {
        ...pluginReact.configs.flat.recommended.languageOptions,
        globals: { ...globals.browser },
      },
      settings: { react: { version: "detect" } },
    },
    {
      files,
      plugins: {
        "react-hooks": pluginReactHooks,
        "@next/next": pluginNext,
      },
      settings: { next: { rootDir } },
      rules: {
        ...pluginReactHooks.configs.recommended.rules,
        ...pluginNext.configs.recommended.rules,
        ...pluginNext.configs["core-web-vitals"].rules,
        "react/react-in-jsx-scope": "off",
        "react/prop-types": "off",
      },
    },
  ];
}
