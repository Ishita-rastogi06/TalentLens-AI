"""
Skill taxonomy / synonym map.

Structured after O*NET occupational skill ontologies and common JD phrasing.
Each canonical skill maps to a list of surface forms that should resolve to it.
"""

SKILL_SYNONYMS: dict[str, list[str]] = {

    # ── Programming Languages ──────────────────────────────────────────
    "python": [
        "python3", "python 3", "python programming", "py",
        "cpython", "python scripting",
    ],
    "java": [
        "core java", "java se", "java ee", "jdk", "java programming",
        "java 8", "java 11", "java 17",
    ],
    "javascript": [
        "js", "ecmascript", "es6", "es2015", "vanilla js", "vanilla javascript",
    ],
    "typescript": ["ts", "typed javascript"],
    "c++": ["cpp", "c plus plus", "c/c++"],
    "c#": ["c sharp", "dotnet", ".net", "asp.net", "csharp"],
    "go": ["golang"],
    "rust": ["rust lang", "rustlang"],
    "scala": ["scala programming"],
    "kotlin": ["kotlin programming"],
    "swift": ["swift programming", "ios swift"],
    "r": ["r language", "r programming", "rlang"],
    "matlab": ["matlab programming"],
    "perl": ["perl scripting"],
    "shell": ["bash", "bash scripting", "shell scripting", "sh", "zsh", "powershell"],
    "ruby": ["ruby on rails", "rails", "ror"],
    "php": ["php programming", "laravel", "symfony"],

    # ── AI / ML ────────────────────────────────────────────────────────
    "machine learning": [
        "ml", "machine-learning", "supervised learning",
        "unsupervised learning", "ml models", "predictive modeling",
        "statistical modeling", "ml engineering",
    ],
    "deep learning": [
        "dl", "deep-learning", "neural networks", "neural network",
        "ann", "dnn", "deep neural network",
    ],
    "artificial intelligence": [
        "ai", "ai/ml", "ai development", "ai engineering",
    ],
    "nlp": [
        "natural language processing", "text mining", "text analytics",
        "language models", "computational linguistics",
    ],
    "computer vision": [
        "cv", "image recognition", "image processing", "object detection",
        "image segmentation", "visual ai",
    ],
    "llm": [
        "large language model", "large language models", "gpt",
        "generative ai", "gen ai", "genai", "foundation models",
    ],
    "reinforcement learning": ["rl", "rlhf", "q-learning"],
    "tensorflow": ["tf", "tensorflow 2", "tf2", "keras"],
    "pytorch": ["torch", "pytorch framework"],
    "scikit-learn": ["sklearn", "scikit learn"],
    "xgboost": ["xgb", "gradient boosting"],
    "lightgbm": ["lgbm", "light gradient boosting"],
    "hugging face": ["huggingface", "transformers library", "hf transformers"],
    "langchain": ["lang chain", "langchain framework"],
    "openai": ["openai api", "gpt api", "chatgpt api"],
    "mlflow": ["ml flow", "mlops platform"],
    "kubeflow": ["kube flow"],

    # ── Data Engineering & Science ────────────────────────────────────
    "sql": [
        "structured query language", "relational database",
        "database queries", "sql queries",
    ],
    "mysql": ["my sql", "mysql database"],
    "postgresql": [
        "postgres", "postgre sql", "pg", "postgresql database",
    ],
    "sqlite": ["sqlite3", "sqlite database"],
    "mssql": ["sql server", "microsoft sql server", "t-sql", "tsql"],
    "oracle": ["oracle database", "oracle sql", "plsql", "pl/sql"],
    "mongodb": ["mongo", "mongo db", "nosql mongodb"],
    "redis": ["redis cache", "redis db"],
    "cassandra": ["apache cassandra"],
    "elasticsearch": ["elastic search", "elk stack", "opensearch"],
    "snowflake": ["snowflake data warehouse"],
    "bigquery": ["google bigquery", "bq"],
    "redshift": ["amazon redshift", "aws redshift"],
    "databricks": ["databricks platform", "delta lake"],
    "spark": ["apache spark", "pyspark", "spark sql"],
    "hadoop": ["apache hadoop", "hdfs", "hive", "mapreduce"],
    "kafka": ["apache kafka", "kafka streaming"],
    "airflow": ["apache airflow", "workflow orchestration"],
    "dbt": ["data build tool"],
    "numpy": ["np", "numerical python"],
    "pandas": ["pd", "python pandas"],
    "matplotlib": ["matplotlib pyplot", "pyplot"],
    "seaborn": ["seaborn visualization"],
    "plotly": ["plotly visualization", "dash"],
    "tableau": ["tableau desktop", "tableau server"],
    "power bi": ["powerbi", "microsoft power bi"],
    "excel": ["microsoft excel", "advanced excel", "vba"],

    # ── Backend Frameworks ────────────────────────────────────────────
    "fastapi": ["fast api", "fastapi framework"],
    "flask": ["flask framework", "python flask"],
    "django": ["django framework", "django rest framework", "drf"],
    "spring": ["spring boot", "spring mvc", "spring framework", "spring cloud"],
    "node.js": ["node", "nodejs", "node js"],
    "express": ["express.js", "expressjs"],
    "nestjs": ["nest.js", "nest js"],
    "graphql": ["graph ql", "graphql api"],
    "rest api": [
        "restful api", "rest services", "api development",
        "restful web services", "rest endpoints", "web api",
    ],
    "grpc": ["grpc api", "protocol buffers"],
    "celery": ["celery tasks", "task queue"],
    "rabbitmq": ["rabbit mq", "message queue"],

    # ── Frontend ──────────────────────────────────────────────────────
    "react": [
        "react.js", "reactjs", "react js",
        "react hooks", "react native",
    ],
    "angular": ["angular.js", "angularjs", "angular framework"],
    "vue": ["vue.js", "vuejs", "vue js"],
    "next.js": ["nextjs", "next js"],
    "svelte": ["svelte framework", "sveltekit"],
    "html": ["html5", "hypertext markup language"],
    "css": ["css3", "cascading style sheets", "sass", "scss", "less"],
    "tailwind": ["tailwind css", "tailwindcss"],
    "redux": ["redux toolkit", "state management"],
    "webpack": ["webpack bundler"],

    # ── Cloud ─────────────────────────────────────────────────────────
    "aws": [
        "amazon web services", "amazon aws", "aws cloud",
        "ec2", "s3", "lambda", "ecs", "eks", "rds", "sagemaker",
    ],
    "azure": [
        "microsoft azure", "azure cloud", "azure devops",
        "azure functions", "aks",
    ],
    "gcp": [
        "google cloud", "google cloud platform",
        "gke", "cloud run", "vertex ai",
    ],
    "serverless": ["serverless framework", "faas", "function as a service"],

    # ── DevOps & MLOps ────────────────────────────────────────────────
    "docker": [
        "containerization", "containers", "dockerfile",
        "container orchestration", "docker compose",
    ],
    "kubernetes": [
        "k8s", "kubectl", "helm", "container orchestration kubernetes",
    ],
    "jenkins": ["jenkins ci", "jenkins pipeline"],
    "terraform": ["terraform iac", "infrastructure as code"],
    "ansible": ["ansible automation", "configuration management"],
    "github actions": [
        "github workflow", "github ci", "github ci/cd",
    ],
    "gitlab ci": ["gitlab pipeline", "gitlab ci/cd"],
    "ci/cd": [
        "continuous integration", "continuous deployment",
        "continuous delivery", "cicd", "ci cd pipeline",
    ],
    "prometheus": ["prometheus monitoring"],
    "grafana": ["grafana dashboards"],
    "datadog": ["datadog monitoring", "observability"],
    "nginx": ["nginx server", "reverse proxy"],

    # ── Tools & Practices ─────────────────────────────────────────────
    "git": [
        "github", "gitlab", "bitbucket", "version control",
        "source control", "git flow",
    ],
    "linux": [
        "unix", "ubuntu", "centos", "rhel", "debian",
        "linux administration", "linux commands",
    ],
    "agile": [
        "agile methodology", "scrum", "kanban",
        "sprint planning", "jira",
    ],
    "jira": ["jira software", "atlassian jira"],
    "system design": [
        "distributed systems", "system architecture",
        "high level design", "low level design", "hld", "lld",
    ],
    "microservices": [
        "microservice architecture", "service oriented architecture", "soa",
    ],
    "api design": ["api architecture", "openapi", "swagger"],
    "testing": [
        "unit testing", "integration testing", "test driven development",
        "tdd", "bdd", "pytest", "junit", "jest", "selenium",
    ],
    "data structures": [
        "dsa", "algorithms", "data structures and algorithms",
        "competitive programming",
    ],

    # ── Security ──────────────────────────────────────────────────────
    "cybersecurity": [
        "information security", "infosec", "security engineering",
    ],
    "oauth": ["oauth2", "openid connect", "sso", "jwt", "authentication"],
}
