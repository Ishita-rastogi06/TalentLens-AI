import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { API_URL } from "../config/api";

const buildLocalReply = (question, analysis) => {
  if (Array.isArray(analysis) && analysis.length) {
    const candidates = analysis
      .filter((item) => item && typeof item === "object")
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

    if (candidates.length) {
      const top = candidates[0];
      const runnerUp = candidates[1];
      const name = top.name || top.resume_name || "Top candidate";
      const matched = (top.matched_skills || []).slice(0, 5).join(", ") || "the strongest available skill overlap";
      const missing = (top.missing_skills || []).slice(0, 4).join(", ") || "no major listed gaps";
      const wantsComparison = /better|best|rank|compare|shortlist/i.test(question);

      if (wantsComparison) {
        return [
          `**Best Candidate: ${name}**`,
          `- Score: ${top.score || 0}/100`,
          `- Verdict: ${top.verdict || "Best current match"}`,
          `- Strongest match signals: ${matched}`,
          `- Main gaps to verify: ${missing}`,
          runnerUp ? `- Next closest candidate: ${runnerUp.name || runnerUp.resume_name || "Second candidate"} with ${runnerUp.score || 0}/100` : "",
          "",
          "I used the current analysis because the AI service did not respond in time.",
        ].filter(Boolean).join("\n");
      }

      return `**Quick Shortlist View:** ${name} is leading with ${top.score || 0}/100. Strong match signals: ${matched}. Gaps to check: ${missing}.`;
    }
  }

  if (analysis && typeof analysis === "object") {
    const matched = (analysis.matched_skills || []).slice(0, 5).join(", ") || "limited direct skill overlap";
    const missing = (analysis.missing_skills || []).slice(0, 4).join(", ") || "no major listed gaps";

    return [
      "**Resume Snapshot**",
      `- ATS Score: ${analysis.score || 0}/100`,
      `- Verdict: ${analysis.verdict || "Needs Review"}`,
      `- Strong areas: ${matched}`,
      `- Improve next: ${missing}`,
      "",
      "I used the current analysis because the AI service did not respond in time.",
    ].join("\n");
  }

  return "Run an analysis first, then I can compare candidates or explain the resume score.";
};

const cleanBotText = (text) =>
  String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/â€¢/g, "-")
    .trim();

const cannotAnswerReply = "Sorry, I cannot answer this. Please ask something related to the resume, ATS score, skills, career advice, or candidate comparison.";

const isUsefulChatQuestion = (text) => {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.length < 3) return false;

  const blockedTerms = /\b(fuck|shit|bitch|nitch|asshole|bastard|chutiya|madarchod|bhenchod|bc|mc)\b/i;
  if (blockedTerms.test(trimmed)) return false;

  const letters = trimmed.match(/[a-z]/g) || [];
  const vowels = trimmed.match(/[aeiou]/g) || [];
  const words = trimmed.match(/[a-z0-9]+/g) || [];
  const hasLongGibberishToken = words.some((word) => word.length >= 12 && !/[aeiou]/.test(word));
  const hasRepeatedNoise = /(.)\1{5,}/.test(trimmed);
  const looksMostlySymbols = letters.length / Math.max(trimmed.length, 1) < 0.35;
  const domainQuestion = /\b(what|why|how|who|which|when|where|compare|best|better|score|skill|skills|resume|ats|candidate|candidates|improve|improvement|career|job|rank|ranking|shortlist|strength|weakness|missing|match|matched|gap|gaps|select|hire|interview)\b/.test(trimmed);

  if (hasRepeatedNoise || hasLongGibberishToken || looksMostlySymbols) return false;
  if (letters.length >= 5 && vowels.length === 0) return false;
  return domainQuestion;
};

export default function Chatbot({ analysisResult }) {
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "Hi! I'm TalentLens AI. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const question = input;
    setMessages((prev) => [...prev, { sender: "user", text: question }]);
    setInput("");

    if (!isUsefulChatQuestion(question)) {
      setMessages((prev) => [...prev, { sender: "bot", text: cannotAnswerReply }]);
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(`${API_URL}/chat`, {
        message: question,
        analysis: analysisResult,
      }, {
        timeout: 20000,
      });

      if (res.status < 200 || res.status >= 300) {
        throw new Error(res.data?.detail || `Backend request failed (${res.status})`);
      }

      const reply = res.data.reply || "I can help once an analysis is available.";
      const cleanReply = /unable to reach groq api|groq_api_key|apiconnectionerror/i.test(reply)
        ? buildLocalReply(question, analysisResult)
        : reply;

      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: cleanBotText(cleanReply),
        },
      ]);
    } catch (error) {
      const detail = error.response?.data?.detail || error.message || "";
      const fallbackReply = buildLocalReply(question, analysisResult);

      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: cleanBotText(
            /timeout|network error|failed to fetch|connect|cors|request failed/i.test(detail)
              ? fallbackReply
              : `${fallbackReply}\n\n_Note: ${detail || "The AI service was unavailable."}_`
          ),
        },
      ]);
    } finally {
      setLoading(false);
    }
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
          TalentLens AI Career Assistant
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
          disabled={loading}
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
          aria-label="Send message"
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
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {loading ? "..." : ">"}
        </button>
      </div>
    </div>
  );
}
