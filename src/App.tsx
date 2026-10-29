import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, BarChart3, BookOpen,
  Check, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, CloudUpload, Copy, Download, FileText,
  History, Lightbulb, LockKeyhole, Menu, Moon, Plus, Rocket, Search, ShieldCheck,
  Sparkles, Sun, Target, Trash2, Upload, UserRound, X, Zap,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { analysisKinds, demoJobs, initialResume, levelHint, sampleResume } from "./data";
import type { AnalysisInput, AnalysisKind, AnalysisResult, Entry, HistoryItem, ResumeDraft, RoleLevel, Session } from "./types";

type InputMode = "paste" | "upload" | "manual";
type Page = "home" | "analyze" | "matching" | "dashboard" | "about";

const guestKey = "resumeai-guest-id";
const sessionKey = "resumeai-account";
const historyKey = (guestId: string) => `resumeai-history-${guestId}`;
const apiBase = "/api";
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
const allSkills = ["Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "SQL", "React", "Node.js", "FastAPI", "Django", "Machine learning", "Data analysis", "Excel", "AWS", "Azure", "Docker", "Git", "REST APIs", "PostgreSQL", "Communication", "Leadership", "Project management", "Problem solving", "Teamwork", "Agile", "Testing", "Cybersecurity", "Figma", "UI/UX design", "Power BI", "Tableau"];
const resultLabels: Record<string, string> = {
  relevance: "Role relevance", skills: "Skills coverage", experience: "Experience & projects",
  education: "Education", clarity: "Clarity & organization", impact: "Achievement impact",
};

function getGuestId() {
  const saved = localStorage.getItem(guestKey);
  if (saved && /^[a-zA-Z0-9_-]{12,80}$/.test(saved)) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(guestKey, id);
  return id;
}

function loadSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(sessionKey) ?? "null") as Session | null; } catch { return null; }
}

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  return "Something went wrong. Please try again.";
}

function fallbackResult(input: AnalysisInput): AnalysisResult {
  const text = input.resume_text.toLowerCase();
  const required = Array.from(new Set([
    ...input.required_skills,
    ...allSkills.filter((skill) => `${input.job_title} ${input.job_description}`.toLowerCase().includes(skill.toLowerCase())),
  ]));
  const matched = required.filter((skill) => text.includes(skill.toLowerCase()));
  const missing = required.filter((skill) => !text.includes(skill.toLowerCase()));
  const sections = {
    education: /\beducation\b/.test(text),
    experience: /\bexperience\b|\bintern(ship)?\b/.test(text),
    projects: /\bprojects?\b/.test(text),
    skills: /\bskills?\b/.test(text),
  };
  const bulletLines = input.resume_text.split(/\r?\n/).filter((line) => /^\s*[-*•▪]\s+/.test(line));
  const measurable = bulletLines.filter((line) => /\d+%?/.test(line)).length;
  const skills = Math.max(32, Math.min(98, required.length ? Math.round((matched.length / required.length) * 100) : 73));
  const relevance = input.job_title || input.job_description ? Math.min(96, 42 + matched.length * 8) : 70;
  const experience = sections.experience || sections.projects ? 77 : 36;
  const education = sections.education ? 82 : 38;
  const clarity = 44 + Object.values(sections).filter(Boolean).length * 13;
  const impact = Math.min(95, 48 + bulletLines.length * 3 + measurable * 8);
  const overall = Math.round(relevance * 0.22 + skills * 0.2 + experience * 0.15 + education * 0.12 + clarity * 0.17 + impact * 0.14);
  const issues = Object.entries(sections).filter(([, present]) => !present).map(([name]) => `No clearly labeled ${name} section was found. Add one if it reflects your experience.`);
  if (!bulletLines.length) issues.push("Achievement bullets were not detected. Use a simple, consistent bullet style.");
  if (!measurable && bulletLines.length) issues.push("Consider adding verified scope or outcomes to relevant bullets.");
  const target = input.job_title || input.career_path || "your next role";
  return {
    analysis_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    quality_label: "Demo analysis",
    scores: { overall, relevance, skills, experience, education, clarity, impact },
    summary: `This transparent, rule-based demo reviewed your resume structure and ${required.length ? `${required.length} role-specific skills` : "available resume details"}. It found ${matched.length} requested skill matches. Use the suggestions below as a starting point, not an automated hiring decision.`,
    job_match_score: input.job_title || input.job_description ? Math.min(100, Math.round(relevance * 0.7 + skills * 0.3)) : null,
    ats_issues: issues.length ? issues.slice(0, 8) : ["No common plain-text parsing concerns were detected. Complex layouts, graphics, and columns cannot be verified from pasted text."],
    strengths: [
      sections.education && "Your education is easy to locate.",
      sections.projects && "Projects give you a way to demonstrate practical work.",
      matched.length && `The resume mentions ${matched.length} requested skills: ${matched.slice(0, 5).join(", ")}.`,
      measurable && `${measurable} resume bullet(s) already include measurable details.`,
    ].filter((item): item is string => Boolean(item)).slice(0, 5),
    weaknesses: [
      missing.length && `Not found in the resume: ${missing.slice(0, 8).join(", ")}. Add these only if they reflect real experience.`,
      !measurable && bulletLines.length > 0 && "Bullets do not include measurable outcomes yet. Add verified scope or results where known.",
      !sections.projects && input.experience_level === "Fresher" && "A projects section can help show practical work, if applicable.",
    ].filter((item): item is string => Boolean(item)).slice(0, 5),
    skills: required.map((name) => ({
      name, status: text.includes(name.toLowerCase()) ? "matched" as const : "missing" as const,
      explanation: text.includes(name.toLowerCase()) ? "Found in the resume; show a concise example of where you used it." : "Not found. Include only if it represents a skill you can support with real examples.",
    })),
    keyword_suggestions: missing.length ? missing.slice(0, 10) : input.job_title ? ["Use specific terms from the posting where accurate."] : ["Add a job posting to surface role-specific keywords."],
    section_suggestions: Object.entries(sections).filter(([, present]) => !present).map(([name]) => `Add or clarify a ${name} section if relevant.`),
    action_plan: [
      "First: tailor the headline and summary to the target role, using only accurate experience.",
      input.experience_level === "Fresher" ? "Next: highlight education, internships, practical projects, and relevant certifications." : "Next: prioritize your most relevant recent results, ownership, and scope.",
      "Before sending: check section headings, date consistency, readability, and spelling.",
    ],
    bullet_examples: [{
      before: bulletLines[0]?.replace(/^\s*[-*•▪]\s*/, "") || "Describe the task you completed and what changed.",
      after: "Action verb + what you changed + how you approached it + verified result (add real measures if available).",
      note: "Illustrative structure only. Replace placeholders with facts from your own experience; do not claim invented results.",
    }],
    suggested_summary: `${target}-focused professional with experience in ${matched.slice(0, 3).join(", ") || "relevant projects and skills"}. Brings a record of [verified achievement] and an interest in [specific area]. Replace bracketed text with details you can verify.`,
    methodology: "The demo weights role relevance (22%), skills (20%), experience/projects (15%), education (12%), clarity/sections (17%), and measurable impact (14%). It is an estimate based on text signals, not an official ATS score or hiring prediction.",
  };
}

