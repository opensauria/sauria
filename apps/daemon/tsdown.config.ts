import { defineConfig } from 'tsdown'

export default defineConfig({
  noExternal: [/^@opensauria\//],
})
