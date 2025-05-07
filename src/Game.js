import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, Spinner, Container } from 'react-bootstrap';
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { ChatFeed, Message } from 'react-chat-ui';
import app from "./firebase";

const db = getFirestore(app);

function Game() {
  const [searchParams] = useSearchParams(); 
  const userDocId = searchParams.get("userDocId");
  const [step, setStep] = useState("intro"); // intro / chat / result
  const [conversation, setConversation] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true); 
  const navigate = useNavigate();
  // 불러오기
  useEffect(() => {
    async function fetchData() {
      const docRef = doc(db, "users", userDocId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setConversation(data.openAiResults || []);
      }
      setLoading(false);
    }
    if (userDocId) fetchData();
  }, [userDocId]);

  const handleStart = () => {
    setStep("chat");
    setChatMessages([]);  // 초기화
    setCurrentIndex(0);
  };

  const handleNextMessage = () => {
    if (currentIndex < conversation.length) {
      const entry = conversation[currentIndex];
      const isMe = entry.Person === "Me";
      setChatMessages((prev) => [...prev, new Message({ id: isMe ? 0 : 1, message: entry.Message })]);
      setCurrentIndex((prev) => prev + 1);
    } else {
      const newScore = Math.floor(Math.random() * 100); // 예시 점수
      setScore(newScore);
      setStep("result");
    }
  };

  const handleRetry = () => {
    setStep("intro");
    setScore(0);
    setChatMessages([]);
    setCurrentIndex(0);
  };

  const handleComplete = () => {
    navigate(`/chat?userDocId=${userDocId}`);
  };

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ height: "100vh" }}>
        <Spinner animation="border" />
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      {step === "intro" && (
        <Card className="p-4 shadow-sm">
          {/*<img src="/example-img.png" alt="intro" className="mb-3 rounded" style={{ width: "100%", maxHeight: 200, objectFit: "cover" }} />*/}
          <h5>Let's play games with the same situation you encountered.</h5>
          <ul>
            <li>If you achieve > score </li>

          </ul>
          <Button className="w-100 mt-3" onClick={handleStart}>Start Simulation</Button>
        </Card>
      )}

      {step === "chat" && (
        <Card className="p-4 shadow-sm">
          <h5 className="mb-3">Conversation Simulation</h5>
          <ChatFeed
            messages={chatMessages}
            isTyping={false}
            hasInputField={false}
            showSenderName
            bubblesCentered={false}
          />
          <Button className="mt-3 w-100" onClick={handleNextMessage}>
            {currentIndex < conversation.length ? "Next" : "Finish"}
          </Button>
        </Card>
      )}

      {step === "result" && (
        <Card className="p-4 shadow-sm text-center">
          <h5>Your Score</h5>
          <h1 className="display-4 mb-4">{score} / 100</h1>
          {score >= 60 ? (
            <>
              <p>Great job! You've passed the threshold.</p>
              <Button onClick={handleComplete}>Complete</Button>
            </>
          ) : (
            <>
              <p>🌀 Not quite there yet. Try again to improve your conversation.</p>
              <Button variant="outline-primary" onClick={handleRetry}>Retry</Button>
            </>
          )}
        </Card>
      )}
    </Container>
  );
}

export default Game;
