import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function Chatbot({ analysisResult }) {
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "👋 Hi! I'm TalentLens AI. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const question = input;
    setMessages((prev) => [...prev, { sender: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await axios.post(`${API_URL}/chat`, {
        message: question,
        analysis: analysisResult,
      });

      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: res.data.reply
            .replace(/\r\n/g, "\n")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/•/g, "-"),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "❌ Unable to connect with AI." },
      ]);
    }

    setLoading(false);
  };

  return (
    <div
      className="talentlens-chatbot"
      style={{
        width: "100%",
        height: "calc(100vh - 90px)",
        minHeight: 0,
        marginTop: 47,
        background: "#fffdf9",
        borderRadius: 22,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 14px 36px rgba(107,66,38,.16)",
        border: "1px solid rgba(200,161,90,.22)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(100deg,#7b3048 0%,#8b4b3d 52%,#c3955b 100%)",
          color: "#fff",
          padding: "22px 24px",
          textAlign: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 23, letterSpacing: ".1px" }}>
          🤖 TalentLens AI Career Assistant
        </h2>
        <p style={{ margin: "8px 0 0", opacity: 0.92, fontSize: 15 }}>
          Ask anything about Resume, ATS Score or Career.
        </p>
      </div>

      <div
        className="chatbot-messages"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          padding: "28px 30px",
          background: "linear-gradient(180deg,#fffaf3 0%,#f8f1e9 100%)",
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              textAlign: msg.sender === "user" ? "right" : "left",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: "16px 20px",
                borderRadius: 18,
                maxWidth: "75%",
                background:
                  msg.sender === "user"
                    ? "linear-gradient(100deg,#7b3048,#c3955b)"
                    : "#fffdf9",
                color: msg.sender === "user" ? "#fff" : "#3f3028",
                boxShadow: "0 5px 15px rgba(75,45,27,.10)",
                lineHeight: 1.5,
                fontSize: 15,
                wordBreak: "break-word",
              }}
            >
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h2 style={{ margin: "4px 0 8px", color: "#7b3048", fontSize: 20, lineHeight: 1.25 }}>{children}</h2>
                  ),
                  h2: ({ children }) => (
                    <h3 style={{ margin: "4px 0 8px", color: "#7b3048", fontSize: 18, lineHeight: 1.25 }}>{children}</h3>
                  ),
                  h3: ({ children }) => (
                    <h4 style={{ margin: "4px 0 6px", color: "#7b3048", fontSize: 16, lineHeight: 1.25 }}>{children}</h4>
                  ),
                  p: ({ children }) => <p style={{ margin: "0 0 8px", lineHeight: 1.5 }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>{children}</ul>,
                  li: ({ children }) => <li style={{ marginBottom: 4, lineHeight: 1.5 }}>{children}</li>,
                }}
              >
                {msg.text}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {loading && <p style={{ color: "#6b4226" }}>AI is typing...</p>}
        <div ref={bottomRef} />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "18px 22px",
          gap: 12,
          borderTop: "1px solid #eadbc9",
          background: "#fffdf9",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask anything about Resume, ATS, Career..."
          style={{
            flex: 1,
            padding: "16px 22px",
            borderRadius: 40,
            border: "1px solid #dfc9ae",
            background: "#fff",
            color: "#3f3028",
            outline: "none",
            fontSize: 15,
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          style={{
            width: 56,
            height: 56,
            padding: 0,
            borderRadius: "50%",
            border: "none",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            background: "linear-gradient(100deg,#7b3048,#c3955b)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {loading ? "..." : "➤"}
        </button>
      </div>
    </div>
  );
}
