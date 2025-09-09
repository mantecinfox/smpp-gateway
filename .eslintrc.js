module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: [
    '@typescript-eslint'
  ],
  rules: {
    'indent': ['error', 2],
    'linebreak-style': ['error', 'unix'],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'no-unused-vars': 'warn',
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error'
  },
  overrides: [
    {
      files: ['frontend/src/**/*.{js,jsx,ts,tsx}'],
      extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended'
      ],
      plugins: [
        'react',
        'react-hooks'
      ],
      rules: {
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn'
      },
      settings: {
        react: {
          version: 'detect'
        }
      }
    },
    {
      files: ['backend/**/*.{js,ts}'],
      extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended'
      ],
      rules: {
        'no-console': 'off'
      }
    }
  ]
};