async function requestApi<T>(path: string, guestId: string, token: string | undefined, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("X-Guest-ID", guestId);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body.detail === "string" ? body.detail : body.message || "The request could not be completed.";
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function App() {
  const [page, setPage] = useState<Page>("home");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("resumeai-theme") === "dark");
  const [guestId] = useState(getGuestId);
  const [session, setSession] = useState(loadSession);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("paste");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [analysisError, setAnalysisError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; localStorage.setItem("resumeai-theme", dark ? "dark" : "light"); }, [dark]);
  useEffect(() => { setMobileMenu(false); window.scrollTo({ top: 0, behavior: "smooth" }); }, [page]);
  useEffect(() => {
    const timer = toast ? window.setTimeout(() => setToast(""), 3800) : undefined;
    return () => { if (timer) window.clearTimeout(timer); };
  }, [toast]);

  const refreshHistory = async () => {
    if (!session) {
      try { setHistory(JSON.parse(sessionStorage.getItem(historyKey(guestId)) ?? "[]") as HistoryItem[]); } catch { setHistory([]); }
      return;
    }
    try { setHistory(await requestApi<HistoryItem[]>("/analysis/history", guestId, session.token)); }
    catch (error) { setToast(errorText(error)); }
  };
  useEffect(() => { void refreshHistory(); }, [session, guestId]);

  const keepHistory = (analysis: AnalysisResult, input: AnalysisInput) => {
    const item: HistoryItem = {
      analysis_id: analysis.analysis_id, created_at: analysis.created_at,
      job_title: input.job_title || input.career_path || "General resume review",
      analysis_type: input.analysis_type, overall_score: analysis.scores.overall,
      job_match_score: analysis.job_match_score,
    };
    if (!session) {
      const old = JSON.parse(sessionStorage.getItem(historyKey(guestId)) ?? "[]") as HistoryItem[];
      sessionStorage.setItem(historyKey(guestId), JSON.stringify([item, ...old.filter((entry) => entry.analysis_id !== item.analysis_id)].slice(0, 30)));
      setHistory((previous) => [item, ...previous.filter((entry) => entry.analysis_id !== item.analysis_id)].slice(0, 30));
    } else {
      setHistory((previous) => [item, ...previous.filter((entry) => entry.analysis_id !== item.analysis_id)]);
    }
  };

  const analyzeResume = async (input: AnalysisInput, manual?: ResumeDraft) => {
    setAnalysisError("");
    try {
      const path = manual ? "/resume/manual" : input.analysis_type === "Job Matching" ? "/jobs/match" : "/resume/analyze";
      const options = manual ? { resume: manual, ...input, resume_text: undefined } : input;
      const analysis = await requestApi<AnalysisResult>(path, guestId, session?.token, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options),
      });
      setResult(analysis); keepHistory(analysis, input); setToast(analysis.quality_label === "Demo analysis" ? "Demo analysis complete · Your resume was not saved." : "Analysis complete. Your approved AI provider processed redacted resume text.");
      return;
    } catch (error) {
      const message = errorText(error);
      if (!/Failed to fetch|NetworkError|fetch failed/i.test(message)) { setAnalysisError(message); return; }
    }
    const fallback = fallbackResult(input);
    setResult(fallback); keepHistory(fallback, input);
    setToast("Demo analysis complete · Local checks only · Your resume was not uploaded or saved.");
  };

  const uploadResume = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) { setAnalysisError("This file is larger than 8 MB. Choose a smaller PDF or DOCX file."); return; }
    const data = new FormData(); data.append("file", file);
    setAnalysisError("");
    try {
      const response = await fetch(`${apiBase}/resume/upload`, { method: "POST", headers: { "X-Guest-ID": guestId, ...(session ? { Authorization: `Bearer ${session.token}` } : {}) }, body: data });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || "The resume file could not be read.");
      setResumeText(body.text); setInputMode("paste");
      setToast(`Text extracted from ${body.filename}. Review it before analysis; the file was discarded.`);
    } catch (error) {
      const message = errorText(error);
      setAnalysisError(/Failed to fetch|NetworkError|fetch failed/i.test(message)
        ? "Resume upload requires the local FastAPI service. Start it with the README instructions, or paste your resume text instead."
        : message);
    }
  };

  const openHistory = async (item: HistoryItem) => {
    try {
      const saved = await requestApi<AnalysisResult>(`/analysis/${item.analysis_id}`, guestId, session?.token);
      setResult(saved); setPage("dashboard");
    } catch {
      setResult(null); setPage("dashboard"); setToast("Saved report summaries are available in this session. Full report retrieval requires the API session that created it.");
    }
  };

  const deleteHistory = async (id: string) => {
    if (!window.confirm("Delete this analysis report from your history?")) return;
    try {
      if (session) await requestApi<void>(`/analysis/${id}`, guestId, session.token, { method: "DELETE" });
      else sessionStorage.setItem(historyKey(guestId), JSON.stringify(history.filter((item) => item.analysis_id !== id)));
      setHistory((items) => items.filter((item) => item.analysis_id !== id));
      if (result?.analysis_id === id) setResult(null);
      setToast("Analysis deleted.");
    } catch (error) { setToast(errorText(error)); }
  };

  const auth = async (name: string, email: string, password: string, registering: boolean) => {
    const response = await requestApi<{ token: string; user: Omit<Session, "token"> }>(registering ? "/auth/register" : "/auth/login", guestId, undefined, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(registering ? { name } : {}), email, password }),
    });
    const next = { ...response.user, token: response.token };
    localStorage.setItem(sessionKey, JSON.stringify(next)); setSession(next); setPage("dashboard"); setToast(`Welcome${registering ? "" : " back"}, ${next.name.split(" ")[0]}.`);
  };

  const signOut = () => {
    localStorage.removeItem(sessionKey); setSession(null); setResult(null); setPage("home");
    setToast("You've signed out. Your guest reports remain in this session.");
  };

  const nav = [["Home", "home"], ["Analyze resume", "analyze"], ["Job matching", "matching"], ["Dashboard", "dashboard"], ["About", "about"]] as const;
  return <div className="app-shell">
    <header className="topbar">
      <a href="#home" className="brand" onClick={(event) => { event.preventDefault(); setPage("home"); }} aria-label="ResumeAI home">
        <span className="brand-mark"><Sparkles size={20} /></span><span className="brand-word">resume<span>ai</span><small>CAREER CLARITY, BUILT AROUND YOU</small></span>
      </a>
      <nav className={`main-nav ${mobileMenu ? "nav-open" : ""}`} aria-label="Main navigation">
        {nav.map(([label, target]) => <button key={target} onClick={() => setPage(target)} className={page === target ? "nav-link selected" : "nav-link"}>{label}</button>)}
      </nav>
      <div className="header-actions">
        <button className="icon-btn theme-btn" onClick={() => setDark(!dark)} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        {session
          ? <button className="account-pill" onClick={() => setPage("dashboard")}><span className="avatar">{initials(session.name)}</span><span>{session.name.split(" ")[0]}</span><ChevronDown size={14} /></button>
          : <button className="sign-in-link" onClick={() => setPage("dashboard")}>Sign in <ArrowUpRight size={14} /></button>}
        <button className="button button-primary header-cta" onClick={() => setPage("analyze")}>Try it free <ArrowRight size={15} /></button>
        <button className="icon-btn mobile-toggle" aria-label="Toggle navigation" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </header>
    {page === "home" && <HomePage onAnalyze={() => { setPage("analyze"); setResult(null); }} onPage={setPage} />}
    {page === "analyze" && <AnalyzePage
      mode={inputMode} setMode={setInputMode} resumeText={resumeText} setResumeText={setResumeText}
      onUpload={uploadResume} onAnalyze={analyzeResume} error={analysisError} result={result} setResult={setResult} session={session}
    />}
    {page === "matching" && <JobPage onAnalyze={analyzeResume} error={analysisError} resumeText={resumeText} setResumeText={setResumeText} onUpload={uploadResume} result={result} session={session} />}
    {page === "dashboard" && <DashboardPage
      session={session} history={history} result={result} onOpen={openHistory} onDelete={deleteHistory}
      onAuth={auth} onSignOut={signOut} onNew={() => { setResult(null); setPage("analyze"); }}
    />}
    {page === "about" && <AboutPage onAnalyze={() => setPage("analyze")} />}
    <Footer onPage={setPage} />
    {toast && <div role="status" className="toast"><Check size={17} />{toast}<button aria-label="Dismiss" onClick={() => setToast("")}><X size={15} /></button></div>}
  </div>;
}

