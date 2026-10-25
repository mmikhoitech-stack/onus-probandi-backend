import { Client } from 'pg';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const db = new Client({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function ingestCase(url) {
  try {
    console.log(`Fetching: ${url}`);
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    const chunks = text.match(/[\s\S]{1,1000}/g) || [text]; 

    for (const chunk of chunks) {
      if (chunk.trim().length < 50) continue;
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk,
      });
      const embedding = embeddingResponse.data[0].embedding;
      await db.query(
        `INSERT INTO case_law_chunks (case_url, chunk_text, embedding) VALUES ($1, $2, $3)`,
        [url, chunk, JSON.stringify(embedding)]
      );
    }
    console.log(`Successfully ingested: ${url}`);
  } catch (error) {
    console.error(`Failed to ingest ${url}:`, error.message);
  }
}

async function main() {
  await db.connect();
  await db.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.query(`
    CREATE TABLE IF NOT EXISTS case_law_chunks (
      id SERIAL PRIMARY KEY,
      case_url TEXT,
      chunk_text TEXT,
      embedding vector(1536)
    );
  `);
  console.log("Database ready. Starting scrape...");
  await ingestCase('https://www.saflii.org/za/cases/ZACC/2023/12.html');
  await db.end();
}

main();
