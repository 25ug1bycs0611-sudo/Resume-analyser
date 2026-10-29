from api.engine import analyze
from api.schemas import AnalysisRequest, ManualResume


RESUME = """
JORDAN LEE
Entry-level software engineer
SUMMARY
Computer science graduate with project experience building software and collaborating with a team.
EDUCATION
Bachelor of Science in Computer Science, 2025
SKILLS
Python, JavaScript, React, SQL, Git, teamwork
PROJECTS
Campus events application
- Built a React application to help students find events.
- Improved loading time by 25% through image optimization.
"""


def test_job_specific_skills_and_match_score_are_personalized():
    request = AnalysisRequest(
        resume_text=RESUME,
        job_title="Software engineer",
        job_description="React Python SQL Git and communication for software engineer.",
        required_skills=["React", "Python", "Figma"],
        experience_level="Fresher",
    )
    result = analyze(request)

    skills = {item.name: item.status for item in result.skills}
    assert result.quality_label == "Demo analysis"
    assert skills["React"] == "matched"
    assert skills["Python"] == "matched"
    assert skills["Figma"] == "missing"
    assert result.job_match_score is not None
    assert result.scores.overall in range(101)
    assert result.methodology.startswith("The demo score weights")


def test_general_review_does_not_claim_a_job_match():
    result = analyze(AnalysisRequest(resume_text=RESUME))

    assert result.job_match_score is None
    assert result.quality_label == "Demo analysis"
    assert result.action_plan
    assert result.bullet_examples[0]["note"].startswith("Illustrative")


def test_resume_validation_rejects_non_resume_text():
    try:
        AnalysisRequest(resume_text="hello there")
    except ValueError as error:
        assert "at least 20 words" in str(error)
    else:
        raise AssertionError("Short non-resume input should be rejected.")


def test_manual_resume_creates_readable_sections():
    resume = ManualResume(
        full_name="Jordan Lee",
        summary="Computer science graduate with an interest in practical software engineering projects.",
        skills=["Python", "Git"],
        projects=[{"title": "Campus tool", "details": "Built a student event application with a small project team."}],
    )

    text = resume.as_text()
    result = analyze(AnalysisRequest(resume_text=text))

    assert "Jordan Lee" in text
    assert "Projects" in text
    assert result.scores.overall > 0
