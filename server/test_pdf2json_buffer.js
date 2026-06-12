import fs from 'fs';
import PDFParser from 'pdf2json';

function parsePdfToText(pdfBuffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);
    pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
    pdfParser.on("pdfParser_dataReady", () => {
      const rawText = pdfParser.getRawTextContent();
      resolve(rawText);
    });
    pdfParser.parseBuffer(pdfBuffer);
  });
}

async function test() {
  const dataBuffer = fs.readFileSync('../policy.pdf');
  const text = await parsePdfToText(dataBuffer);
  console.log("Extracted text length:", text.length);
}
test().catch(console.error);
