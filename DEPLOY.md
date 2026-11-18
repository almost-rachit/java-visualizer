# Classroom Deployment Guide: JViz

Deploy JViz publicly so professors and students can visualize real JVM execution live in classrooms.

---

## Architecture Overview

```
                      +-----------------------------+
                      |   Vercel Free Tier (CDN)    |
                      |   React + TypeScript + Vite |
                      |   https://jviz.vercel.app   |
                      +--------------+--------------+
                                     |
                         HTTPS API   |  VITE_API_URL
                                     v
                      +-----------------------------+
                      |    Render Free Tier (Web)   |
                      |    Temurin 25 JDK Alpine    |
                      |    Spring Boot + JDI Engine |
                      |    https://jviz.onrender.com|
                      +-----------------------------+
```

---

## Step 1: Push Code to GitHub

```bash
cd /Users/rachit/.gemini/antigravity/scratch/java-visualizer
git init
git add .
git commit -m "feat: production-hardened JViz full-stack visualizer"
git branch -M main
git remote add origin https://github.com/<YOUR_USER>/<YOUR_REPO>.git
git push -u origin main
```

---

## Step 2: Deploy Backend to Render (Free Tier)

1. Sign in to [Render](https://render.com).
2. Click **New +** → **Blueprint** (or **Web Service**).
3. Connect your GitHub repository.
4. If using **Blueprint**, Render automatically detects `render.yaml`.
5. If creating a **Web Service** manually:
   - **Language / Runtime**: `Docker`
   - **Docker Context**: `backend`
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Plan**: `Free` (512 MB RAM, 0.1 CPU)
   - **Environment Variables**:
     - `PORT` = `8080`
     - `ALLOWED_ORIGINS` = `*` (or your frontend Vercel URL once deployed)
6. Click **Create Web Service**.
7. Once deployed, note your public URL: `https://jviz-backend.onrender.com`.
8. Verify health: `curl https://jviz-backend.onrender.com/api/health` → `{"status":"UP"}`.

> **Note on Free Tier Sleep:** Free Render instances spin down after 15 minutes of inactivity. When a professor opens the visualizer, the frontend automatically displays:
> *"⏳ Waking up cloud JVM engine (~40s on first load)..."* and auto-connects once warm.

---

## Step 3: Deploy Frontend to Vercel (Free Tier)

1. Sign in to [Vercel](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Import your GitHub repository.
4. Configure Project Settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add **Environment Variables**:
   - `VITE_API_URL` = `https://jviz-backend.onrender.com` (your Render backend URL from Step 2)
6. Click **Deploy**.
7. Once deployed, Vercel gives you a public domain: `https://jviz.vercel.app`.

---

## Step 4: Final CORS Hardening (Optional)

On your Render backend dashboard:
1. Update `ALLOWED_ORIGINS` to your exact Vercel domain:
   ```
   ALLOWED_ORIGINS = https://jviz.vercel.app
   ```
2. Save changes (triggers a quick rolling restart).

---

## Step 5: Verify Production Deployment

1. Open `https://jviz.vercel.app` in your browser.
2. Confirm the green **JVM Engine Ready** badge appears in the top navigation.
3. Test **Classroom Projector Mode**: Click **Projector Mode** in the toolbar to enlarge fonts and widen memory cards.
4. Run the **Recursion & Call Stack** preset.
5. Run the **Infinite Loop** preset and click the red **Stop** button.
6. Submit a security-violating snippet (e.g. `Runtime.getRuntime().exec("ls")`) to confirm the classroom safety error card blocks execution before compilation.
