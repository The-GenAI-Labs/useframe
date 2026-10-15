import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// React and React hooks rules for shared component packages, applied to `files`.
export function reactConfig(files) {
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
      plugins: { "react-hooks": pluginReactHooks },
      rules: {
        ...pluginReactHooks.configs.recommended.rules,
        "react/react-in-jsx-scope": "off",
        "react/prop-types": "off",
      },
    },
  ];
}
