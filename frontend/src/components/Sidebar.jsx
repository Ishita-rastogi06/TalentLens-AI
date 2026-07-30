import { useNavigate } from "react-router-dom";

export default function Sidebar({

  role,

  activeTab,

  setActiveTab

}) {

  const navigate = useNavigate();

  const studentTabs = [

    "dashboard",
    
    "analysis",

    "insights",

    "chatbot",

    "export"

  ];

  const recruiterTabs = [

  "dashboard",

  "ranks",

  "analysis",

  "insights",

  "chatbot",

  "connect"

];

  const tabs =

    role === "student"

      ? studentTabs

      : recruiterTabs;

  return (

    <div className="sidebar">

      <h2>

        TalentLens

      </h2>

      {

        tabs.map((tab) => (

          <div

            key={tab}

            className={

              activeTab === tab

                ?

                "nav-item active"

                :

                "nav-item"

            }

            onClick={() =>

              setActiveTab(tab)

            }

          >

            {

              tab.charAt(0)

                .toUpperCase()

                +

                tab.slice(1)

            }

          </div>

        ))

      }

      <button

        style={{

          marginTop: 30,

          width: "100%"

        }}

        onClick={() => navigate("/")}

      >

        ⬅ Home

      </button>

    </div>

  );

}