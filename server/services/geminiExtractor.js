import { GoogleGenAI } from '@google/genai';

const EXTRACTION_PROMPT = `
You are an expert insurance document parser. Analyze all the provided pages of this insurance policy document and extract ALL of the following fields. Return ONLY a valid JSON object — no markdown, no explanation.

Determine the type of insurance policy (Motor, Health, or Life) and populate the corresponding fields. Use null or an empty array for fields/sections that do not apply to the identified policy type.

Extract these fields (use null if not found):

{
  "policy_holder": {
    "name": "",
    "address": "",
    "city": "",
    "state": "",
    "pincode": "",
    "contact_number": "",
    "email": "",
    "gstin": ""
  },
  "policy": {
    "policy_number": "",
    "policy_type": "",
    "client_id": "",
    "period_from": "",
    "period_to": "",
    "place_of_supply": "",
    "state_code": ""
  },
  "vehicle": {
    "registration_number": "",
    "make": "",
    "model": "",
    "variant": "",
    "body_type": "",
    "fuel_type": "",
    "engine_number": "",
    "chassis_number": "",
    "manufacturing_year": null,
    "date_of_registration": "",
    "seating_capacity": null,
    "cubic_capacity_cc": null,
    "gvw": null,
    "zone": "",
    "rto_location": "",
    "geographical_area": ""
  },
  "health_coverage": {
    "sum_insured": null,
    "cumulative_bonus": null,
    "room_rent_limit": "",
    "copay_percentage": null,
    "pre_existing_diseases_waiting_period": ""
  },
  "life_coverage": {
    "sum_assured": null,
    "policy_term_years": null,
    "premium_paying_term_years": null,
    "maturity_date": "",
    "rider_benefits": []
  },
  "insured_persons": [
    {
      "name": "",
      "age": null,
      "relationship": "",
      "sum_insured": null
    }
  ],
  "financier": {
    "bank_name": "",
    "loan_reference_number": ""
  },
  "coverage": {
    "idv_vehicle": null,
    "idv_total": null,
    "own_damage_cover": true,
    "third_party_cover": true,
    "pa_cover_owner_driver": true,
    "pa_cover_amount": null,
    "third_party_property_damage_limit": null
  },
  "premium": {
    "basic_own_damage_premium": null,
    "total_own_damage_premium": null,
    "basic_tp_premium": null,
    "pa_premium": null,
    "total_add_on_premium": null,
    "net_premium": null,
    "gst_amount": null,
    "total_premium_with_gst": null,
    "road_side_assistance_premium": null
  },
  "deductibles": {
    "compulsory_deductible": null,
    "voluntary_deductible": null
  },
  "ncb": {
    "ncb_percentage": null
  },
  "nominee": {
    "name": "",
    "age": null,
    "relationship": ""
  },
  "agent": {
    "name": "",
    "code": "",
    "contact": ""
  },
  "payment": {
    "receipt_number": "",
    "receipt_date": "",
    "payment_mode": "",
    "amount_paid": null
  },
  "insurer": {
    "company_name": "",
    "irda_registration": "",
    "policy_servicing_office": ""
  }
}

Important rules:
- Return ONLY the JSON object, nothing else
- Determine if the document is Motor, Health, or Life insurance
- For sections that are NOT relevant to the policy type (e.g. "vehicle" in a Life policy), set their nested fields to null or "" appropriately.
- Use null for missing numeric fields, empty string "" for missing text fields
- For arrays like rider_benefits or insured_persons, return an empty array [] if not applicable or not found.
- Numbers should be actual numbers (not strings), e.g. 18992 not "18992"
- Dates should be in DD/MM/YYYY format
`;


import PDFParser from 'pdf2json';

function parsePdfToText(pdfBuffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1); // 1 = text only
    
    // Suppress console warnings from pdf2json
    pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
    pdfParser.on("pdfParser_dataReady", () => {
      resolve(pdfParser.getRawTextContent());
    });
    
    pdfParser.parseBuffer(pdfBuffer);
  });
}

/**
 * Extract insurance data from a PDF buffer using Gemini AI.
 * Optimizes token usage by extracting raw text locally first.
 * Falls back to native PDF vision if text extraction fails (e.g., scanned images).
 *
 * @param {Buffer} pdfBuffer - The PDF file buffer from multer
 * @param {string} apiKey    - Gemini API key
 * @returns {Object}         - Parsed insurance data as JSON
 */
export async function extractFromPdf(pdfBuffer, apiKey) {
  const ai = new GoogleGenAI({ apiKey });

  console.log('[LOCAL] Attempting local text extraction to save tokens...');
  let extractedText = '';
  try {
    extractedText = await parsePdfToText(pdfBuffer);
    console.log(`[LOCAL] Extracted ${extractedText.length} characters of text.`);
  } catch (err) {
    console.warn(`[LOCAL] Text extraction failed: ${err.message}. Will fallback to vision.`);
  }

  let requestContents;

  if (extractedText && extractedText.trim().length > 50) {
    console.log('[GEMINI] Sending raw text to Gemini 2.5 Flash (Optimized)...');
    requestContents = [
      `Here is the raw text extracted from the insurance document:\n\n${extractedText}\n\n`,
      EXTRACTION_PROMPT,
    ];
  } else {
    console.log('[GEMINI] No text found. Sending PDF image data to Gemini 2.5 Flash (Fallback)...');
    const base64Pdf = pdfBuffer.toString('base64');
    requestContents = [
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Pdf,
        },
      },
      EXTRACTION_PROMPT,
    ];
  }

  // Retry logic for rate limiting (429 errors)
  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: requestContents,
      });

      let text = response.text.trim();
      console.log('[GEMINI] Response received. Parsing JSON...');

      // Strip markdown code fences if the model wraps output
      if (text.startsWith('```')) {
        const lines = text.split('\n');
        text = lines.slice(1, -1).join('\n').trim();
      }

      try {
        const data = JSON.parse(text);
        console.log('[GEMINI] JSON parsed successfully.');
        return data;
      } catch (err) {
        console.error('[GEMINI] JSON parse failed:', err.message);
        throw new Error(`Failed to parse Gemini response as JSON: ${err.message}`);
      }
    } catch (err) {
      lastError = err;
      const isRetryable = 
        err.message?.includes('429') || 
        err.message?.includes('503') || 
        err.status === 429 || 
        err.status === 503 || 
        err.message?.includes('RESOURCE_EXHAUSTED') ||
        err.message?.includes('UNAVAILABLE') ||
        err.message?.includes('Service Unavailable') ||
        err.message?.includes('overloaded');

      if (isRetryable && attempt < MAX_RETRIES) {
        let waitSeconds = attempt * 15; // fallback
        const retryMatch = err.message?.match(/retry in ([\d\.]+)s/i);
        if (retryMatch && retryMatch[1]) {
          waitSeconds = Math.ceil(parseFloat(retryMatch[1])) + 1;
        }

        console.warn(`[GEMINI] Server error (attempt ${attempt}). Waiting ${waitSeconds}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      } else {
        throw err;
      }
    }
  }

  // If we exhaust retries or get a non-retryable error, clean up the massive RPC error payload
  const errStr = lastError.message || '';
  if (errStr.includes('429') || lastError.status === 429) {
    const retryMatch = errStr.match(/retry in ([\d\.]+)s/i);
    const time = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) + ' seconds' : 'a minute';
    throw new Error(`Rate limit exceeded (Too Many Requests). Please wait ${time} and try again.`);
  }

  throw lastError;
}

