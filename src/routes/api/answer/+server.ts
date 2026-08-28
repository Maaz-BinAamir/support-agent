import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { streamText } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import type { RequestHandler } from './$types';

type RetrievedPassage = {
	id: string;
	title: string;
	section: string;
	content: string;
	url: string;
	score: number;
};

type RetrievalResponse = {
	passages: RetrievedPassage[];
	indexed_at: string;
};

const retrievalUrl = env.RETRIEVAL_API_URL ?? 'http://127.0.0.1:8788';

export const POST: RequestHandler = async ({ request, fetch }) => {
	const body = (await request.json().catch(() => null)) as { question?: string } | null;
	const question = body?.question?.trim();

	if (!question) return error(400, 'A question is required.');
	if (!env.GROQ_API_KEY) return error(503, 'Groq is not configured.');

	let retrieval: RetrievalResponse;
	try {
		const response = await fetch(`${retrievalUrl}/retrieve`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ question, limit: 4 })
		});
		if (!response.ok) return error(503, 'The retrieval service is not ready.');
		retrieval = await response.json();
	} catch {
		return error(503, 'The retrieval service is not reachable.');
	}

	if (!retrieval.passages.length) {
		return json({
			answer: "I couldn't verify that against the indexed Workers Core documentation.",
			citations: [],
			followUps: [],
			indexedAt: retrieval.indexed_at,
			retrievedCount: 0,
			scoreRange: 'No supporting passages'
		});
	}

	const context = retrieval.passages
		.map((passage, index) => `[${index + 1}] ${passage.title} / ${passage.section}\n${passage.content}`)
		.join('\n\n');
	const groq = createGroq({ apiKey: env.GROQ_API_KEY });
	const result = streamText({
		model: groq('openai/gpt-oss-120b'),
		temperature: 0.1,
		system:
			'You are Support Agent, an unofficial support agent for Cloudflare Workers. Answer only from the retrieved passages. Be concise. Do not browse, use tools, or invent facts. Omit any step, command, or claim that the passages do not support, even if you label it as unsupported. Every factual sentence must end with one or more supporting passage markers such as [1] or [2]. If the passages do not support the answer, say you cannot verify it. End with a line in this exact format: FOLLOW_UPS: question one || question two. Each follow-up must be a natural next question answerable from the retrieved passages. Do not include URLs.',
		prompt: `Question: ${question}\n\nRetrieved passages:\n${context}`
	});

	const scores = retrieval.passages.map((passage) => passage.score);
	const metadata = Buffer.from(
		JSON.stringify({
			citations: retrieval.passages.map((passage) => ({
				id: passage.id,
				title: passage.title,
				section: passage.section,
				excerpt: passage.content.slice(0, 360),
				url: passage.url,
				score: passage.score
			})),
			indexedAt: retrieval.indexed_at,
			followUps: [],
			retrievedCount: retrieval.passages.length,
			scoreRange: `${Math.min(...scores).toFixed(2)}–${Math.max(...scores).toFixed(2)}`
		})
	).toString('base64');

	return result.toTextStreamResponse({
		headers: {
			'x-workers-metadata': metadata
		}
	});
};
