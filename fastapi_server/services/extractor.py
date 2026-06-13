import os
import json
import base64
import time
import io
import re
import google.generativeai as genai
from pypdf import PdfReader, PdfWriter

# Paths to prompt files
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MOTOR_PROMPT_FILE = os.path.join(BASE_DIR, 'motor.txt')
LIFE_PROMPT_FILE = os.path.join(BASE_DIR, 'life.txt')
HEALTH_PROMPT_FILE = os.path.join(BASE_DIR, 'health.txt')

def get_prompt_from_file(filepath: str) -> str:
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()

CLASSIFICATION_PROMPT = """
Analyze the following insurance document and determine its type.
Is this a Motor, Life, or Health insurance policy?
Reply with ONLY the word 'Motor', 'Life', or 'Health'.
If it is none of these, reply with 'Unknown'.
"""

def parse_pdf_to_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text

def generate_with_retry(model, contents, max_retries=3):
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            return model.generate_content(contents)
        except Exception as e:
            last_error = e
            err_msg = str(e).lower()
            is_retryable = (
                '429' in err_msg or
                '503' in err_msg or
                'resource_exhausted' in err_msg or
                'unavailable' in err_msg or
                'overloaded' in err_msg or
                'quota' in err_msg
            )
            if is_retryable and attempt < max_retries:
                # Try to extract the exact wait time requested by Google
                wait_seconds = attempt * 15 # default fallback
                match = re.search(r'retry in ([\d\.]+)s', err_msg)
                if match:
                    wait_seconds = float(match.group(1)) + 1.0 # Add 1s buffer
                
                print(f'[GEMINI] Rate limit hit. Waiting {wait_seconds:.1f}s before retry {attempt + 1}/{max_retries}...')
                time.sleep(wait_seconds)
            else:
                raise e
    raise last_error

async def classify_policy_type(model, contents) -> str:
    """Classifies the document as Motor, Life, Health, or Unknown."""
    print('[GEMINI] Classifying policy type...')
    
    classification_contents = list(contents)
    classification_contents.append(CLASSIFICATION_PROMPT)
    
    response = generate_with_retry(model, classification_contents)
    text = response.text.strip().lower()
    
    if 'motor' in text:
        return 'Motor'
    elif 'life' in text:
        return 'Life'
    elif 'health' in text:
        return 'Health'
    else:
        return 'Unknown'

async def extract_from_pdf(pdf_bytes: bytes, api_key: str) -> dict:
    genai.configure(api_key=api_key)
    
    print('[LOCAL] Attempting local text extraction to save tokens...')
    extracted_text = ''
    try:
        extracted_text = parse_pdf_to_text(pdf_bytes)
        print(f'[LOCAL] Extracted {len(extracted_text)} characters of text.')
    except Exception as e:
        print(f'[LOCAL] Text extraction failed: {e}. Will fallback to vision.')

    model = genai.GenerativeModel('gemini-2.5-flash')
    
    if extracted_text and len(extracted_text.strip()) > 50:
        base_contents = [
            f"Here is the raw text extracted from the insurance document:\n\n{extracted_text}\n\n"
        ]
        # For classification, only send the first 1500 characters to save tokens
        truncated_text = extracted_text[:1500]
        classification_contents = [
            f"Here is the beginning of the insurance document:\n\n{truncated_text}\n\n"
        ]
    else:
        base64_pdf = base64.b64encode(pdf_bytes).decode('utf-8')
        base_contents = [
            {
                "mime_type": "application/pdf",
                "data": base64_pdf
            }
        ]
        # For classification, only send the first page of the PDF to save tokens
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            writer = PdfWriter()
            if len(reader.pages) > 0:
                writer.add_page(reader.pages[0])
            first_page_io = io.BytesIO()
            writer.write(first_page_io)
            first_page_base64 = base64.b64encode(first_page_io.getvalue()).decode('utf-8')
            classification_contents = [
                {
                    "mime_type": "application/pdf",
                    "data": first_page_base64
                }
            ]
        except Exception:
            # Fallback to sending the whole thing if splitting fails
            classification_contents = list(base_contents)

    # Step 1: Classification
    policy_type = await classify_policy_type(model, classification_contents)
    print(f'[GEMINI] Classified policy as: {policy_type}')
    
    if policy_type == 'Unknown':
        raise Exception("Could not determine if the policy is Motor, Life, or Health. Please ensure the document is a valid insurance policy.")

    # Step 2: Specific Extraction
    print(f'[GEMINI] Loading specific prompt for {policy_type}...')
    if policy_type == 'Motor':
        specific_prompt = get_prompt_from_file(MOTOR_PROMPT_FILE)
    elif policy_type == 'Life':
        specific_prompt = get_prompt_from_file(LIFE_PROMPT_FILE)
    elif policy_type == 'Health':
        specific_prompt = get_prompt_from_file(HEALTH_PROMPT_FILE)
        
    # The simplest way is to just provide the document text first, then the specific prompt rules.
    
    extraction_contents = list(base_contents)
    
    clean_prompt = specific_prompt.replace('"""{$policy_text}"""', '')
    
    extraction_contents.append(clean_prompt)

    MAX_RETRIES = 3
    print(f'[GEMINI] Extracting data using {policy_type} schema...')
    try:
        response = generate_with_retry(model, extraction_contents, MAX_RETRIES)
        text = response.text.strip()
        print('[GEMINI] Response received. Parsing JSON...')

        # Strip markdown code fences if the model wraps output
        if text.startswith('```'):
            lines = text.split('\n')
            if len(lines) > 2:
                text = '\n'.join(lines[1:-1]).strip()
            elif text.startswith('```json'):
                text = text[7:-3].strip()
        
        try:
            data = json.loads(text)
            print(f'[GEMINI] JSON parsed successfully for {policy_type}.')
            return data
        except json.JSONDecodeError as e:
            print(f'[GEMINI] JSON parse failed: {e}')
            raise Exception(f"Failed to parse Gemini response as JSON: {e}\nResponse text: {text}")

    except Exception as e:
        err_msg = str(e).lower()
        if '429' in err_msg or 'quota' in err_msg:
            raise Exception("API Rate Limit Exceeded: You have used up your free tier quota for Gemini. Please wait a minute before trying again.")
        raise e
