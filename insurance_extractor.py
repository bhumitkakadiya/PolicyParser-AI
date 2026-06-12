"""
Insurance PDF Data Extractor
=============================
Flow: PDF → Images (via pypdfium2) → Base64 → AI Vision (Claude/Gemini) → JSON

Usage:
    python insurance_extractor.py <path_to_pdf> [--api-key KEY] [--provider claude|gemini]

Requirements:
    pip install pypdfium2 pillow requests

NOTE: Default provider is Claude (Anthropic API).
      To use Gemini, install: pip install google-generativeai
      and pass --provider gemini --api-key YOUR_GEMINI_KEY
"""

import sys
import os
import json
import base64
import argparse
import requests
from pathlib import Path
from io import BytesIO

try:
    import pypdfium2 as pdfium
    from PIL import Image
except ImportError as e:
    print(f"[ERROR] Missing dependency: {e}")
    print("Run: pip install pypdfium2 pillow requests")
    sys.exit(1)


# ─────────────────────────────────────────────
#  STEP 1: PDF → Images
# ─────────────────────────────────────────────

def pdf_to_images(pdf_path: str, dpi: int = 200) -> list[Image.Image]:
    """
    Convert every page of a PDF into a PIL Image.
    DPI 200 is a good balance: readable for OCR, not too large to send.
    """
    print(f"[INFO] Loading PDF: {pdf_path}")
    pdf = pdfium.PdfDocument(pdf_path)
    images = []

    for page_index in range(len(pdf)):
        page = pdf[page_index]
        scale = dpi / 72  # pdfium renders at 72dpi by default
        bitmap = page.render(scale=scale, rotation=0)
        pil_image = bitmap.to_pil()
        images.append(pil_image)
        print(f"[INFO]   -> Page {page_index + 1} converted ({pil_image.width}x{pil_image.height}px)")

    pdf.close()
    print(f"[INFO] Total pages extracted: {len(images)}")
    return images


# ─────────────────────────────────────────────
#  STEP 2: Images → Base64
# ─────────────────────────────────────────────

def image_to_base64(image: Image.Image, fmt: str = "JPEG") -> str:
    """Convert a PIL Image to a base64-encoded string."""
    buffer = BytesIO()
    # Convert RGBA → RGB if needed (JPEG doesn't support alpha)
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    image.save(buffer, format=fmt, quality=85)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def images_to_base64_list(images: list[Image.Image]) -> list[str]:
    """Convert a list of PIL Images to base64 strings."""
    print("[INFO] Encoding images to base64...")
    encoded = [image_to_base64(img) for img in images]
    print(f"[INFO] {len(encoded)} image(s) ready for AI.")
    return encoded


# ─────────────────────────────────────────────
#  STEP 3: AI Extraction (Claude or Gemini)
# ─────────────────────────────────────────────

EXTRACTION_PROMPT = """
You are an expert insurance document parser. Analyze all the provided pages of this insurance policy document and extract ALL of the following fields. Return ONLY a valid JSON object — no markdown, no explanation.

Extract these fields (use null if not found):

{
  "policy_holder": {
    "name": "",
    "address": "",
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
    "third_party_property_damage_limit": null,
    "add_ons": []
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
    "company_name": "TATA AIG General Insurance Company Limited",
    "irda_registration": "",
    "policy_servicing_office": ""
  }
}

Important rules:
- Return ONLY the JSON object, nothing else
- Use null for missing numeric fields, empty string "" for missing text fields
- For add_ons, return an array of strings with add-on names
- Numbers should be actual numbers (not strings), e.g. 18992 not "18992"
- Dates should be in DD/MM/YYYY format
"""


def extract_with_claude(base64_images: list[str], api_key: str) -> dict:
    """
    Send images to Anthropic Claude (claude-3-5-sonnet) for data extraction.
    Claude supports multi-image vision natively.
    """
    print("[INFO] Sending to Claude Vision API...")

    # Build content array: all images + the prompt at the end
    content = []
    for i, b64 in enumerate(base64_images):
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": b64
            }
        })
        print(f"[INFO]   -> Attached page {i+1} image")

    content.append({
        "type": "text",
        "text": EXTRACTION_PROMPT
    })

    payload = {
        "model": "claude-opus-4-5-20251101",  # swap to claude-haiku for faster/cheaper
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": content}]
    }

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }

    response = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers=headers,
        json=payload,
        timeout=120
    )

    if response.status_code != 200:
        raise RuntimeError(f"Claude API error {response.status_code}: {response.text}")

    raw_text = response.json()["content"][0]["text"].strip()
    return raw_text