function HomePage({ onAnalyze, onPage }: { onAnalyze: () => void; onPage: (page: Page) => void }) {
  return <main>
    <section className="hero">
      <div className="hero-content">
        <div className="announcement"><span className="live-dot"></span> A little less guessing. A lot more clarity.</div>
        <h1>Your next chapter,<br /><span>clearer.</span></h1>
        <p>A thoughtful resume review. A better read on the role. Actionable next steps that still sound like <em>you.</em></p>
        <div className="hero-actions"><button className="button button-primary button-large" onClick={onAnalyze}>Analyze my resume <ArrowRight size={17} /></button><button className="button button-quiet" onClick={() => onPage("matching")}><Target size={16} /> Explore job matching</button></div>
        <div className="trust-row"><div className="trust-avatars"><span>AM</span><span>JR</span><span>SK</span><span>✦</span></div><div><strong>Made for people in the middle of becoming</strong><small>Private by default · No automatic hiring decisions</small></div></div>
      </div>
      <div className="hero-art" aria-label="Illustration preview of a resume review dashboard">
        <div className="art-glow"></div><div className="floating-chip floating-top"><span className="mini-icon mint"><BadgeCheck size={15} /></span><span><b>Clear feedback</b><small>Built around your goals</small></span></div>
        <div className="resume-window"><div className="window-head"><span></span><span></span><span></span><small>resume-review.pdf</small><span className="window-share"><ArrowUpRight size={14} /></span></div><div className="resume-paper"><div className="resume-title-row"><span className="paper-avatar">AM</span><span><b>Avery Morgan</b><small>Product-minded software engineer</small></span><span className="paper-pill"><Check size={12} /> REVIEWED</span></div><div className="paper-lines"><i></i><i></i><i></i></div><div className="paper-columns"><div><span className="paper-section">EXPERIENCE</span><i></i><i></i><i className="short"></i><span className="paper-section">EDUCATION</span><i></i><i className="short"></i></div><div className="paper-insight"><span className="insight-icon"><Zap size={15} /></span><b>Good momentum.</b><p>Your project work matches several skills from the role you chose.</p><div className="insight-badges"><span>React</span><span>+2 skills</span></div></div></div><span className="paper-section">SKILLS & TOOLS</span><div className="paper-tags"><span></span><span></span><span></span><span></span></div></div><div className="resume-window-foot"><span>Clarity comes from the details.</span><span>01 — 04</span></div></div>
        <div className="floating-chip floating-score"><span className="score-orb">82</span><span><b>Good foundation</b><small>See what can grow</small></span></div>
        <div className="sparkle sparkle-a">✳</div><div className="sparkle sparkle-b">✦</div>
      </div>
    </section>
    <div className="trust-strip"><span>MADE FOR YOUR NEXT MOVE</span><i></i><span>NOT JUST ANOTHER SCORE</span><i></i><span>YOUR EXPERIENCE, YOURS</span><i></i><span>PRIVATE BY DEFAULT</span></div>
    <section className="section why-section"><SectionKicker number="01" label="A CLEARER WAY FORWARD" /><div className="section-heading-split"><h2>Advice you can use.<br /><span>Space to make it yours.</span></h2><p>No mystery score, no inflated promises. Just a structured review that shows what’s working, what’s missing for this role, and how to take the next step honestly.</p></div><div className="feature-grid">{[
      { icon: BarChart3, title: "A score with a reason", text: "See the building blocks behind your resume review and how each one contributes to a transparent estimate." },
      { icon: Target, title: "The right role, in focus", text: "Compare your experience with a job description and spot skills worth highlighting—or developing." },
      { icon: Lightbulb, title: "Suggestions that stay true", text: "Make clearer, stronger resume bullets without inventing accomplishments or changing your story." },
    ].map(({ icon: Icon, title, text }, i) => <article className="feature-card" key={title}><span className={`feature-icon feature-icon-${i}`}><Icon size={19} /></span><span className="feature-index">0{i + 1}</span><h3>{title}</h3><p>{text}</p><span className="feature-arrow"><ArrowUpRight size={16} /></span></article>)}</div></section>
    <section className="section how-section"><div className="how-copy"><SectionKicker number="02" label="THREE SMALL STEPS" /><h2>A good next<br /><span>step starts here.</span></h2><p>Bring a resume, a job description, or just a little curiosity. Start where you are.</p><button className="button button-primary" onClick={onAnalyze}>Let’s take a look <ArrowRight size={15} /></button></div><div className="steps-list">{[
      { n: "01", icon: FileText, title: "Bring what you have", text: "Upload a PDF or DOCX, paste your text, or build a resume from scratch." },
      { n: "02", icon: Search, title: "Focus on what matters", text: "Tell us what you’re aiming for. Fresher? Career pivot? A specific opening?" },
      { n: "03", icon: Rocket, title: "Leave with a plan", text: "Get clear priorities, useful examples, and a report you can take with you." },
    ].map(({ n, icon: Icon, title, text }) => <article className="step-card" key={n}><span className="step-n">{n}</span><span className="step-icon"><Icon size={19} /></span><div><h3>{title}</h3><p>{text}</p></div><ChevronRight size={16} /></article>)}</div></section>
    <section className="privacy-section"><span className="privacy-symbol"><LockKeyhole size={21} /></span><div><span>YOUR STORY IS YOURS.</span><h2>Private, by default.</h2><p>Uploaded files are parsed in memory and immediately discarded. We do not retain resume text or share it with an AI provider unless you explicitly opt in.</p></div><button className="text-button" onClick={() => onPage("about")}>Our privacy approach <ArrowRight size={15} /></button></section>
    <section className="bottom-cta"><div className="cta-star cta-star-a">✳</div><div className="cta-star cta-star-b">✦</div><span className="eyebrow"><span className="live-dot"></span> YOUR NEXT MOVE STARTS WITH A LOOK</span><h2>Good work deserves<br />a <span>good story.</span></h2><p>Let’s make yours easier to see.</p><button className="button button-white" onClick={onAnalyze}>Analyze my resume <ArrowRight size={16} /></button><small>No account needed. Start privately, as a guest.</small></section>
  </main>;
}

function SectionKicker({ number, label }: { number: string; label: string }) {
  return <div className="section-kicker"><span>{number}</span><i></i>{label}</div>;
}

function Footer({ onPage }: { onPage: (page: Page) => void }) {
  return <footer className="footer"><div className="footer-main"><div className="footer-brand"><a href="#home" className="brand"><span className="brand-mark"><Sparkles size={19} /></span><span className="brand-word">resume<span>ai</span><small>CAREER CLARITY, BUILT AROUND YOU</small></span></a><p>A practical, private-first space to turn your experience into your next opportunity.</p><span className="footer-demo"><span></span> Demo first. Human always.</span></div><div className="footer-links"><strong>EXPLORE</strong><button onClick={() => onPage("analyze")}>Analyze a resume</button><button onClick={() => onPage("matching")}>Job matching</button><button onClick={() => onPage("about")}>Our approach</button></div><div className="footer-links"><strong>YOUR PRIVACY</strong><span>Resume text isn’t kept by default.</span><span>AI sharing is opt-in.</span><span>Demo scores aren’t hiring decisions.</span></div><div className="footer-note"><span>ONE LAST THING</span><p>Your experience is yours.<br />So is your next step.</p><button onClick={() => onPage("analyze")}>Start a review <ArrowUpRight size={14} /></button></div></div><div className="footer-bottom"><span>© 2026 ResumeAI. A demo career tool built to put people first.</span><span>Thoughtful feedback, not hiring decisions. <Sparkles size={12} /></span></div></footer>;
}

