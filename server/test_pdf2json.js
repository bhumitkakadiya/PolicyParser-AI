import fs from 'fs';
import PDFParser from 'pdf2json';

async function test() {
  const pdfParser = new PDFParser(this, 1); // 1 = extract text

  pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
  pdfParser.on("pdfParser_dataReady", pdfData => {
    const rawText = pdfParser.getRawTextContent();
    console.log("TEXT LENGTH:", rawText.length);
    console.log("SAMPLE TEXT:", rawText.substring(0, 500));
  });

  pdfParser.loadPDF("../policy.pdf");
}

test().catch(console.error);
