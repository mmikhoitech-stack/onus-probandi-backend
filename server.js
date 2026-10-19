/**
 * Onus Probandi — Standalone Legal Drafting API
 *
 * An INDEPENDENT long-running Node.js + Express service. It is NOT part of the
 * static React site's API routes and is not run by the site builder. Run it as
 * its own process (see package.json: `npm start`) on a host that can spawn the
 * `southafrica-law-mcp` child process and reach the DeepSeek API.
 *
 * Endpoints:
 *   GET  /api/health  → service + config status (never leaks the API key)
 *   POST /api/draft   → { draft, caseLaw }
 *
 * POST /api/draft flow:
 *   1. Connect to `southafrica-law-mcp` over stdio (MCP) and call its
 *      `search_case_law` tool with the user's prompt to retrieve verified
 *      South African case law.
 *   2. Send a chat completion to a DeepSeek-compatible OpenAI endpoint,
 *      instructing it to draft the requested document using ONLY the retrieved
 *      verified case law.
 *   3. Return the drafted text together with the supporting case law.
 *
 * Configuration (environment variables; loaded from backend/.env if present,
 * or supplied by the host — dotenv never overrides existing env vars):
 *   DEEPSEEK_API_KEY         (required) DeepSeek API key.
 *   DEEPSEEK_MODEL            (optional) model id, default "deepseek-chat".
 *   MCP_CASE_LAW_CMD          (optional) command to spawn the MCP server, default "npx".
 *   MCP_CASE_LAW_ARGS         (optional) args for the MCP server, default "-y southafrica-law-mcp".
 *   MCP_CASE_LAW_TIMEOUT_MS   (optional) per-operation timeout, default 60000.
 *   PORT                      (optional) listen port, default 3001.
 *   CORS_ORIGIN               (optional) allowed origin, default "*" (allow all).
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import OpenAI from 'openai';

// Load .env from this file's directory so it works regardless of cwd. dotenv
// never overrides variables already set by the host (e.g. Render/Railway).
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const SYSTEM_PROMPT =
	'You are Onus Probandi AI, a South African legal expert. Draft the requested legal document. You MUST only use the provided verified case law to support your arguments. Do not hallucinate. Format the document professionally.';

const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const MCP_CMD = process.env.MCP_CASE_LAW_CMD || 'npx';
const MCP_ARGS = (process.env.MCP_CASE_LAW_ARGS || '-y southafrica-law-mcp')
	.split(/\s+/)
	.filter(Boolean);
const MCP_TIMEOUT_MS = Number(process.env.MCP_CASE_LAW_TIMEOUT_MS || 60_000);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: CORS_ORIGIN }));

// ---------- helpers ----------

/** Rejects with a clear Error after `ms`, used to bound MCP operations. */
function withTimeout(promise, ms, message) {
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error(message)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}

/** Concatenate the text content blocks of an MCP tool result. */
function extractToolText(result) {
	if (!result || typeof result !== 'object') return '';
	const content = result.content;
	if (!Array.isArray(content)) return '';
	return content
		.map((block) => {
			if (block && typeof block === 'object' && block.type === 'text') {
				return String(block.text ?? '');
			}
			return '';
		})
		.filter(Boolean)
		.join('\n\n');
}

/**
 * Connect to the southafrica-law-mcp server over stdio and call the
 * `search_case_law` tool. Returns the concatenated text content of the tool
 * result. Throws with a clear message if the server or tool is unavailable.
 */
async function searchCaseLaw(userPrompt) {
	const transport = new StdioClientTransport({ command: MCP_CMD, args: MCP_ARGS });
	const client = new Client(
		{ name: 'onus-probandi-drafter', version: '1.0.0' },
		{ capabilities: {} },
	);

	try {
		await withTimeout(
			client.connect(transport),
			MCP_TIMEOUT_MS,
			`Timed out connecting to the southafrica-law-mcp server after ${MCP_TIMEOUT_MS}ms.`,
		);

		const result = await withTimeout(
			client.callTool({ name: 'search_case_law', arguments: { query: userPrompt } }),
			MCP_TIMEOUT_MS,
			`Timed out calling search_case_law after ${MCP_TIMEOUT_MS}ms.`,
		);

		if (result && result.isError) {
			throw new Error('The search_case_law tool returned an error result.');
		}

		return extractToolText(result);
	} finally {
		await client.close().catch(() => {});
	}
}

/** Send the drafting request to the DeepSeek-compatible OpenAI endpoint. */
async function draftWithLlm(userPrompt, caseLaw, apiKey) {
	const openai = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });

	const completion = await openai.chat.completions.create({
		model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{
				role: 'user',
				content: `User Request: ${userPrompt}. Verified Case Law to use: ${caseLaw}.`,
			},
		],
	});

	const drafted = completion.choices[0]?.message?.content;
	if (!drafted || !drafted.trim()) {
		throw new Error('The drafting model returned an empty response.');
	}
	return drafted.trim();
}

// ---------- routes ----------

app.get('/api/health', (_req, res) => {
	res.json({
		status: 'ok',
		message: 'Backend is running',
		deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
		deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
		mcpCommand: `${MCP_CMD} ${MCP_ARGS.join(' ')}`,
	});
});

app.post('/api/draft', async (req, res) => {
	const { userPrompt } = req.body || {};

	if (!userPrompt || !String(userPrompt).trim()) {
		return res.status(422).json({ error: 'userPrompt is required.' });
	}

	const apiKey = process.env.DEEPSEEK_API_KEY;
	if (!apiKey) {
		return res.status(503).json({
			error:
				'DEEPSEEK_API_KEY is not configured. Set it in the service environment (.env or host environment variables) before drafting.',
		});
	}

	const prompt = String(userPrompt).trim();

	let caseLaw;
	try {
		caseLaw = await searchCaseLaw(prompt);
	} catch (err) {
		console.error('[draft] MCP case-law search failed:', err?.stack || err);
		return res.status(502).json({
			error: `Verified case law could not be retrieved from the southafrica-law-mcp server: ${err?.message || String(err)}. The document was not drafted, to avoid presenting unverifiable case law as verified.`,
		});
	}

	if (!caseLaw.trim()) {
		return res.status(502).json({
			error:
				'The case-law search returned no verified results. The document was not drafted, to avoid presenting unverifiable case law as verified.',
		});
	}

	let draft;
	try {
		draft = await draftWithLlm(prompt, caseLaw, apiKey);
	} catch (err) {
		console.error('[draft] LLM drafting failed:', err?.stack || err);
		return res.status(502).json({
			error: `The drafting model request failed: ${err?.message || String(err)}.`,
		});
	}

	return res.json({ draft, caseLaw });
});

// Unknown routes → JSON 404.
app.use((_req, res) => {
	res.status(404).json({ error: 'Route not found.' });
});

// Last-resort error handler (Express identifies this by its 4-arg signature).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	console.error('[server] unhandled error:', err?.stack || err);
	res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => {
	console.log(`[onus-probandi-legal-api] listening on http://localhost:${PORT}`);
	console.log(`  DEEPSEEK_API_KEY configured: ${Boolean(process.env.DEEPSEEK_API_KEY)}`);
	console.log(`  MCP command: ${MCP_CMD} ${MCP_ARGS.join(' ')}`);
	console.log(`  CORS origin: ${CORS_ORIGIN}`);
});
