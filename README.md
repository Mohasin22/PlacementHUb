Initialise backend (one time only):  
python -m venv .venv  
.venv\Scripts\activate   
python -m pip install -r requirements.txt

Start Backend by:  
.venv\Scripts\activate   
uvicorn app.main:app --reload

Start Frontend by:  
npm install (one time only)  
npm run dev

Please create your institution first, and a new branch when you are working on this project.
