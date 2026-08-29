function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function renderInline(value: string) {
	const codeSpans: string[] = [];
	const tokenized = value.replace(/`([^`]+)`/g, (_, code: string) => {
		const token = `\0${codeSpans.length}\0`;
		codeSpans.push(`<code>${escapeHtml(code)}</code>`);
		return token;
	});
	const rendered = escapeHtml(tokenized)
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/__(.+?)__/g, '<strong>$1</strong>')
		.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
		.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');

	return rendered.replace(/\0(\d+)\0/g, (_, index: string) => codeSpans[Number(index)] ?? '');
}

type ListItem = {
	indent: number;
	ordered: boolean;
	content: string;
};

function getListItem(line: string): ListItem | null {
	const match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
	if (!match) return null;
	return {
		indent: match[1].length,
		ordered: /^\d/.test(match[2]),
		content: match[3]
	};
}

function isListItem(line: string) {
	return Boolean(getListItem(line));
}

function renderList(lines: string[], startIndex: number) {
	const firstItem = getListItem(lines[startIndex]);
	if (!firstItem) return null;

	const tag = firstItem.ordered ? 'ol' : 'ul';
	const items: string[] = [];
	let index = startIndex;

	while (index < lines.length) {
		const item = getListItem(lines[index]);
		if (!item || item.indent !== firstItem.indent || item.ordered !== firstItem.ordered) break;
		index += 1;

		let nested = '';
		while (index < lines.length) {
			const child = getListItem(lines[index]);
			if (!child || child.indent <= firstItem.indent) break;
			const renderedChild = renderList(lines, index);
			if (!renderedChild) break;
			nested += renderedChild.html;
			index = renderedChild.index;
		}

		items.push(`<li>${renderInline(item.content)}${nested}</li>`);
	}

	return { html: `<${tag}>${items.join('')}</${tag}>`, index };
}

function splitTableRow(line: string) {
	const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
	return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line: string) {
	const cells = splitTableRow(line);
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function matchCodeFence(line: string) {
	return line.match(/^\s*```\s*([^\s`]*)\s*$/);
}

function isClosingCodeFence(line: string) {
	return /^\s*```\s*$/.test(line);
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

		const fence = matchCodeFence(line);
		if (fence) {
			const language = fence[1] ? ` language-${escapeHtml(fence[1])}` : '';
			index += 1;
			const code: string[] = [];
			while (index < lines.length && !isClosingCodeFence(lines[index])) {
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

		if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
			const headers = splitTableRow(line);
			const alignments = splitTableRow(lines[index + 1]).map((cell) => {
				if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
				if (cell.startsWith(':')) return 'left';
				if (cell.endsWith(':')) return 'right';
				return '';
			});
			index += 2;
			const rows: string[] = [];
			while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
				const cells = splitTableRow(lines[index]);
				rows.push(`<tr>${headers.map((_, cellIndex) => {
					const alignment = alignments[cellIndex] ? ` style="text-align:${alignments[cellIndex]}"` : '';
					return `<td${alignment}>${renderInline(cells[cellIndex] ?? '')}</td>`;
				}).join('')}</tr>`);
				index += 1;
			}
			blocks.push(`<div class="markdown-table-wrap"><table><thead><tr>${headers.map((header, cellIndex) => {
				const alignment = alignments[cellIndex] ? ` style="text-align:${alignments[cellIndex]}"` : '';
				return `<th${alignment}>${renderInline(header)}</th>`;
			}).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
			continue;
		}

		const list = renderList(lines, index);
		if (list) {
			blocks.push(list.html);
			index = list.index;
			continue;
		}

		const paragraph: string[] = [];
		while (index < lines.length && lines[index].trim() && !matchCodeFence(lines[index]) && !/^(#{1,3})\s+/.test(lines[index]) && !isListItem(lines[index])) {
			paragraph.push(lines[index]);
			index += 1;
		}
		blocks.push(`<p>${renderInline(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`);
	}

	return blocks.join('');
}
