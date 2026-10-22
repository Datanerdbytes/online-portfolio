# Technical Implementation Guide: Dynamic GitHub README Sync

Follow this step-by-step technical blueprint to configure a **Next.js (App Router)** frontend that displays GitHub project `README.md` files pre-rendered into HTML via a **FastAPI** backend middleware proxy.

---

## 📋 Architectural Overview
1. **Next.js Client:** Renders a single dynamic route `app/projects/[slug]/page.tsx`.
2. **FastAPI Middleware:** Intercepts requests, appends the secret GitHub Personal Access Token (PAT), requests the `application/vnd.github.html+json` data type from GitHub, and forwards the pre-rendered HTML.
3. **Security & Performance:** The API Token is completely hidden from the browser. Responses are cached at the Next.js server tier to stay safely within GitHub's API rate limits.

---

## 🛠️ Step 1: FastAPI Backend Setup

### 1. Environment Configurations
Ensure your secret token is loaded into your server environment before running Uvicorn.
```bash
export GITHUB_PAT="github_pat_your_actual_token_here"
```

### 2. Main File Execution (`main.py`)
Create or merge this script. It includes native CORS authorization matching Next.js local deployment defaults.

```python
# main.py
import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI()

# -------------------------------------------------------------
# CORS Middleware Configuration
# -------------------------------------------------------------
# Safely allows local development traffic from your Next.js project
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration settings
GITHUB_TOKEN = os.getenv("GITHUB_PAT")
GITHUB_USERNAME = "YOUR_GITHUB_USERNAME"  # TODO: Replace with your actual GitHub username

@app.get("/api/projects/{repo_name}/readme", response_class=HTMLResponse)
async def get_project_readme(repo_name: str):
    if not GITHUB_TOKEN:
        raise HTTPException(status_code=500, detail="Server misconfiguration: GITHUB_PAT environment variable is missing.")
        
    url = f"https://api.github.com/repos/{GITHUB_USERNAME}/{repo_name}/readme"
    headers = {
        "Accept": "application/vnd.github.html+json",  # Instructs GitHub to parse Markdown to secure HTML
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers)
            
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="README.md could not be found for this repository.")
            elif response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="GitHub API responded with an error status.")
                
            # The body response from this media-type contains the pre-rendered HTML text string directly
            return HTMLResponse(content=response.text, status_code=200)
            
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="GitHub documentation server is temporarily unreachable.")
```

---

## 🎨 Step 2: Next.js Dynamic Frontend Setup

### 1. Environment Variables Configuration
Create or append this line inside the root folder of your Next.js repository:
```env
# .env.local
NEXT_PUBLIC_FASTAPI_URL=http://127.0.0.1:8000
```

### 2. Layout & Route Generation (`app/projects/[slug]/page.tsx`)
Create this exact file path structure. It handles parameter destructing, data caching hooks, loading UI states via React Suspense, error fallbacks, and scoped Tailwind typography layout modifiers.

```tsx
// app/projects/[slug]/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';

interface Props {
  params: Promise<{ slug: string }>;
}

// -------------------------------------------------------------
// Data Fetcher (Queries FastAPI Backend)
// -------------------------------------------------------------
async function getReadmeFromBackend(repoName: string) {
  const BACKEND_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';
  
  try {
    const res = await fetch(`${BACKEND_URL}/api/projects/${repoName}/readme`, {
      # Next.js automatically caches the backend response on the server tier.
      # Revalidates and checks for documentation updates once every hour.
      next: { revalidate: 3600 } 
    });
    
    if (!res.ok) return null;
    return await res.text(); # Resolves directly to the clean HTML string
  } catch (error) {
    return null;
  }
}

// -------------------------------------------------------------
// UI Loading State Placeholder (Skeleton)
// -------------------------------------------------------------
function ReadmeSkeleton() {
  return (
    <div className="animate-pulse space-y-4 mt-4">
      <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full"></div>
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-5/6"></div>
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-4/5"></div>
    </div>
  );
}

// -------------------------------------------------------------
// HTML Content Processor & Native Tailwind Styling Injection
// -------------------------------------------------------------
async function ProjectReadme({ repoName }: { repoName: string }) {
  const htmlContent = await getReadmeFromBackend(repoName);
  const githubUser = "YOUR_GITHUB_USERNAME"; # TODO: Replace with your actual GitHub username

  if (!htmlContent) {
    return (
      <div className="p-6 border border-slate-200 rounded-xl bg-slate-50 dark:bg-slate-900/50 dark:border-slate-800 text-center">
        <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
          Could not load the live project documentation directly onto the page.
        </p>
        <a 
          href={`https://github.com/${githubUser}/${repoName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-700 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
        >
          View Directly on GitHub
        </a>
      </div>
    );
  }

  return (
    <div className="
      prose dark:prose-invert max-w-none
      [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:text-slate-900 dark:[&_h1]:text-white [&_h1]:border-b [&_h1]:border-slate-200 dark:[&_h1]:border-slate-800 [&_h1]:pb-2
      [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-slate-800 dark:[&_h2]:text-slate-100
      [&_p]:text-slate-600 dark:[&_p]:text-slate-300 [&_p]:mb-4 [&_p]:leading-relaxed
      [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:space-y-1
      [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_ol]:space-y-1
      [&_li]:text-slate-600 dark:[&_li]:text-slate-300
      [&_code]:bg-slate-100 dark:[&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:text-pink-600 dark:[&_code]:text-pink-400
      [&_pre]:bg-slate-900 dark:[&_pre]:bg-black [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:text-slate-100 [&_pre_code]:p-0
      [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline hover:[&_a]:text-blue-800
    ">
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </div>
  );
}

// -------------------------------------------------------------
// Core Dynamic Page Component
// -------------------------------------------------------------
export default async function ProjectDetailPage({ params }: Props) {
  const { slug } = await params;
  const githubUser = "YOUR_GITHUB_USERNAME"; # TODO: Replace with your actual GitHub username

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <article className="max-w-4xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm p-6 sm:p-10">
        
        {/* Navigation & Header */}
        <div className="mb-8">
          <Link 
            href="/projects" 
            className="inline-flex items-center text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition mb-6 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Projects
          </Link>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white capitalize mb-4">
            {slug.replace(/-/g, ' ')}
          </h1>

          {/* Project Details Panel */}
          <div className="flex flex-wrap items-center gap-y-2 text-sm text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-6 w-full">
            <span className="flex items-center mr-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {githubUser}
            </span>
            <span className="flex items-center mr-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Public Repository
            </span>
            
            <a 
              href={`https://github.com/${githubUser}/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="sm:ml-auto inline-flex items-center text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              View Repository Source Code 
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        {/* Live Container Block for the README documentation */}
        <div className="pt-2">
          <h2 className="text-xs font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase mb-4">Project Case Study & Documentation</h2>
          <Suspense fallback={<ReadmeSkeleton />}>
            <ProjectReadme repoName={slug} />
          </Suspense>
        </div>

      </article>
    </div>
  );
}
```

---

## 🚦 Execution Checklist & Validation Tasks
- [ ] Substitute `"YOUR_GITHUB_USERNAME"` string literals with your active account user identity across both codeblocks.
- [ ] Spin up FastAPI locally using `uvicorn main:app --reload` on port `8000`.
- [ ] Run Next.js locally using `npm run dev` on port `3000`.
- [ ] Open the browser and visit `http://localhost:3000/projects/[insert-any-valid-public-repo-slug]` to verify the end-to-end integration pipeline.