function AnalyzePage({ mode, setMode, resumeText, setResumeText, onUpload, onAnalyze, error, result, setResult, session }: {
  mode: InputMode; setMode: (mode: InputMode) => void; resumeText: string; setResumeText: (text: string) => void;
  onUpload: (file: File) => void; onAnalyze: (input: AnalysisInput, manual?: ResumeDraft) => Promise<void>;
  error: string; result: AnalysisResult | null; setResult: (result: AnalysisResult | null) => void; session: Session | null;
}) {
  const [resume, setResume] = useState<ResumeDraft>(initialResume);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState<RoleLevel>("Entry-Level");
  const fileInput = useRef<HTMLInputElement>(null);
  const inputNames: [InputMode, string, string][] = [["paste", "Paste text", "Fastest way to start"], ["upload", "Upload file", "PDF or DOCX · 8 MB max"], ["manual", "Build it", "A guided resume form"]];
  const execute = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError("");
    const form = new FormData(event.currentTarget);
    const text = mode === "manual" ? "" : resumeText.trim();
    if (mode !== "manual" && text.split(/\s+/).filter(Boolean).length < 20) {
      setFormError("Add at least 20 words of resume content. A sample resume is available if you’d like to explore."); return;
    }
    if (mode === "manual" && (!resume.summary.trim() || (!resume.skills.length && !resume.projects.some((item) => item.details.trim()) && !resume.experience.some((item) => item.details.trim()) && !resume.education.some((item) => item.details.trim())))) {
      setFormError("Add a professional summary and at least one skill, project, experience, or education entry."); return;
    }
    const input = collectOptions(form, text, level);
    setBusy(true);
    try {
      if (mode === "manual") await onAnalyze(input, resume);
      else await onAnalyze(input);
    } finally { setBusy(false); }
  };
  return <main className="workspace">
    <div className="workspace-top"><button className="back-link" onClick={() => { setResult(null); window.history.replaceState(null, "", "/"); }}><ArrowLeft size={15} /> The ResumeAI approach</button><span className="secure-label"><LockKeyhole size={13} /> YOUR RESUME IS PRIVATE</span></div>
    {result ?     <Results result={result} setResumeText={setResumeText} onReset={() => setResult(null)} /> : <div className="workspace-layout">
      <section className="workspace-form">
        <SectionKicker number="01" label="START WHERE YOU ARE" />
        <h1>Let’s look at<br /><span>what you’ve got.</span></h1>
        <p className="workspace-intro">Any format, any stage of your story. Your resume text is only saved to history if you ask us to.</p>
        <form onSubmit={execute}>
          <div className="input-mode-tabs" role="tablist" aria-label="Choose resume input method">{inputNames.map(([id, title, sub]) => <button type="button" role="tab" aria-selected={mode === id} key={id} className={mode === id ? "mode-tab active" : "mode-tab"} onClick={() => setMode(id)}><span>{title}</span><small>{sub}</small></button>)}</div>
          {mode === "paste" && <div className="paste-panel"><div className="textarea-head"><label htmlFor="resume-text">Your resume text</label><div><button type="button" onClick={() => { setResumeText(""); setFormError(""); }}>Clear</button><button type="button" onClick={() => setResumeText(sampleResume)}>Try a sample <Sparkles size={12} /></button></div></div><textarea id="resume-text" rows={12} maxLength={60_000} value={resumeText} onChange={(event) => setResumeText(event.target.value)} placeholder={"Paste your resume text here…\n\nDon't have one ready? Start with a brief summary, your skills, and a project or experience example."} /><div className="textarea-foot"><span>{resumeText.length.toLocaleString()} / 60,000 characters</span><span>At least 20 words to analyze</span></div></div>}
          {mode === "upload" && <div className="upload-panel"><input ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); event.currentTarget.value = ""; }} /><button type="button" className="dropzone" onClick={() => fileInput.current?.click()}><span className="upload-icon"><CloudUpload size={23} /></span><strong>Drop your resume here, or <u>browse files</u></strong><span>PDF or DOCX · Up to 8 MB · Text extracted in memory</span></button><div className="upload-privacy"><ShieldCheck size={15} /><span>Files are parsed and immediately discarded. Your reviewable text appears in the paste tab.</span></div><button type="button" className="sample-link" onClick={() => { setResumeText(sampleResume); setMode("paste"); }}>No file handy? Explore with a sample <ArrowRight size={14} /></button></div>}
          {mode === "manual" && <ManualResumeForm resume={resume} setResume={setResume} />}
          <div className="form-divider"><span>MAKE IT PERSONAL</span></div>
          <AnalysisOptions level={level} setLevel={setLevel} />
          <ConsentOptions />
          {(formError || error) && <div className="inline-error" role="alert">{formError || error}</div>}
          <button className="button button-primary analyze-submit" disabled={busy}>{busy ? <><span className="spinner"></span> Reviewing the details…</> : <><Sparkles size={16} /> Analyze my resume <ArrowRight size={16} /></>}</button>
          <p className="submit-note"><LockKeyhole size={12} /> {session ? "Your history is saved to your account." : "Guest history stays in this browser session."} No hiring decisions. Ever.</p>
        </form>
      </section>
      <aside className="workspace-aside"><div className="aside-note"><span className="aside-number">02</span><span className="aside-icon"><Target size={17} /></span><span className="eyebrow">USEFUL CONTEXT</span><h2>What are you<br />aiming for?</h2><p>A job title helps us compare your experience with the work you want to do. You can also paste a job description for a more specific match.</p><span className="aside-doodle">✳</span></div><div className="aside-note aside-note-lilac"><span className="aside-icon"><BookOpen size={17} /></span><span className="eyebrow">GOOD TO KNOW</span><h2>A score is<br />just a starting point.</h2><p>Our transparent estimate explains what it checks. It is not an official ATS score, a hiring decision, or a measure of your worth.</p></div><div className="aside-sample"><span>SAMPLE INPUTS</span><p>Want to see what the tool can do? Load a sample resume and a realistic example job.</p><button onClick={() => setResumeText(sampleResume)}>Load sample resume <ArrowRight size={14} /></button></div></aside>
    </div>}
  </main>;
}

function collectOptions(form: FormData, resumeText: string, level: RoleLevel): AnalysisInput {
  return {
    resume_text: resumeText, job_title: String(form.get("job_title") || ""),
    industry: String(form.get("industry") || ""), job_description: String(form.get("job_description") || ""),
    required_skills: String(form.get("required_skills") || "").split(/[,;\n]/).map((value) => value.trim()).filter(Boolean),
    experience_level: level, preferred_location: String(form.get("preferred_location") || ""),
    career_path: String(form.get("career_path") || ""),
    analysis_type: String(form.get("analysis_type") || "General Resume Review") as AnalysisKind,
    output_language: String(form.get("output_language") || "English"),
    feedback_style: String(form.get("feedback_style") || "Beginner-Friendly") as AnalysisInput["feedback_style"],
    consent_to_ai: form.get("consent_to_ai") === "on",
    consent_to_store: form.get("consent_to_store") === "on",
  };
}

