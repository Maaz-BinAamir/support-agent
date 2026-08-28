<script lang="ts">
	import { tick } from 'svelte';
	import {
		getCitationNumbers,
		hasValidCitationMarkers,
		removeCitationMarkers
	} from '$lib/citations';
	import { exampleQuestions, getDemoAnswer } from '$lib/demo-data';
	import { renderMarkdown } from '$lib/markdown';
	import type { AnswerResponse, SupportMessage } from '$lib/types';

	let question = $state('');
	let isSubmitting = $state(false);
	let showDetails = $state<string | null>(null);
	let messages = $state<SupportMessage[]>([]);
	let composer: HTMLTextAreaElement;

	const canSubmit = $derived(question.trim().length > 0 && !isSubmitting);
	const hasMessages = $derived(messages.length > 0);
	type StreamAnswer = { stream: ReadableStream<Uint8Array>; metadata: AnswerResponse };

	function createId(prefix: string) {
		return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
	}

	async function submitQuestion(value = question) {
		const cleanQuestion = value.trim();
		if (!cleanQuestion || isSubmitting) return;

		question = '';
		isSubmitting = true;
		const userMessage: SupportMessage = {
			id: createId('user'),
			role: 'user',
			content: cleanQuestion
		};
		const answerId = createId('answer');
		messages.push(userMessage);
		messages.push({
			id: answerId,
			role: 'assistant',
			content: '',
			status: 'streaming',
			query: cleanQuestion
		});
		await tick();
		document.getElementById('conversation-end')?.scrollIntoView({ behavior: 'smooth' });

		try {
			const response = await getAnswer(cleanQuestion);
			const answerMessage = messages.find((message) => message.id === answerId);
			if (!answerMessage) return;

			if ('stream' in response) {
				const reader = response.stream.getReader();
				const decoder = new TextDecoder();
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					answerMessage.content += decoder.decode(value, { stream: true });
					await tick();
				}
				const followUpMatch = answerMessage.content.match(/\n?FOLLOW_UPS:\s*(.+)$/i);
				const followUps = followUpMatch
					? followUpMatch[1]
						.split('||')
						.map((item) => item.trim())
						.filter(Boolean)
						.slice(0, 3)
					: [];
				const markers = getCitationNumbers(answerMessage.content);
				const validMarkers = hasValidCitationMarkers(
					answerMessage.content,
					response.metadata.citations.length
				);
				const abstained = /I (?:cannot|couldn't|could not) verify|I don't have enough evidence/i.test(
					answerMessage.content
				);
				if (!validMarkers && !abstained) {
					answerMessage.content = "I couldn't verify this answer against the indexed Workers documentation.";
					answerMessage.citations = [];
					answerMessage.followUps = [];
					answerMessage.status = 'failed';
					return;
				}
				answerMessage.content = removeCitationMarkers(
					answerMessage.content.replace(/\n?FOLLOW_UPS:\s*.+$/i, '')
				).trim();
				const citedPassages = new Set(markers);
				answerMessage.citations = abstained
					? []
					: response.metadata.citations.filter((_, index) => citedPassages.has(index + 1));
				answerMessage.followUps = abstained ? [] : followUps;
				answerMessage.indexedAt = response.metadata.indexedAt;
				answerMessage.retrievedCount = response.metadata.retrievedCount;
				answerMessage.scoreRange = response.metadata.scoreRange;
			} else {
				for (const word of response.answer.split(' ')) {
					answerMessage.content += `${answerMessage.content ? ' ' : ''}${word}`;
					await new Promise((resolve) => setTimeout(resolve, 12));
				}
				answerMessage.citations = response.citations;
				answerMessage.followUps = response.followUps;
				answerMessage.indexedAt = response.indexedAt;
				answerMessage.retrievedCount = response.retrievedCount;
				answerMessage.scoreRange = response.scoreRange;
			}
			answerMessage.status = 'complete';
		} catch {
			const answerMessage = messages.find((message) => message.id === answerId);
			if (answerMessage) {
				answerMessage.content = 'The local retrieval service is unavailable. Start the retrieval service and try again.';
				answerMessage.status = 'failed';
			}
		} finally {
			isSubmitting = false;
			await tick();
			document.getElementById('conversation-end')?.scrollIntoView({ behavior: 'smooth' });
		}
	}

	async function getAnswer(cleanQuestion: string): Promise<AnswerResponse | StreamAnswer> {
		try {
			const response = await fetch('/api/answer', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ question: cleanQuestion })
			});
			if (response.ok) {
				if (response.headers.get('content-type')?.includes('text/plain') && response.body) {
					const encodedMetadata = response.headers.get('x-workers-metadata');
					if (encodedMetadata) {
						const metadata = JSON.parse(atob(encodedMetadata)) as AnswerResponse;
						return { stream: response.body, metadata };
					}
				}
				return await response.json();
			}
		} catch {
			// The UI remains useful as a local product preview before services are configured.
		}
		await new Promise((resolve) => setTimeout(resolve, 360));
		return getDemoAnswer(cleanQuestion);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void submitQuestion();
		}
	}

	function useExample(example: string) {
		question = example;
		composer?.focus();
	}
</script>

