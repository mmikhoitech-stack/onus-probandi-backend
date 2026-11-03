import pg from 'pg';
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});

async function ingestCase(url) {
  try {
    console.log(`Fetching: ${url}`);
    const response = await gotScraping(url);
    const $ = cheerio.load(response.body);
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    const chunks = text.match(/[\s\S]{1,1000}/g) || [text]; 

    for (const chunk of chunks) {
      if (chunk.trim().length < 50) continue;
      
      // Dummy vector for now (to bypass OpenAI billing)
      const embedding = new Array(1536).fill(0); 

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

  const urlsToIngest = [
    'https://www.saflii.org/za/cases/ZACC/1995/3.html',   
    'https://www.saflii.org/za/cases/ZACC/2001/6.html',   
    'https://www.saflii.org/za/cases/ZACC/2007/13.html'  
  ];

  for (const url of urlsToIngest) {
    await ingestCase(url);
    console.log("Sleeping for 5 seconds...");
    await new Promise(r => setTimeout(r, 5000)); 
  }
  
  console.log("Batch ingestion complete.");
  await db.end();
}

main();
