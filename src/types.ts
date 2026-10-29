export type RoleLevel = "Fresher" | "Entry-Level" | "Mid-Level" | "Senior";
export type AnalysisKind =
  | "General Resume Review"
  | "ATS Compatibility"
  | "Job Matching"
  | "Skill Gap Analysis"
  | "Career Improvement";
export type Entry = { organization: string; title: string; dates: string; details: string };
export type ResumeDraft = {
  full_name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  education: Entry[];
  skills: string[];
  experience: Entry[];
  projects: Entry[];
  certifications: Entry[];
  achievements: string;
};
export type AnalysisInput = {
  resume_text: string;
  job_title: string;
  industry: string;
  job_description: string;
  required_skills: string[];
  experience_level: RoleLevel;
  preferred_location: string;
  career_path: string;
  analysis_type: AnalysisKind;
  output_language: string;
  feedback_style: "Beginner-Friendly" | "Detailed Professional" | "Concise";
  consent_to_ai: boolean;
  consent_to_store: boolean;
};
export type SkillMatch = { name: string; status: "matched" | "partial" | "missing"; explanation: string };
export type AnalysisResult = {
  analysis_id: string;
  created_at: string;
  quality_label: "Demo analysis" | "AI-assisted analysis";
  scores: { overall: number; relevance: number; skills: number; experience: number; education: number; clarity: number; impact: number };
  summary: string;
  job_match_score: number | null;
  ats_issues: string[];
  strengths: string[];
  weaknesses: string[];
  skills: SkillMatch[];
  keyword_suggestions: string[];
  section_suggestions: string[];
  action_plan: string[];
  bullet_examples: { before: string; after: string; note: string }[];
  suggested_summary: string;
  methodology: string;
};
export type Session = { id: string; name: string; email: string; role: "user" | "counselor"; token: string };
export type HistoryItem = { analysis_id: string; created_at: string; job_title: string; analysis_type: AnalysisKind; overall_score: number; job_match_score: number | null };
