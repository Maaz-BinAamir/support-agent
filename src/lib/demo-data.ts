import type { AnswerResponse, Citation } from './types';

export const indexedAt = '25 Aug 2026';

export const exampleQuestions = [
	'How do I deploy my first Worker with Wrangler?',
	'How should I configure a route for a Worker?',
	'Where should local environment variables live during development?'
];

const gettingStarted: Citation = {
	id: 'workers-get-started',
	title: 'Get started with Workers',
	section: '3. Write code',
	excerpt:
		'The Workers runtime expects a fetch handler to return a Response object or a Promise which resolves to a Response. You can run the project locally with wrangler dev and deploy it with wrangler deploy.',
	url: 'https://developers.cloudflare.com/workers/get-started/guide/',
	score: 0.91
};

const routing: Citation = {
	id: 'workers-routes',
	title: 'Routes and domains',
	section: 'What is best for me?',
	excerpt:
		'There are three types of routes: Custom Domains, Routes, and workers.dev subdomains. The workers.dev subdomain is intended for personal or hobby projects.',
	url: 'https://developers.cloudflare.com/workers/configuration/routing/',
	score: 0.88
};

const variables: Citation = {
	id: 'workers-env',
	title: 'Environment variables',
	section: 'Local development',
	excerpt:
		'Environment variables are a type of binding that attach text strings or JSON values to your Worker. Keep local values in your local development configuration and secrets out of source control.',
	url: 'https://developers.cloudflare.com/workers/local-development/environment-variables/',
	score: 0.86
};

export const demoAnswers: Record<string, AnswerResponse> = {
	[exampleQuestions[0]]: {
		answer:
			'Create a Worker project with the Wrangler CLI, replace the starter `fetch` handler with your code, and deploy it when the local preview looks right.',
		citations: [gettingStarted],
		followUps: ['How do I run the Worker locally before deploying?', 'What should my fetch handler return?'],
		indexedAt,
		retrievedCount: 4,
		scoreRange: '0.91–0.74'
	},
	[exampleQuestions[1]]: {
		answer:
			'Use a workers.dev subdomain for a personal project or connect the Worker to a route or custom domain when it is the origin for your application. The route type determines how requests reach the Worker.',
		citations: [routing],
		followUps: ['What is the difference between a route and a custom domain?', 'How do I test a route locally?'],
		indexedAt,
		retrievedCount: 5,
		scoreRange: '0.88–0.71'
	},
	[exampleQuestions[2]]: {
		answer:
			'Treat local environment values as development configuration and keep secrets out of source control. In Workers, environment variables are bindings that can provide text or JSON values to your code.',
		citations: [variables],
		followUps: ['How do bindings differ from secrets?', 'Where do I configure variables for a deployed Worker?'],
		indexedAt,
		retrievedCount: 3,
		scoreRange: '0.86–0.69'
	}
};

export function getDemoAnswer(question: string): AnswerResponse {
		const direct = demoAnswers[question];
		if (direct) return direct;

		return {
			answer:
				'I could not verify that question against the indexed Workers Core documentation. Try asking about deployment, routes and domains, local development, configuration, limits, or Wrangler.',
			citations: [],
			followUps: [exampleQuestions[0], exampleQuestions[1]],
			indexedAt,
			retrievedCount: 0,
			scoreRange: 'No supporting passages'
		};
}
