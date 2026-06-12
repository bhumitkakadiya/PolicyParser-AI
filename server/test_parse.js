import fs from 'fs';
import pdfParse from 'pdf-parse';

async function test() {
  const dataBuffer = fs.readFileSync('../policy.pdf');
  const data = await pdfParse(dataBuffer);
  console.log("TEXT LENGTH:", data.text.length);
  console.log("SAMPLE TEXT:", data.text.substring(0, 500));
}

test().catch(console.error);