def extract_with_gemini(base64_images: list[str], api_key: str) -> str:
    """
    Send images to Google Gemini (gemini-2.5-flash) for data extraction.
    Swap provider to this for production MERN project.

    Install: pip install google-genai
    """
    try:
        from google import genai
    except ImportError:
        raise RuntimeError("Gemini not installed. Run: pip install google-genai")

    print("[INFO] Sending to Gemini Vision API...")
    client = genai.Client(api_key=api_key)

    # Gemini accepts PIL images directly
    from PIL import Image
    from io import BytesIO

    pil_images = []
    for b64 in base64_images:
        img_data = base64.b64decode(b64)
        pil_images.append(Image.open(BytesIO(img_data)))

    parts = pil_images + [EXTRACTION_PROMPT]
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=parts
    )
    return response.text.strip()


# ─────────────────────────────────────────────
#  STEP 4: Parse & Clean AI Response → JSON
# ─────────────────────────────────────────────

def parse_ai_response(raw_text: str) -> dict:
    """
    Parse the AI response text into a Python dict.
    Handles cases where the model wraps JSON in markdown fences.
    """
    print("[INFO] Parsing AI response...")

    # Strip markdown code fences if present
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json) and last line (```)
        text = "\n".join(lines[1:-1]).strip()

    try:
        data = json.loads(text)
        print("[INFO] JSON parsed successfully.")
        return data
    except json.JSONDecodeError as e:
        print(f"[WARN] JSON parse failed: {e}")
        print("[WARN] Returning raw text in error wrapper.")
        return {"error": "JSON parse failed", "raw_response": raw_text}


# ─────────────────────────────────────────────
#  MAIN ORCHESTRATOR
# ─────────────────────────────────────────────

def extract_insurance_data(
    pdf_path: str,
    api_key: str,
    provider: str = "claude",
    output_path: str = None,
    dpi: int = 200,
    max_pages: int = None
) -> dict:
    """
    Full pipeline: PDF → Images → Base64 → AI → JSON dict

    Args:
        pdf_path:    Path to the insurance PDF
        api_key:     API key for Claude or Gemini
        provider:    "claude" or "gemini"
        output_path: Optional path to save JSON output
        dpi:         Image resolution for PDF rendering (150-300 recommended)
        max_pages:   Limit pages to process (None = all pages)

    Returns:
        dict with extracted insurance data
    """
    # Validate PDF
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    # Step 1: PDF → Images
    images = pdf_to_images(pdf_path, dpi=dpi)
    if max_pages:
        images = images[:max_pages]
        print(f"[INFO] Processing first {max_pages} page(s) only.")

    # Step 2: Images → Base64
    b64_images = images_to_base64_list(images)

    # Step 3: AI Extraction
    if provider == "gemini":
        raw_text = extract_with_gemini(b64_images, api_key)
    else:
        raw_text = extract_with_claude(b64_images, api_key)

    # Step 4: Parse response
    result = parse_ai_response(raw_text)

    # Save to file if requested
    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"[INFO] JSON saved to: {output_path}")

    return result


# ─────────────────────────────────────────────
#  CLI Entry Point
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Extract insurance data from PDF using AI vision"
    )
    parser.add_argument("pdf", help="Path to the insurance PDF file")
    parser.add_argument("--api-key", default=os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("GEMINI_API_KEY"),
                        help="API key (or set ANTHROPIC_API_KEY / GEMINI_API_KEY env var)")
    parser.add_argument("--provider", choices=["claude", "gemini"], default="claude",
                        help="AI provider to use (default: claude)")
    parser.add_argument("--output", "-o", help="Save JSON output to this file path")
    parser.add_argument("--dpi", type=int, default=200,
                        help="PDF render DPI (default: 200, higher = better quality but slower)")
    parser.add_argument("--max-pages", type=int, default=None,
                        help="Limit number of pages to process")

    args = parser.parse_args()

    if not args.api_key:
        print("[ERROR] No API key provided.")
        print("  Set ANTHROPIC_API_KEY or GEMINI_API_KEY env var, or pass --api-key")
        sys.exit(1)

    print(f"\n{'='*50}")
    print(f"  Insurance PDF Extractor")
    print(f"  Provider : {args.provider.upper()}")
    print(f"  PDF      : {args.pdf}")
    print(f"{'='*50}\n")

    try:
        result = extract_insurance_data(
            pdf_path=args.pdf,
            api_key=args.api_key,
            provider=args.provider,
            output_path=args.output,
            dpi=args.dpi,
            max_pages=args.max_pages,
        )

        # Print pretty JSON to console
        print("\n" + "="*50)
        print("  EXTRACTED DATA")
        print("="*50)
        print(json.dumps(result, indent=2, ensure_ascii=False))

    except Exception as e:
        print(f"\n[ERROR] Extraction failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
