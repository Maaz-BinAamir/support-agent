import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';
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

type AnswerRequest = {
	question: string;
	model: SupportedModel;
};

const supportedModels = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b'] as const;
type SupportedModel = (typeof supportedModels)[number];

const defaultModel = supportedModels[0];
const retrievalUrl = env.RETRIEVAL_API_URL ?? 'http://127.0.0.1:8788';
const generationTimeoutMs = 30_000;
const systemPrompt =
	'You are Support Agent, an unofficial support agent for Cloudflare Workers. Answer only from the retrieved passages. Be concise. Do not browse, use tools, or invent facts. Omit any step, command, or claim that the passages do not support. Every factual sentence and list item must end with one or more ASCII citation markers such as [1] or [2], using only passage numbers that exist in the supplied context. Do not use another citation style. If the passages do not support the answer, say you cannot verify it. Before finishing, check that every factual statement has a citation. End with a line in this exact format: FOLLOW_UPS: question one || question two. Each follow-up must be answerable from the retrieved passages. Do not include URLs.';

function getModel(value: unknown): SupportedModel {
	if (value === undefined) return defaultModel;
	if (typeof value === 'string' && supportedModels.includes(value as SupportedModel)) {
		return value as SupportedModel;
	}
	return error(400, 'The selected model is not supported.');
}

async function readAnswerRequest(request: Request): Promise<AnswerRequest> {
	const body = (await request.json().catch(() => null)) as { question?: unknown; model?: unknown } | null;
	const question = typeof body?.question === 'string' ? body.question.trim() : '';

	if (!question) return error(400, 'A question is required.');
	return { question, model: getModel(body?.model) };
}

async function retrievePassages(question: string, fetcher: typeof fetch): Promise<RetrievalResponse> {
	let response: Response;
	try {
		response = await fetcher(`${retrievalUrl}/retrieve`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ question, limit: 4 })
		});
	} catch {
		return error(503, 'The retrieval service is not reachable.');
	}

	if (!response.ok) return error(503, 'The retrieval service is not ready.');
	return (await response.json()) as RetrievalResponse;
}

function createContext(passages: RetrievedPassage[]) {
	return passages
		.map((passage, index) => `[${index + 1}] ${passage.title} / ${passage.section}\n${passage.content}`)
		.join('\n\n');
}

function createMetadata(retrieval: RetrievalResponse) {
	const scores = retrieval.passages.map((passage) => passage.score);
	return Buffer.from(
		JSON.stringify({
			citations: retrieval.passages.map(({ id, title, section, content, url, score }) => ({
				id,
				title,
				section,
				excerpt: content.slice(0, 360),
				url,
				score
			})),
			indexedAt: retrieval.indexed_at,
			followUps: [],
			retrievedCount: retrieval.passages.length,
			scoreRange: `${Math.min(...scores).toFixed(2)} to ${Math.max(...scores).toFixed(2)}`
		})
	).toString('base64');
}

export const POST: RequestHandler = async ({ request, fetch }) => {
	const { question, model } = await readAnswerRequest(request);
	if (!env.GROQ_API_KEY) return error(503, 'Groq is not configured.');

	const retrieval = await retrievePassages(question, fetch);
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

	const groq = createGroq({ apiKey: env.GROQ_API_KEY });
	const result = streamText({
		model: groq(model),
		abortSignal: AbortSignal.timeout(generationTimeoutMs),
		system: systemPrompt,
		prompt: `Question: ${question}\n\nRetrieved passages:\n${createContext(retrieval.passages)}`
	});

	return result.toTextStreamResponse({
		headers: { 'x-workers-metadata': createMetadata(retrieval) }
	});
};