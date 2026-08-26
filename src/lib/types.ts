export type Citation = {
	id: string;
	title: string;
	section: string;
	excerpt: string;
	url: string;
	score: number;
};

export type SupportMessage = {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	citations?: Citation[];
	followUps?: string[];
	status?: 'streaming' | 'complete' | 'failed';
	query?: string;
	indexedAt?: string;
	retrievedCount?: number;
	scoreRange?: string;
};

export type AnswerResponse = {
	answer: string;
	citations: Citation[];
	followUps: string[];
	indexedAt: string;
	retrievedCount: number;
	scoreRange: string;
};
