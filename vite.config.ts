import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter()
		})
	],
	server: {
		watch: {
			// Keep frontend HMR focused on frontend source, not local dependency caches.
			ignored: ['**/.pnpm-store/**', '**/.uv-cache/**', '**/services/retrieval/**']
		}
	}
});
