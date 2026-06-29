import urllib.request
import zipfile
import os
import sys

url = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.14.zip"
zip_path = "mongodb.zip"
extract_dir = "mongodb_local"

print("Downloading MongoDB...", flush=True)
try:
    urllib.request.urlretrieve(url, zip_path)
    print("Download complete.", flush=True)
    
    print("Extracting...", flush=True)
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_dir)
    print("Extraction complete.", flush=True)
    
    # Create db folder
    os.makedirs(os.path.join(extract_dir, "data", "db"), exist_ok=True)
    print("Database directory created.", flush=True)
    
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
