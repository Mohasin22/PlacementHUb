import uvicorn
import os
import sys

if __name__ == "__main__":
    # Ensure current directory is in python path
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    
    port = int(os.getenv("PORT", 8000))
    print(f"Starting PlacementHub FastAPI Backend on port {port}...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
