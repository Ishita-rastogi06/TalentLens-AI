import { useNavigate } from "react-router-dom";
import "../styles/theme.css";


export default function Landing(){

const navigate = useNavigate();


return(

<div className="landing">


<section className="hero">


<h1 className="hero-title">
  TalentLens:
  <span>
    YOUR OWN AI SCREENER
  </span>
</h1>


<p>

AI powered resume intelligence platform
that helps students optimize their careers
and recruiters find the right talent.

</p>


<div className="hero-buttons">


<button
onClick={()=>navigate("/student")}
>

I'm a Student

</button>


<button
onClick={()=>navigate("/recruiter")}
>

I'm a Recruiter

</button>


</div>


</section>





<section className="about">


<h2>
What does TalentLens do?
</h2>


<div className="cards">


<div className="info-card">

<h3>
Resume Intelligence
</h3>

<p>
Analyze resumes against job descriptions
using AI based screening.
</p>

</div>



<div className="info-card">

<h3>
ATS Optimization
</h3>

<p>
Identify missing skills and improve
your chances of selection.
</p>

</div>




<div className="info-card">

<h3>
AI Career Assistant
</h3>

<p>
Get personalized suggestions and
resume insights.
</p>

</div>


</div>


</section>







<section className="student-section">


<h2>
ARE YOU A STUDENT...?💡
</h2>


<div className="horizontal">


<div className="info-card">

<h3>
📄 Resume Score
</h3>

<p>
Know how recruiters see your resume.
</p>

</div>



<div className="info-card">

<h3>
🎯 Skill Gap Detection
</h3>

<p>
Find missing skills required for jobs.
</p>

</div>




<div className="info-card">

<h3>
🔑 Career Growth
</h3>

<p>
Improve your profile with AI suggestions.
</p>

</div>


</div>


<button
onClick={()=>navigate("/student")}
>

CLICK TO START AS STUDENT

</button>


</section>








<section className="recruiter-section">


<h2>
OH HERE'S IN FOR RECRUITERS...🔎
</h2>


<div className="vertical">


<div className="info-card">

<h3>
🏆 AI Candidate Ranking
</h3>

<p>
Rank hundreds of candidates instantly.
</p>

</div>



<div className="info-card">

<h3>
    
⚡ Smart Screening
</h3>

<p>
Reduce manual resume filtering.
</p>

</div>




<div className="info-card">

<h3>
🧠 Candidate Intelligence
</h3>

<p>
Understand candidate strengths and gaps.
</p>

</div>



</div>


<button
onClick={()=>navigate("/recruiter")}
>

CLICK TO START AS RECRUITER

</button>


</section>




</div>

)

}