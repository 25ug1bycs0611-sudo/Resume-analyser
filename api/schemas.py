from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ExperienceLevel = Literal["Fresher", "Entry-Level", "Mid-Level", "Senior"]
AnalysisType = Literal[
    "General Resume Review",
    "ATS Compatibility",
    "Job Matching",
    "Skill Gap Analysis",
    "Career Improvement",
]
FeedbackStyle = Literal["Beginner-Friendly", "Detailed Professional", "Concise"]


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    resume_text: str = Field(min_length=1, max_length=60_000)
    job_title: str = Field(default="", max_length=160)
    industry: str = Field(default="", max_length=120)
    job_description: str = Field(default="", max_length=12_000)
    required_skills: list[str] = Field(default_factory=list, max_length=80)
    experience_level: ExperienceLevel = "Entry-Level"
    preferred_location: str = Field(default="", max_length=120)
    career_path: str = Field(default="", max_length=180)
    analysis_type: AnalysisType = "General Resume Review"
    output_language: str = Field(default="English", max_length=40)
    feedback_style: FeedbackStyle = "Beginner-Friendly"
    consent_to_ai: bool = False
    consent_to_store: bool = False

    @field_validator("resume_text")
    @classmethod
    def meaningful_resume(cls, value: str) -> str:
        words = [word for word in value.split() if any(character.isalpha() for character in word)]
        if len(words) < 20:
            raise ValueError("Add at least 20 words of resume content before analyzing.")
        return value

    @field_validator("required_skills")
    @classmethod
    def clean_required_skills(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(value.strip()[:80] for value in values if value.strip()))


class ManualEntry(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    organization: str = Field(default="", max_length=180)
    title: str = Field(default="", max_length=180)
    dates: str = Field(default="", max_length=100)
    details: str = Field(default="", max_length=3000)


class ManualResume(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    full_name: str = Field(min_length=2, max_length=160)
    headline: str = Field(default="", max_length=180)
    email: str = Field(default="", max_length=254)
    phone: str = Field(default="", max_length=40)
    location: str = Field(default="", max_length=120)
    summary: str = Field(min_length=10, max_length=5000)
    education: list[ManualEntry] = Field(default_factory=list, max_length=20)
    skills: list[str] = Field(default_factory=list, max_length=100)
    experience: list[ManualEntry] = Field(default_factory=list, max_length=30)
    projects: list[ManualEntry] = Field(default_factory=list, max_length=30)
    certifications: list[ManualEntry] = Field(default_factory=list, max_length=30)
    achievements: str = Field(default="", max_length=5000)

    @model_validator(mode="after")
    def has_supporting_content(self) -> "ManualResume":
        if not (self.skills or self.education or self.experience or self.projects):
            raise ValueError("Add at least one skill, education entry, experience, or project.")
        return self

    def as_text(self) -> str:
        sections: list[str] = [self.full_name, self.headline, self.location, self.summary, "Skills"]
        sections.extend(self.skills)
        for heading, items in (
            ("Education", self.education),
            ("Experience", self.experience),
            ("Projects", self.projects),
            ("Certifications", self.certifications),
        ):
            sections.extend((heading, *(f"{item.title} | {item.organization} | {item.dates}\n{item.details}" for item in items)))
        if self.achievements:
            sections.extend(("Achievements", self.achievements))
        return "\n".join(section for section in sections if section.strip())


class ManualAnalyzeRequest(BaseModel):
    resume: ManualResume
    job_title: str = Field(default="", max_length=160)
    industry: str = Field(default="", max_length=120)
    job_description: str = Field(default="", max_length=12_000)
    required_skills: list[str] = Field(default_factory=list, max_length=80)
    experience_level: ExperienceLevel = "Entry-Level"
    preferred_location: str = Field(default="", max_length=120)
    career_path: str = Field(default="", max_length=180)
    analysis_type: AnalysisType = "General Resume Review"
    output_language: str = Field(default="English", max_length=40)
    feedback_style: FeedbackStyle = "Beginner-Friendly"
    consent_to_ai: bool = False
    consent_to_store: bool = False


class SkillMatch(BaseModel):
    name: str
    status: Literal["matched", "partial", "missing"]
    explanation: str


class ResumeScores(BaseModel):
    overall: int = Field(ge=0, le=100)
    relevance: int = Field(ge=0, le=100)
    skills: int = Field(ge=0, le=100)
    experience: int = Field(ge=0, le=100)
    education: int = Field(ge=0, le=100)
    clarity: int = Field(ge=0, le=100)
    impact: int = Field(ge=0, le=100)


class ResumeAnalysis(BaseModel):
    analysis_id: str
    created_at: str
    quality_label: Literal["Demo analysis", "AI-assisted analysis"]
    scores: ResumeScores
    summary: str
    job_match_score: int | None = Field(default=None, ge=0, le=100)
    ats_issues: list[str]
    strengths: list[str]
    weaknesses: list[str]
    skills: list[SkillMatch]
    keyword_suggestions: list[str]
    section_suggestions: list[str]
    action_plan: list[str]
    bullet_examples: list[dict[str, str]]
    suggested_summary: str
    methodology: str


class RegistrationRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        if "@" not in value or "." not in value.rsplit("@", 1)[-1]:
            raise ValueError("Enter a valid email address.")
        return value.lower()


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class Account(BaseModel):
    id: str
    name: str
    email: str
    role: Literal["user", "counselor"] = "user"


class AuthResponse(BaseModel):
    token: str
    user: Account


class HistoryItem(BaseModel):
    analysis_id: str
    created_at: str
    job_title: str
    analysis_type: str
    overall_score: int
    job_match_score: int | None = None
