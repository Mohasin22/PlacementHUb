# PlacementHub

Enterprise Training & Placement Management System (TPMS).

> 📘 **Full Architecture & System Documentation**: See [PLACEMENT_PORTAL_DESCRIPTION.md](./PLACEMENT_PORTAL_DESCRIPTION.md) for detailed documentation covering system architecture, user roles (TPO, Dean, Faculty, Student), deterministic eligibility engine, AI agent workflows, data models, and HR reporting.

---

### Quick Start

#### 1. Backend Setup:
```bash
cd backend
python -m venv .venv  
.venv\Scripts\activate   
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

#### 2. Frontend Setup:
```bash
cd frontend
npm install
npm run dev
```

> **Note**: Please create your institution first via onboarding, and create a new git branch when working on features.
