require('dotenv').config();

// Simulated data source (Replace this with your actual source: DB, API, etc.)
const mockData = [
{ id: 1, name: 'User One', status: 'active' },
{ id: 2, name: 'User Two', status: 'inactive' },
{ id: 3, name: 'User Three', status: 'active' }
];

async function processIngestion() {
console.log('Starting data ingestion process...');

try {
for (const item of mockData) {
// --- YOUR LOGIC HERE ---
// For example: await database.save(item);
console.log(`Processing item: ${item.name} (ID: ${item.id})`);

// Simulate a small delay per item
await new Promise(resolve => setTimeout(resolve, 500));
}

console.log('Data ingestion completed successfully.');

} catch (error) {
console.error('Error during ingestion:', error);
process.exit(1); // Exit with error code if it fails
}
}

// Run the function
processIngestion();