function AnalysisOptions({ level, setLevel }: { level: RoleLevel; setLevel: (level: RoleLevel) => void }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  return <div className="options-panel">
    <div className="form-row"><label>Target job title<input name="job_title" placeholder="e.g. Junior product designer" /></label><label>Industry<select name="industry" defaultValue=""><option value="">Choose an industry</option>{["Technology", "Finance", "Healthcare", "Education", "Design & creative", "Consulting", "Non-profit", "Other"].map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <div className="form-row"><label>Experience level<select name="experience_level" value={level} onChange={(event) => setLevel(event.target.value as RoleLevel)}>{(["Fresher", "Entry-Level", "Mid-Level", "Senior"] as RoleLevel[]).map((item) => <option key={item}>{item}</option>)}</select></label><label>Analysis focus<select name="analysis_type" defaultValue="General Resume Review">{analysisKinds.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <p className="field-hint"><Sparkles size={12} /> {levelHint[level]}</p>
    <details className="advanced-options" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}>
      <summary>More ways to personalize <ChevronDown size={14} /></summary>
      <div className="advanced-grid"><label>Job description<textarea name="job_description" rows={4} maxLength={12_000} placeholder="Paste the role description for a more specific comparison…" /></label><label>Required skills<input name="required_skills" placeholder="e.g. React, Figma, communication" /><small>Separate skills with commas</small></label><div className="form-row"><label>Preferred location<input name="preferred_location" placeholder="Optional" /></label><label>Career path<input name="career_path" placeholder="e.g. Product design" /></label></div><div className="form-row"><label>Output language<select name="output_language" defaultValue="English">{["English", "Spanish", "French", "German", "Hindi", "Portuguese"].map((language) => <option key={language}>{language}</option>)}</select></label><label>Feedback style<select name="feedback_style" defaultValue="Beginner-Friendly"><option>Beginner-Friendly</option><option>Detailed Professional</option><option>Concise</option></select></label></div></div>
    </details>
  </div>;
}

function ConsentOptions() {
  return <div className="consent-box"><span className="consent-lock"><LockKeyhole size={15} /></span><div className="consent-content"><strong>Choose what happens to your story.</strong><label className="check-option"><input name="consent_to_store" type="checkbox" /><span><b>Save my resume text with this report.</b> Optional. Off by default. You can delete this history any time.</span></label><label className="check-option"><input name="consent_to_ai" type="checkbox" /><span><b>Use AI-assisted feedback if available.</b> Requires your consent. Contact details are redacted; resume text is sent to the configured AI provider. {`If no provider is configured, we’ll use clearly labeled demo checks.`}</span></label></div></div>;
}

function EntryEditor({ title, name, entries, onChange, onAdd, onRemove }: {
  title: string; name: keyof Pick<ResumeDraft, "education" | "experience" | "projects" | "certifications">;
  entries: Entry[]; onChange: (index: number, field: keyof Entry, value: string) => void;
  onAdd: () => void; onRemove: (index: number) => void;
}) {
  const prompts: Record<typeof name, [string, string, string]> = {
    education: ["Degree or qualification", "School or institution", "Year or date range"],
    experience: ["Role or title", "Employer", "Dates"],
    projects: ["Project name", "Organization or context", "Date"],
    certifications: ["Certification", "Issuing organization", "Date"],
  };
  return <div className="manual-section"><div className="manual-section-title"><span>{title}</span><button type="button" onClick={onAdd}><Plus size={13} /> Add another</button></div>{entries.map((entry, index) => <div className="entry-editor" key={`${name}-${index}`}><div className="form-row"><label>{prompts[name][0]}<input value={entry.title} maxLength={180} onChange={(event) => onChange(index, "title", event.target.value)} placeholder={prompts[name][0]} /></label><label>{prompts[name][1]}<input value={entry.organization} maxLength={180} onChange={(event) => onChange(index, "organization", event.target.value)} placeholder={prompts[name][1]} /></label></div><div className="form-row"><label>{prompts[name][2]}<input value={entry.dates} maxLength={100} onChange={(event) => onChange(index, "dates", event.target.value)} placeholder={prompts[name][2]} /></label><button type="button" className="remove-entry" onClick={() => onRemove(index)} aria-label={`Remove ${title.toLowerCase()} entry`}><Trash2 size={14} /> Remove</button></div><label>Details<textarea value={entry.details} maxLength={3000} rows={2} onChange={(event) => onChange(index, "details", event.target.value)} placeholder="What did you do? Add context, tools, or outcomes you can verify." /></label></div>)}</div>;
}

function ManualResumeForm({ resume, setResume }: { resume: ResumeDraft; setResume: (resume: ResumeDraft) => void }) {
  const update = (field: keyof ResumeDraft, value: ResumeDraft[keyof ResumeDraft]) => setResume({ ...resume, [field]: value });
  const updateEntry = (key: "education" | "experience" | "projects" | "certifications", index: number, field: keyof Entry, value: string) => {
    const entries = [...resume[key]];
    entries[index] = { ...entries[index], [field]: value };
    update(key, entries);
  };
  const createEntries = (key: "education" | "experience" | "projects" | "certifications") => {
    const entries = resume[key];
    return <EntryEditor title={key[0].toUpperCase() + key.slice(1)} name={key} entries={entries}
      onChange={(index, field, value) => updateEntry(key, index, field, value)}
      onAdd={() => update(key, [...entries, { title: "", organization: "", dates: "", details: "" }])}
      onRemove={(index) => update(key, entries.filter((_, item) => item !== index))} />;
  };
  const addSkill = (skill: string) => {
    if (skill && !resume.skills.includes(skill)) update("skills", [...resume.skills, skill]);
  };
  return <div className="manual-form">
    <div className="form-row"><label>Full name<input value={resume.full_name} onChange={(event) => update("full_name", event.target.value)} required minLength={2} maxLength={160} placeholder="Your name" /></label><label>Professional headline<input value={resume.headline} onChange={(event) => update("headline", event.target.value)} maxLength={180} placeholder="e.g. Early-career data analyst" /></label></div>
    <div className="form-row"><label>Email <span>(optional)</span><input type="email" value={resume.email} onChange={(event) => update("email", event.target.value)} maxLength={254} placeholder="you@example.com" /></label><label>Phone <span>(optional)</span><input type="tel" value={resume.phone} onChange={(event) => update("phone", event.target.value)} maxLength={40} placeholder="Optional" /></label></div>
    <label>Location <span>(optional)</span><input value={resume.location} onChange={(event) => update("location", event.target.value)} maxLength={120} placeholder="City, country" /></label>
    <label>Professional summary<textarea value={resume.summary} onChange={(event) => update("summary", event.target.value)} minLength={10} maxLength={5000} rows={4} required placeholder="A short overview of your interests, strengths, and experience." /></label>
    <label>Skills <span>(choose existing or add your own)</span><SkillPicker skills={resume.skills} onAdd={addSkill} onRemove={(skill) => update("skills", resume.skills.filter((item) => item !== skill))} /></label>
    {createEntries("education")}{createEntries("experience")}{createEntries("projects")}{createEntries("certifications")}
    <label>Achievements & activities <span>(optional)</span><textarea rows={3} value={resume.achievements} onChange={(event) => update("achievements", event.target.value)} maxLength={5000} placeholder="Awards, volunteering, publications, or activities you'd like to include." /></label>
    <p className="form-hint"><ShieldCheck size={14} /> Portfolio, GitHub, and LinkedIn links can be added in your own resume text or summary.</p>
  </div>;
}

function SkillPicker({ skills, onAdd, onRemove }: { skills: string[]; onAdd: (skill: string) => void; onRemove: (skill: string) => void }) {
  const [custom, setCustom] = useState("");
  return <div className="skill-picker"><select value="" onChange={(event) => onAdd(event.target.value)} aria-label="Add a common skill"><option value="">Add a skill</option>{allSkills.filter((skill) => !skills.includes(skill)).map((skill) => <option key={skill}>{skill}</option>)}</select><div className="custom-skill"><input value={custom} maxLength={80} onChange={(event) => setCustom(event.target.value)} placeholder="Add another skill" /><button type="button" onClick={() => { onAdd(custom.trim()); setCustom(""); }}>Add</button></div><div className="selected-skills">{skills.map((skill) => <button type="button" key={skill} onClick={() => onRemove(skill)}>{skill}<X size={12} /></button>)}</div></div>;
}

function JobPage({ onAnalyze, error, resumeText, setResumeText, onUpload, result, session }: {
  onAnalyze: (input: AnalysisInput) => Promise<void>; error: string; resumeText: string;
  setResumeText: (text: string) => void; onUpload: (file: File) => void; result: AnalysisResult | null; session: Session | null;
}) {
  const [jobText, setJobText] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [level, setLevel] = useState<RoleLevel>("Entry-Level");
  const [required, setRequired] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [showResult, setShowResult] = useState(false);
  useEffect(() => { if (result?.job_match_score !== null && result?.job_match_score !== undefined) setShowResult(true); }, [result]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError("");
    if (resumeText.trim().split(/\s+/).filter(Boolean).length < 20) { setFormError("Add at least 20 words of resume text before matching. Try the sample if you’re exploring."); return; }
    if (jobText.trim().length < 30 && !jobTitle.trim()) { setFormError("Add a target job title or a job description of at least 30 characters."); return; }
    setBusy(true);
    try {
      const input: AnalysisInput = {
        resume_text: resumeText.trim(), job_title: jobTitle.trim(), industry: "",
        job_description: jobText.trim(), required_skills: required.split(/[,;\n]/).map((skill) => skill.trim()).filter(Boolean),
        experience_level: level, preferred_location: "", career_path: "",
        analysis_type: "Job Matching", output_language: "English", feedback_style: "Beginner-Friendly",
        consent_to_ai: false, consent_to_store: false,
      };
      await onAnalyze(input);
    } finally { setBusy(false); }
  };
  if (showResult && result) return <main className="workspace"><div className="workspace-top"><span className="secure-label"><Target size={13} /> YOUR ROLE MATCH</span><button className="text-button" onClick={() => setShowResult(false)}><ArrowLeft size={15} /> Edit job details</button></div><Results result={result} setResumeText={setResumeText} onReset={() => setShowResult(false)} /></main>;
  return <main className="workspace">
    <div className="workspace-top"><span className="back-link"><Target size={15} /> JOB DESCRIPTION MATCH</span><span className="secure-label"><LockKeyhole size={13} /> PRIVATE BY DEFAULT</span></div>
    <div className="workspace-layout job-workspace">
      <section className="workspace-form"><SectionKicker number="01" label="A SPECIFIC ROLE, A CLEARER READ" /><h1>Does your story<br /><span>fit this role?</span></h1><p className="workspace-intro">Compare your resume with what an employer is looking for. Explore a sample role or bring your own.</p>
        <form className="job-form" onSubmit={submit}>
          <div className="form-row"><label>Target job title<input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="e.g. Associate data analyst" /></label><label>Experience level<select value={level} onChange={(event) => setLevel(event.target.value as RoleLevel)}>{(["Fresher", "Entry-Level", "Mid-Level", "Senior"] as RoleLevel[]).map((item) => <option key={item}>{item}</option>)}</select></label></div>
          <label>Job description<textarea rows={8} maxLength={12_000} value={jobText} onChange={(event) => setJobText(event.target.value)} placeholder="Paste the role details. We'll look for skill overlap and explain what stands out." /></label>
          <label>Required skills <span>(optional · separated by commas)</span><input value={required} onChange={(event) => setRequired(event.target.value)} placeholder="e.g. SQL, Python, data storytelling" /></label>
          <div className="job-presets"><span>TRY A SAMPLE ROLE</span>{demoJobs.map((job) => <button type="button" key={job.title} onClick={() => { setJobTitle(job.title); setJobText(job.text); setLevel(job.level); }}>{job.title} <ArrowUpRight size={13} /></button>)}</div>
          <div className="form-divider"><span>YOUR RESUME</span></div>
          <label>Resume text<textarea rows={8} maxLength={60_000} value={resumeText} onChange={(event) => setResumeText(event.target.value)} placeholder="Paste your resume text here, or upload a PDF or DOCX below." /></label>
          <input ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); event.currentTarget.value = ""; }} />
          <button type="button" className="upload-inline" onClick={() => fileInput.current?.click()}><Upload size={15} /> Upload a PDF or DOCX instead</button>
          <button type="button" className="sample-link" onClick={() => setResumeText(sampleResume)}>Use sample resume <ArrowRight size={14} /></button>
          <ConsentOptions />
          {(formError || error) && <div className="inline-error" role="alert">{formError || error}</div>}
          <button className="button button-primary analyze-submit" disabled={busy}>{busy ? <><span className="spinner"></span> Comparing with this role…</> : <><Target size={16} /> Match my resume <ArrowRight size={16} /></>}</button>
          <p className="submit-note"><LockKeyhole size={12} /> No automated candidate ranking or hiring decision.</p>
        </form>
      </section>
      <aside className="workspace-aside"><div className="aside-note"><span className="aside-number">02</span><span className="aside-icon"><Search size={17} /></span><span className="eyebrow">HOW WE MATCH</span><h2>Overlap, not<br />a verdict.</h2><p>The role match highlights words and skills found in both texts. It doesn’t predict whether you’ll get an interview.</p><span className="aside-doodle">✳</span></div><div className="aside-note aside-note-lilac"><span className="aside-icon"><Lightbulb size={17} /></span><span className="eyebrow">HONEST BY DESIGN</span><h2>Never add a skill<br />just to match.</h2><p>Suggestions are starting points. Only include qualifications you can explain with real examples.</p></div><div className="aside-sample"><span>YOUR PRIVACY</span><p>Contact details are removed before any opted-in AI request. Files are discarded after parsing.</p><span className="quiet-note">{session ? "Your reports are stored in your account." : "Guest history remains in this browser session."}</span></div></aside>
    </div>
  </main>;
}

