import { configDefaults, defineConfig } from 'vitest/config';

// Los worktrees de .claude/ son copias del repo: sus tests no son los nuestros.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, '.claude/**'] } });
