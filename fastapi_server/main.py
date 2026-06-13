from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import os
import uvicorn
from dotenv import load_dotenv

from services.extractor import extract_from_pdf

load_dotenv(override=True)

app = FastAPI(
    title="Insurance Extractor API",
    description="API for Insurance PDF data extraction using Gemini AI",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/extract")
async def extract_data(pdf: UploadFile = File(...)) -> Dict[str, Any]:
    if not pdf.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured on server")

    try:
        contents = await pdf.read()
        print(f"[API] Processing: {pdf.filename} ({len(contents) / 1024:.1f} KB)")
        
        # Extract data via Gemini
        data = await extract_from_pdf(contents, api_key)
        
        return {
            "success": True,
            "filename": pdf.filename,
            "data": data
        }
    except Exception as e:
        print(f"[API] Extraction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    import datetime
    return {"status": "ok", "timestamp": datetime.datetime.now().isoformat()}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