<svelte:head>
	<title>Support Agent · grounded Cloudflare support</title>
	<meta
		name="description"
		content="An unofficial, document-grounded support desk for Cloudflare Workers."
	/>
</svelte:head>

<main class="shell">
	<div class="grain" aria-hidden="true"></div>
	<header class="topbar">
		<a class="wordmark" href="/" aria-label="Support Agent home">
			<span class="mark" aria-hidden="true"><i></i><i></i><i></i></span>
			<span>Support Agent</span>
		</a>
	</header>

	<section class:has-messages={hasMessages} class="hero">
		<!-- <div class="eyebrow"><span>Unofficial portfolio demo</span><span class="eyebrow-line"></span><span>Workers Core</span></div> -->
		<h1>Ask better questions<br /><span>of the edge.</span></h1>
		<p class="intro">
			A small, careful support agent for Cloudflare Workers. Every answer starts in the indexed docs and shows you exactly where it came from.
		</p>
	</section>

	<section class="workspace" aria-label="Workers support conversation">
		{#if !hasMessages}
			<div class="starter-grid">
				<div class="starter-label"><span class="spark">✦</span> Start with a question</div>
				<div class="example-list">
					{#each exampleQuestions as example, index}
						<button class="example-card" onclick={() => useExample(example)}>
							<span class="example-number">0{index + 1}</span>
							<span>{example}</span>
							<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 9h9M9 5l4 4-4 4" /></svg>
						</button>
					{/each}
				</div>
			</div>
		{:else}
			<div class="conversation" aria-live="polite">
				{#each messages as message (message.id)}
					{#if message.role === 'user'}
						<article class="message user-message">
							<div class="message-kicker">You asked</div>
							<p>{message.content}</p>
						</article>
					{:else}
						<article class="message answer-message">
							<div class="answer-heading"><span class="answer-icon">✦</span><span>Support Agent</span><span class="answer-rule"></span>{#if message.status === 'streaming'}<span class="live-label">Writing</span>{:else if message.status === 'failed'}<span class="live-label failed">Offline</span>{:else}<span class="live-label">Grounded</span>{/if}</div>
							<div class="answer-copy">
								{@html renderMarkdown(message.content)}{#if message.status === 'streaming'}<span class="cursor" aria-hidden="true"></span>{/if}
							</div>

							{#if message.status === 'complete' && message.citations?.length}
								<div class="citation-heading"><span>Sources checked</span><span class="citation-count">{message.citations.length}</span></div>
								<div class="citation-list">
									{#each message.citations as citation (citation.id)}
										<a class="citation-card" href={citation.url} target="_blank" rel="noreferrer">
											<span class="citation-index">[{message.citations.indexOf(citation) + 1}]</span>
											<span class="citation-body"><strong>{citation.title}</strong><span>{citation.section}</span><small>{citation.excerpt}</small></span>
											<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M5 13 13 5M7 5h6v6" /></svg>
										</a>
									{/each}
								</div>
							{/if}

							{#if message.status === 'complete' && message.followUps?.length}
								<div class="follow-up-block">
									<div class="citation-heading"><span>What next?</span><span class="followup-note">Suggested from this answer</span></div>
									<div class="follow-up-list">
										{#each message.followUps as followUp (followUp)}
											<button onclick={() => submitQuestion(followUp)}>{followUp}<span>↗</span></button>
										{/each}
									</div>
								</div>
							{/if}

							{#if message.status === 'complete'}
								<button class="details-toggle" aria-expanded={showDetails === message.id} onclick={() => (showDetails = showDetails === message.id ? null : message.id)}>
									<span class="toggle-chevron" class:open={showDetails === message.id}>⌄</span>
									<span>Answer details</span>
									<span class="details-rule"></span>
									<span class="details-hint">{showDetails === message.id ? 'Hide' : 'Show'}</span>
								</button>
								{#if showDetails === message.id}
									<div class="details-panel">
										<div><span>Snapshot</span><strong>{message.indexedAt}</strong></div>
										<div><span>Passages retrieved</span><strong>{message.retrievedCount}</strong></div>
										<div><span>Score range</span><strong>{message.scoreRange}</strong></div>
									</div>
								{/if}
							{/if}
						</article>
					{/if}
				{/each}
				<div id="conversation-end"></div>
			</div>
		{/if}

		<form class="composer" onsubmit={(event) => { event.preventDefault(); void submitQuestion(); }}>
			<div class="composer-topline"><span class="composer-status"><span class="status-dot"></span> Indexed docs only</span><span>Shift + Enter for a new line</span></div>
			<div class="composer-field">
				<textarea bind:this={composer} bind:value={question} onkeydown={handleKeydown} rows="1" placeholder="Ask about deploying, routing, or configuring a Worker…" aria-label="Ask a Workers question"></textarea>
				<button class="send-button" type="submit" disabled={!canSubmit} aria-label="Send question">
					{#if isSubmitting}<span class="send-spinner"></span>{:else}<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h12M10 5l5 5-5 5" /></svg>{/if}
				</button>
			</div>
		</form>
	</section>

	<footer class="footer-note"><span>Answers are grounded in a dated snapshot of official Cloudflare Workers documentation.</span><span>Built for careful questions.</span></footer>
</main>
