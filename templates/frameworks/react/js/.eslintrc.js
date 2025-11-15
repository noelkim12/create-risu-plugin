module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended',
  ],
  plugins: ['react', 'react-hooks', 'simple-import-sort', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  rules: {
    'prettier/prettier': 'warn',
    'no-undef': 'off',
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off', // React 17+ 에서는 불필요
    'simple-import-sort/imports': [
      'warn',
      {
        // import 순서 정의
        groups: [
          ['^node:'], // node 내장 모듈
          ['^\\u0000'], // side effect imports (e.g. import './style.css')
          ['^react', '^@?\\w'], // 외부 라이브러리 (react 관련 먼저)
          ['^\\./.*\\.s?css$', '^\\./'], // css 파일 먼저, 나머지 상대 경로
          ['^\\.\\.(?!/?$)', '^\\.\\./?$'], // 상위 디렉토리 상대경로 import
        ],
      },
    ],
    'simple-import-sort/exports': 'warn',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};
