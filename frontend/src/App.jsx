import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import StudentDashboard from "./pages/StudentDashboard";
import RecruiterDashboard from "./pages/RecruiterDashboard";
import "./styles/theme.css";

export default function App(){

return(
<BrowserRouter>

<Routes>

<Route path="/" element={<Landing/>} />

<Route path="/student" element={<StudentDashboard/>} />

<Route path="/recruiter" element={<RecruiterDashboard/>} />

</Routes>

</BrowserRouter>
)

}