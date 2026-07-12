import re


# ======================================
# SECTION DETECTION
# ======================================

def detect_sections(text):

    text = text.lower()

    sections = {

        "projects": False,
        "experience": False,
        "education": False,
        "certifications": False,
        "skills": False

    }


    keywords = {

        "projects":[
            "project",
            "projects",
            "academic projects",
            "personal projects"
        ],

        "experience":[
            "experience",
            "internship",
            "work history",
            "employment"
        ],

        "education":[
            "education",
            "degree",
            "university",
            "college"
        ],

        "certifications":[
            "certificate",
            "certifications",
            "courses"
        ],

        "skills":[
            "skills",
            "technical skills"
        ]

    }


    for section, words in keywords.items():

        for word in words:

            if word in text:
                sections[section] = True
                break


    return sections



# ======================================
# PROJECT ANALYSIS
# ======================================

PROJECT_TECH = [

    "python",
    "java",
    "machine learning",
    "deep learning",
    "tensorflow",
    "pytorch",
    "nlp",
    "computer vision",
    "react",
    "fastapi",
    "django",
    "sql",
    "aws",
    "docker"

]
PROJECT_PATTERN = re.compile(
    r"(?im)^(?:[-•]\s*)?([A-Z][A-Za-z0-9 .:+#&_-]{3,60})$"
)

def extract_project_names(text):
    projects = []

    for match in PROJECT_PATTERN.findall(text):
        name = match.strip()

        if len(name.split()) <= 8:
            if name.lower() not in [
                "education",
                "skills",
                "experience",
                "projects",
                "certifications",
            ]:
                projects.append(name)

    return list(dict.fromkeys(projects))[:10]

def analyze_projects(text):

    text = text.lower()


    score = 0


    project_count = len(
        re.findall(
            r"project|developed|built|implemented|created",
            text
        )
    )


    tech_count = 0

    for tech in PROJECT_TECH:

        if tech in text:
            tech_count += 1



    github = 1 if "github" in text else 0

    deployed = 1 if any(
        word in text
        for word in [
            "deployed",
            "production",
            "cloud",
            "hosted"
        ]
    ) else 0



    # scoring out of 20

    score += min(project_count * 2, 10)

    score += min(tech_count,5)

    score += github * 3

    score += deployed * 2



    return {

        "project_count": project_count,

        "technologies": tech_count,

        "github_projects": github,

        "deployed_projects": deployed,

        "project_score": min(score,20)

    }




# ======================================
# EXPERIENCE ANALYSIS
# ======================================


def analyze_experience(text):

    text=text.lower()


    internships = len(
        re.findall(
            r"intern|internship",
            text
        )
    )


    years = re.findall(
        r"(\d+)\+?\s*(?:year|years)",
        text
    )


    years_exp = 0

    if years:

        years_exp=max(
            [int(x) for x in years]
        )


    full_time = 1 if any(
        x in text
        for x in [
            "software engineer",
            "developer",
            "engineer"
        ]
    ) else 0



    score = 0


    score += min(internships*5,5)

    score += min(years_exp*3,6)

    score += full_time*4



    return {

        "internships":internships,

        "years":years_exp,

        "full_time":full_time,

        "experience_score":min(score,15)

    }



# ======================================
# EDUCATION
# ======================================


def analyze_education(text):

    text=text.lower()


    degree = any(
        x in text
        for x in [
            "b.tech",
            "btech",
            "b.e",
            "m.tech",
            "computer science",
            "computer engineering"
        ]
    )


    cgpa = bool(
        re.search(
            r"(cgpa|gpa)\s*[:\-]?\s*\d",
            text
        )
    )


    score=0


    if degree:
        score+=7

    if cgpa:
        score+=3


    return {

        "degree_found":degree,

        "cgpa_found":cgpa,

        "education_score":score

    }



# ======================================
# CERTIFICATIONS
# ======================================


def analyze_certifications(text):

    text=text.lower()


    cert_words=[

        "certificate",
        "certification",
        "coursera",
        "udemy",
        "aws",
        "google",
        "ibm",
        "microsoft"

    ]


    count=0


    for word in cert_words:

        if word in text:
            count+=1



    return {

        "certification_count":count,

        "certification_score":min(count,5)

    }




# ======================================
# RESUME QUALITY
# ======================================


def analyze_quality(text):

    score=0

    sections=detect_sections(text)


    score += sum(
        1 for value in sections.values()
        if value
    )


    length=len(text)


    if length>1500:
        score+=1


    if "@" in text:
        score+=1


    return {

        "sections":sections,

        "quality_score":min(score,5)

    }



# ======================================
# MASTER FUNCTION
# ======================================


def extract_resume_features(text):


    return {


        "projects":
            analyze_projects(text),


        "experience":
            analyze_experience(text),


        "education":
            analyze_education(text),


        "certifications":
            analyze_certifications(text),


        "quality":
            analyze_quality(text)

    }