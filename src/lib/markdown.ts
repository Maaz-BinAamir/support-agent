function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function renderInline(value: string) {
	const codeParts = value.split(/(`[^`]+`)/g);

	return codeParts
		.map((part, index) => {
			if (index % 2 === 1) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;

			return escapeHtml(part)
				.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
				.replace(/__(.+?)__/g, '<strong>$1</strong>')
				.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
				.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');
		})
		.join('');
}

function isListItem(line: string) {
	return /^(?:[-*+] |\d+[.)] )/.test(line);
}

/**
 * Renders the Markdown used in model answers without allowing answer content
 * to introduce arbitrary HTML. It intentionally supports the compact syntax
 * that is useful in support replies: paragraphs, headings, lists, and code.
 */
export function renderMarkdown(markdown: string) {
	const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
	const blocks: string[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) {
			index += 1;
			continue;
		}

		const fence = line.match(/^```\s*([^\s]*)\s*$/);
		if (fence) {
			const language = fence[1] ? ` language-${escapeHtml(fence[1])}` : '';
			index += 1;
			const code: string[] = [];
			while (index < lines.length && !/^```\s*$/.test(lines[index])) {
				code.push(lines[index]);
				index += 1;
			}
			if (index < lines.length) index += 1;
			blocks.push(`<pre><code class="${language.trim()}">${escapeHtml(code.join('\n'))}</code></pre>`);
			continue;
		}

		const heading = line.match(/^(#{1,3})\s+(.+)$/);
		if (heading) {
			const level = heading[1].length;
			blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
			index += 1;
			continue;
		}

		const ordered = /^\d+[.)]\s+/.test(line);
		if (isListItem(line)) {
			const tag = ordered ? 'ol' : 'ul';
			const itemPattern = ordered ? /^\d+[.)]\s+(.+)$/ : /^[-*+]\s+(.+)$/;
			const items: string[] = [];
			while (index < lines.length) {
				const item = lines[index].match(itemPattern);
				if (!item) break;
				items.push(`<li>${renderInline(item[1])}</li>`);
				index += 1;
			}
			blocks.push(`<${tag}>${items.join('')}</${tag}>`);
			continue;
		}

		const paragraph: string[] = [];
		while (index < lines.length && lines[index].trim() && !/^```/.test(lines[index]) && !/^(#{1,3})\s+/.test(lines[index]) && !isListItem(lines[index])) {
			paragraph.push(lines[index]);
			index += 1;
		}
		blocks.push(`<p>${renderInline(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`);
	}

	return blocks.join('');
}