function Results({ result, setResumeText, onReset }: {
  result: AnalysisResult; setResumeText: (text: string) => void; onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState("score");
  const [localError, setLocalError] = useState("");
  const categories = Object.entries(resultLabels).map(([key, label]) => ({ name: label, score: result.scores[key as keyof typeof result.scores] }));
  const matchedSkills = result.skills.filter((skill) => skill.status === "matched").length;
  const reportText = useMemo(() => [
    "RESUMEAI — PRIVATE RESUME REVIEW",
    new Date(result.created_at).toLocaleString(),
    result.quality_label,
    "",
    `Overall score: ${result.scores.overall}/100`,
    `Job match: ${result.job_match_score === null ? "Not calculated" : `${result.job_match_score}/100`}`,
    "",
    result.summary,
    "",
    "WHAT'S WORKING",
    ...result.strengths.map((item) => `• ${item}`),
    "",
    "OPPORTUNITIES",
    ...result.weaknesses.map((item) => `• ${item}`),
    "",
    "ATS READABILITY CHECK",
    ...result.ats_issues.map((item) => `• ${item}`),
    "",
    "YOUR ACTION PLAN",
    ...result.action_plan.map((item, index) => `${index + 1}. ${item}`),
    "",
    "METHOD",
    result.methodology,
    "",
    "ResumeAI feedback is illustrative guidance, not an official ATS score, hiring decision, or prediction of success.",
  ].join("\n"), [result]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([reportText], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `resumeai-analysis-${result.analysis_id.slice(0, 8)}.txt`; anchor.click();
    URL.revokeObjectURL(url);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${result.summary}\n\n${result.action_plan.map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\n${result.methodology}`); setCopied(true); setLocalError(""); window.setTimeout(() => setCopied(false), 2200); }
    catch { setLocalError("Copy isn't available in this browser. You can download the report instead."); }
  };
  return <div className="results-page"><div className="results-header"><div><SectionKicker number="03" label="HERE'S WHAT WE NOTICED" /><h1>Your resume,<br /><span>with a little more context.</span></h1></div><div className={`analysis-badge ${result.quality_label === "AI-assisted analysis" ? "ai-badge" : ""}`}><Sparkles size={14} />{result.quality_label}</div></div>
    <div className="result-actions"><button className="button button-primary" onClick={download}><Download size={15} /> Download report</button><button className="button button-soft" onClick={copy}><Copy size={14} /> {copied ? "Copied" : "Copy suggestions"}</button><button className="button button-soft" onClick={() => { setResumeText(""); onReset(); }}><Plus size={14} /> New analysis</button><button className="button button-soft" onClick={onReset}><BookOpen size={14} /> Edit resume</button></div>
    {localError && <p className="inline-error" role="alert">{localError}</p>}
    <div className="result-intro"><span className="intro-spark"><Sparkles size={17} /></span><p>{result.summary}</p></div>
    <div className="results-overview">
      <div className="score-card"><div className="score-card-title"><span>RESUME QUALITY</span><span className="score-period"><span></span>PERSONALIZED ESTIMATE</span></div><div className="score-visual"><div className="score-circle" style={{ "--score": `${result.scores.overall * 3.6}deg` } as React.CSSProperties}><div><strong>{result.scores.overall}</strong><small>OUT OF 100</small></div></div><div className="score-context"><strong>{result.scores.overall >= 78 ? "A strong foundation." : result.scores.overall >= 58 ? "Good room to grow." : "A place to start."}</strong><p>A score is a conversation starter—not a verdict on your potential.</p><button className="text-button" onClick={() => setOpen(open === "score" ? "" : "score")}>How is this scored? <ArrowDown size={13} /></button></div></div><div className={`score-explain ${open === "score" ? "expanded" : ""}`}>{open === "score" && <p>{result.methodology}</p>}</div></div>
      <div className="match-card"><div><span className="card-overline">{result.job_match_score === null ? "A ROLE-READY SNAPSHOT" : "MATCHED TO YOUR TARGET"}</span><h2>{result.job_match_score === null ? "Want a clearer match?" : `${result.job_match_score}%`}<span>{result.job_match_score === null ? "" : " match"}</span></h2><p>{result.job_match_score === null ? "Add a job description to see which skills line up with your next move." : `${matchedSkills} of ${result.skills.length} requested skills are clearly matched in this resume.`}</p></div><Target className="match-watermark" size={76} /><span className="match-caption">{result.job_match_score === null ? "Specific to you, not an average" : "A text comparison, not a hiring decision"}</span></div>
    </div>
    <div className="results-grid">
      <section className="result-panel chart-panel"><PanelHeading icon={<BarChart3 size={17} />} eyebrow="THE BUILDING BLOCKS" title="What's shaping the score" /><div className="score-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={categories} layout="vertical" margin={{ left: 3, right: 12, top: 6, bottom: 4 }} barCategoryGap={11}><CartesianGrid horizontal={false} stroke="#ececf1" /><XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9195a7" }} /><YAxis type="category" dataKey="name" width={125} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#59617c" }} /><Tooltip cursor={{ fill: "#f7f7fb" }} formatter={(value) => [`${value}/100`, "Estimate"]} /><Bar dataKey="score" radius={[0, 6, 6, 0]} maxBarSize={18}>{categories.map((_, index) => <Cell key={index} fill={["#6966ed", "#8d7aeb", "#76ab99", "#f0ac72", "#6c9cce", "#c682a9"][index]} />)}</Bar></BarChart></ResponsiveContainer></div><div className="chart-caption">This transparent checklist estimate is based on text signals—not an official ATS score.</div><div className="category-list">{categories.map((category, index) => <div key={category.name}><span className="category-color" style={{ background: ["#6966ed", "#8d7aeb", "#76ab99", "#f0ac72", "#6c9cce", "#c682a9"][index] }}></span><span>{category.name}</span><strong>{category.score}</strong></div>)}</div></section>
      <section className="result-panel skill-panel"><PanelHeading icon={<Zap size={17} />} eyebrow="WHAT THE ROLE ASKS FOR" title="A closer look at your skills" /><div className="skill-summary"><div className="skill-pie"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ value: matchedSkills }, { value: Math.max(0, result.skills.filter((item) => item.status === "partial").length) }, { value: result.skills.filter((item) => item.status === "missing").length }]} dataKey="value" innerRadius="69%" outerRadius="91%" startAngle={90} endAngle={-270} paddingAngle={4}><Cell fill="#61a58a" /><Cell fill="#efb16f" /><Cell fill="#ef8192" /></Pie><Tooltip /></PieChart></ResponsiveContainer><span><b>{result.skills.length ? `${Math.round((matchedSkills / result.skills.length) * 100)}%` : "—"}</b><small>MATCHED</small></span></div><div className="skill-legend"><span><i className="legend-matched"></i>Matched <b>{matchedSkills}</b></span><span><i className="legend-partial"></i>Partial <b>{result.skills.filter((item) => item.status === "partial").length}</b></span><span><i className="legend-missing"></i>Not found <b>{result.skills.filter((item) => item.status === "missing").length}</b></span></div></div><div className="skill-badges">{result.skills.length ? result.skills.map((skill) => <div className={`skill-badge skill-${skill.status}`} key={skill.name}><span>{skill.status === "matched" ? <Check size={12} /> : skill.status === "partial" ? <span>~</span> : <Plus size={12} />}</span>{skill.name}<small>{skill.status}</small></div>) : <div className="no-match-yet"><Target size={18} /><p>Add a job description to compare skills.</p></div>}</div><div className="keyword-box"><span>KEYWORDS TO EXPLORE</span><div>{result.keyword_suggestions.slice(0, 8).map((item) => <span key={item}>{item}</span>)}</div><small>Only add a keyword when it describes your actual experience.</small></div></section>
    </div>
    <div className="results-grid results-grid-second">
      <section className="result-panel"><PanelHeading icon={<ShieldCheck size={17} />} eyebrow="STRUCTURE & SCANNABILITY" title="ATS readability, in plain language" /><div className="ats-intro"><span className="ats-icon"><ClipboardCheck size={16} /></span><p>We can check your text. We cannot inspect complex layout, columns, tables, graphics, or guarantee a parser will read your file the same way.</p></div><div className="finding-list">{result.ats_issues.map((issue, index) => <div key={index}><span className={index === 0 && result.ats_issues.length === 1 ? "finding-ok" : "finding-note"}>{index === 0 && result.ats_issues.length === 1 ? <Check size={14} /> : <Lightbulb size={14} />}</span><p>{issue}</p></div>)}</div><details className="detail-disclosure"><summary>What this check does—and doesn’t—mean <ChevronDown size={14} /></summary><p>ATS software varies by employer. This review looks for common text-based patterns such as section names, bullets, and dates. It cannot verify file rendering, layout parsing, or any particular employer’s system.</p></details></section>
      <section className="result-panel strengths-panel"><PanelHeading icon={<Sparkles size={17} />} eyebrow="THE GOOD STUFF" title="What's already working" /><div className="positive-list">{result.strengths.map((item, index) => <div key={index}><span><Check size={14} /></span><p>{item}</p></div>)}</div><div className="weak-title"><span><Lightbulb size={15} /></span><div><b>Room to build</b><small>Small, practical changes—not a complete rewrite.</small></div></div><div className="positive-list weak-list">{result.weaknesses.map((item, index) => <div key={index}><span><ArrowUpRight size={13} /></span><p>{item}</p></div>)}</div></section>
    </div>
    <section className="result-panel action-panel"><PanelHeading icon={<Rocket size={17} />} eyebrow="A FEW NEXT STEPS" title="An action plan that feels manageable" /><div className="action-list">{result.action_plan.map((item, index) => <div key={index}><span>0{index + 1}</span><p>{item}</p></div>)}</div></section>
    <div className="results-grid">
      <section className="result-panel"><PanelHeading icon={<FileText size={17} />} eyebrow="KEEP YOUR STORY YOURS" title="Make a bullet more specific" /><div className="rewrite-box"><span className="rewrite-label">BEFORE</span><p>{result.bullet_examples[0]?.before}</p><span className="rewrite-divider"><ArrowDown size={14} /></span><span className="rewrite-label rewrite-new">A STRUCTURE TO TRY</span><p className="rewrite-after">{result.bullet_examples[0]?.after}</p><small>{result.bullet_examples[0]?.note}</small></div></section>
      <section className="result-panel"><PanelHeading icon={<Lightbulb size={17} />} eyebrow="A STARTING POINT, NOT A SCRIPT" title="A professional summary to adapt" /><p className="summary-advice">Use this as scaffolding. Replace bracketed details with truthful examples from your own experience.</p><div className="summary-suggestion">{result.suggested_summary}</div><button className="text-button copy-summary" onClick={async () => { try { await navigator.clipboard.writeText(result.suggested_summary); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setLocalError("Clipboard access unavailable. Download the report to keep this suggestion."); } }}><Copy size={13} /> {copied ? "Copied" : "Copy this draft"}</button></section>
    </div>
    <div className="results-last"><span><ShieldCheck size={17} /> Your score is a guide, not a guarantee. Hiring decisions belong to people.</span><button className="button button-primary" onClick={onReset}>Analyze another resume <ArrowRight size={15} /></button></div>
  </div>;
}

function PanelHeading({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return <div className="panel-heading"><span className="panel-heading-icon">{icon}</span><span><small>{eyebrow}</small><h2>{title}</h2></span></div>;
}

function DashboardPage({ session, history, result, onOpen, onDelete, onAuth, onSignOut, onNew }: {
  session: Session | null; history: HistoryItem[]; result: AnalysisResult | null;
  onOpen: (item: HistoryItem) => void; onDelete: (id: string) => void;
  onAuth: (name: string, email: string, password: string, registering: boolean) => Promise<void>;
  onSignOut: () => void; onNew: () => void;
}) {
  const [registering, setRegistering] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [account, setAccount] = useState(true);
  const [jobFilter, setJobFilter] = useState("");
  const [checkMessage, setCheckMessage] = useState("");
  const filtered = history.filter((item) => `${item.job_title} ${item.analysis_type}`.toLowerCase().includes(jobFilter.toLowerCase()));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setAuthError(""); setAuthBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await onAuth(String(form.get("name") ?? ""), String(form.get("email")), String(form.get("password")), registering);
    } catch (error) { setAuthError(/Failed to fetch|NetworkError|fetch failed/i.test(errorText(error)) ? "Sign-in requires the FastAPI service. Start it using the setup instructions." : errorText(error)); }
    finally { setAuthBusy(false); }
  };
  const checkHealth = async () => {
    try {
      const response = await fetch(`${apiBase}/health`);
      if (!response.ok) throw new Error("The service is not available.");
      const health = await response.json() as { mode: string; database_configured: boolean; ai_configured: boolean; authentication_configured: boolean };
      setCheckMessage(`API is running · ${health.mode === "demo" ? "Demo storage" : "Database storage"} · AI provider ${health.ai_configured ? "configured (opt-in)" : "not configured"} · Accounts ${health.authentication_configured ? "ready" : "not configured"}.`);
    } catch { setCheckMessage("FastAPI service is offline. Guest analysis still works using local demo checks."); }
  };
  return <main className="workspace dashboard-workspace"><div className="workspace-top"><span className="back-link"><History size={15} /> YOUR CAREER DASHBOARD</span>{session && <button className="text-button" onClick={onSignOut}><UserRound size={14} /> Sign out</button>}</div>
    <div className="dashboard-heading"><div><SectionKicker number="01" label={session ? "YOUR PRIVATE SPACE" : "YOUR NEXT STEP"} /><h1>{session ? <>A little progress<br /><span>adds up.</span></> : <>Your story, your<br /><span>own space.</span></>}</h1><p>{session ? `Welcome back, ${session.name.split(" ")[0]}. Your reports and next steps, all in one place.` : "Save your resume history and compare different versions by creating a private account. Or keep exploring as a guest."}</p></div><div className="account-mark"><span>{session ? initials(session.name) : <UserRound size={26} />}</span><div><strong>{session?.name || "Guest workspace"}</strong><small>{session?.email || "Only you can see your session history."}</small><span className="privacy-chip"><LockKeyhole size={11} /> PRIVATE BY DEFAULT</span></div></div></div>
    <div className="dashboard-stats"><div><span className="stat-icon stat-violet"><FileText size={17} /></span><small>Reviews in this session</small><strong>{history.length}</strong><span>Reports, not applications</span></div><div><span className="stat-icon stat-green"><BarChart3 size={17} /></span><small>Latest resume score</small><strong>{history[0]?.overall_score ?? "—"}{history.length ? <i>/100</i> : ""}</strong><span>{history[0]?.job_title ?? "Run an analysis to begin"}</span></div><div><span className="stat-icon stat-peach"><Target size={17} /></span><small>Average job match</small><strong>{history.some((item) => item.job_match_score !== null) ? `${Math.round(history.filter((item) => item.job_match_score !== null).reduce((sum, item) => sum + (item.job_match_score ?? 0), 0) / history.filter((item) => item.job_match_score !== null).length)}%` : "—"}</strong><span>From roles you explored</span></div></div>
    <div className="dashboard-main-grid"><section className="dash-card history-card"><div className="dash-card-heading"><div><span className="card-overline">KEEP THE MOMENTUM</span><h2>Your review history</h2></div><button className="button button-primary button-small" onClick={onNew}><Plus size={14} /> New review</button></div><label className="history-search"><Search size={15} /><input value={jobFilter} onChange={(event) => setJobFilter(event.target.value)} placeholder="Search reviews" aria-label="Search analysis history" /></label>{history.length === 0 ? <div className="empty-history"><span><FileText size={22} /></span><strong>Nothing to compare—yet.</strong><p>When you run a demo analysis, it stays in this browser session. Create an account if you’d like reports to live in your private history.</p><button className="button button-primary" onClick={onNew}>Start a review <ArrowRight size={14} /></button></div> : <div className="history-list">{filtered.map((item) => <article key={item.analysis_id}><span className="history-score">{item.overall_score}<small>/100</small></span><span className="history-info"><strong>{item.job_title}</strong><small>{item.analysis_type} · {new Date(item.created_at).toLocaleDateString()}</small></span><span className="history-match">{item.job_match_score === null ? "General review" : `${item.job_match_score}% match`}</span><button aria-label={`Open report for ${item.job_title}`} onClick={() => onOpen(item)}><ArrowUpRight size={15} /></button><button className="history-delete" aria-label={`Delete report for ${item.job_title}`} onClick={() => onDelete(item.analysis_id)}><Trash2 size={14} /></button></article>)}{filtered.length === 0 && <p className="empty-search">No reviews match that search.</p>}</div>}<button className="text-button history-clear" onClick={() => { if (history.length) onDelete(history[0].analysis_id); }}>Review privacy settings <ArrowRight size={13} /></button></section>
      <aside className="dashboard-side"><section className="dash-card progress-card"><span className="card-overline">YOUR CAREER TOOLKIT</span><h2>Good work grows with you.</h2><p>Every thoughtful edit makes your story easier to understand. Keep track of versions and learn what resonates for different roles.</p><div className="progress-meter"><span style={{ width: `${Math.min(100, history.length * 22)}%` }} /></div><small>{Math.min(5, history.length)} of 5 reviews explored</small><button className="side-action" onClick={onNew}>Continue your progress <ArrowRight size={14} /></button></section><section className="dash-card privacy-card"><span className="privacy-icon"><ShieldCheck size={18} /></span><div><span className="card-overline">STAY IN CONTROL</span><h3>Your career data stays yours.</h3><p>Delete reports whenever you like. Guest history clears when this browser session ends.</p></div></section>{!session && <section className="dash-card account-prompt"><span className="card-overline">KEEP YOUR HISTORY</span><h3>Pick up where you left off.</h3><p>A private account lets you compare your resume versions over time.</p><button className="button button-primary" onClick={() => { setAccount(true); setRegistering(true); }}>{registering ? "Create an account" : "Switch to account setup"} <ArrowRight size={14} /></button><button className="link-action" onClick={() => { setAccount(true); setRegistering(false); }}>Already have an account? Sign in</button></section>}</aside>
    </div>
    {!session && account && <section className="account-create"><div><span className="card-overline">{registering ? "CREATE YOUR ACCOUNT" : "SAVE YOUR PROGRESS"}</span><h2>{registering ? "Your career story, in one place." : "Keep the work you put in."}</h2><p>Private account. Hashed passwords. No resume storage unless you explicitly ask us to save it.</p></div><form className="account-create-form" onSubmit={submit}><div className="form-row">{registering && <label>Your name<input name="name" required minLength={2} maxLength={160} placeholder="Your name" autoComplete="name" /></label>}<label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label><label>Password<input name="password" type="password" minLength={registering ? 12 : 1} required autoComplete={registering ? "new-password" : "current-password"} placeholder={registering ? "At least 12 characters" : "Your password"} /></label></div>{authError && <div role="alert" className="inline-error">{authError}</div>}<div className="account-create-actions"><button className="button button-primary" disabled={authBusy}>{authBusy ? "Please wait…" : registering ? "Create private account" : "Sign in"} <ArrowRight size={14} /></button><button type="button" className="link-action" onClick={() => { setRegistering(!registering); setAuthError(""); }}>{registering ? "Already have an account? Sign in" : "New here? Create an account"}</button><span><LockKeyhole size={13} /> Passwords are never stored in plaintext.</span></div></form></section>}
    <section className="dash-card service-card"><div><span className="card-overline">DEMO MODE CHECK</span><h3>See which services are connected.</h3><p>Local resume feedback works without a database or AI key. Optional features need a running API.</p></div><button className="button button-soft" onClick={() => void checkHealth()}>Check service status <ArrowRight size={14} /></button>{checkMessage && <span role="status">{checkMessage}</span>}</section>
    {result && <section className="dash-card dashboard-latest"><div className="dash-card-heading"><div><span className="card-overline">PICK UP WHERE YOU LEFT OFF</span><h2>Latest report</h2></div><span className="analysis-badge"><Sparkles size={13} />{result.quality_label}</span></div><Results result={result} setResumeText={() => {}} onReset={onNew} /></section>}
  </main>;
}

function AboutPage({ onAnalyze }: { onAnalyze: () => void }) {
  return <main className="about-page"><section className="about-hero"><SectionKicker number="01" label="THE THINKING BEHIND THE TOOL" /><h1>Good guidance<br /><span>leaves room for you.</span></h1><p>ResumeAI is built to help people see their experience more clearly—not reduce a career to a number or make decisions on anyone’s behalf.</p><button className="button button-primary" onClick={onAnalyze}>Start with what you have <ArrowRight size={15} /></button><span className="about-watermark">✳</span></section><section className="about-principles">{[
    { icon: ShieldCheck, title: "Your experience stays yours.", text: "Uploaded files are parsed in memory, then discarded. Resume history stores only analysis outputs by default. Saving resume text takes a separate opt-in." },
    { icon: Sparkles, title: "A score should explain itself.", text: "Each category shows how the estimate is weighted. It is not an official ATS score, a hiring prediction, or a recommendation about someone's worth." },
    { icon: UserRound, title: "People, not protected traits.", text: "Feedback focuses on job-related text. The tool should never rank or reject candidates based on protected characteristics." },
    { icon: Lightbulb, title: "Never invent a credential.", text: "We help make real experience easier to understand. You decide what to include, and you should be able to support every claim with a truthful example." },
  ].map(({ icon: Icon, title, text }, index) => <article key={title}><span className={`principle-icon principle-${index}`}><Icon size={20} /></span><span className="card-overline">0{index + 1} / HOW WE THINK</span><h2>{title}</h2><p>{text}</p></article>)}</section><section className="about-caveat"><CircleHelp size={20} /><div><strong>A note about the demo</strong><p>When no AI provider is configured, results are deterministic checklist estimates—not AI-generated hiring advice. Even when AI feedback is enabled, resume text is only sent after you explicitly opt in, and contact details are removed first.</p></div></section></main>;
}

export default App;
