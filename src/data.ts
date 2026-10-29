import type { AnalysisInput, ResumeDraft, RoleLevel } from "./types";

export const initialResume: ResumeDraft = {
  full_name: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  summary: "",
  education: [{ title: "", organization: "", dates: "", details: "" }],
  skills: [],
  experience: [{ title: "", organization: "", dates: "", details: "" }],
  projects: [{ title: "", organization: "", dates: "", details: "" }],
  certifications: [{ title: "", organization: "", dates: "", details: "" }],
  achievements: "",
};

export const sampleResume = `ALEX MORGAN
Computer Science Graduate | Software Engineer
alex.morgan@example.com | Bengaluru, India

SUMMARY
Computer science graduate with project experience building web applications and analyzing data. Curious, collaborative, and looking for an entry-level software engineering role.

EDUCATION
B.Tech, Computer Science — Northstar Institute | 2024
Relevant coursework: algorithms, databases, software engineering

SKILLS
Python, JavaScript, React, SQL, Git, REST APIs, problem solving, teamwork

PROJECTS
Campus events platform — Student project | 2024
- Built a React application to help students find campus events.
- Developed a Python REST API and SQL database for event listings.
- Improved average page load time by 28% through image optimization.

Open data explorer — Personal project | 2023
- Analyzed 2,000 public transport records with Python and pandas.
- Created visualizations to summarize service patterns for a class presentation.

EXPERIENCE
Software Development Intern — Example Studio | Jun 2023 – Aug 2023
- Developed reusable UI components with React and JavaScript.
- Collaborated with a team of four using Git and weekly code reviews.
- Automated a manual data-cleaning step, reducing review time by 3 hours per week.

CERTIFICATIONS
Introduction to Cloud Computing — Example Learning | 2023`;

export const sampleJob = `We're looking for an entry-level software engineer to build reliable web features.
Requirements: JavaScript or TypeScript, React, Python, REST APIs, SQL, Git, communication, and teamwork.
You will collaborate with product and design, write tested code, and help improve application performance.
Familiarity with Agile and automated testing is a plus.`;

export const levelHint: Record<RoleLevel, string> = {
  Fresher: "We’ll give extra weight to education, projects, internships, and certifications.",
  "Entry-Level": "We’ll look for relevant coursework, practical examples, and early-career experience.",
  "Mid-Level": "We’ll emphasize ownership, cross-functional work, and measurable delivery.",
  Senior: "We’ll emphasize leadership, strategic outcomes, and increasing scope.",
};

export const analysisKinds: AnalysisInput["analysis_type"][] = [
  "General Resume Review", "ATS Compatibility", "Job Matching", "Skill Gap Analysis", "Career Improvement",
];

export const demoJobs = [
  { title: "Frontend developer", level: "Entry-Level" as RoleLevel, text: "Build accessible React experiences with JavaScript or TypeScript. Work with designers, APIs, automated tests, and Git." },
  { title: "Data analyst", level: "Fresher" as RoleLevel, text: "Use SQL, Python, Excel, and Tableau or Power BI to explore data and explain findings to stakeholders." },
  { title: "Product designer", level: "Mid-Level" as RoleLevel, text: "Create thoughtful user experiences with research, Figma, clear communication, and cross-functional collaboration." },
];
