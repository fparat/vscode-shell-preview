import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
      ],
      'semi': 'warn',
      'curly': 'warn',
      'eqeqeq': 'warn',
      '@typescript-eslint/only-throw-error': 'warn',
    },
  },
  {
    ignores: ['out/', 'dist/', '**/*.d.ts'],
  }
);
