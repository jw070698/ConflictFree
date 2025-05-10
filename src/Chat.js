import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Form, Button, Container, Row, Col, ProgressBar, Card } from 'react-bootstrap';
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import app from "./firebase";
import { ChatFeed, Message } from 'react-chat-ui';
import { normalizeOpenAiResults, processAllPersonalityAnalyses } from './Analysis';

const db = getFirestore(app);

function Chat() {
    const [searchParams] = useSearchParams(); 
    const userDocId = searchParams.get("userDocId");
    const [userData, setUserData] = useState(null);
    const [conversation, setConversation] = useState([]);
    const [inputValue, setInputValue] = useState("");
    const [loadingResponses, setLoadingResponses] = useState(false);
    const senderIdMap = React.useRef({});
    const nextId = React.useRef(1);
    const [tip, setTip] = useState("");
    const [highlightedInput, setHighlightedInput] = useState("");

    function getParticipantId(senderName) {
        if (senderIdMap.current[senderName] !== undefined) {
          return senderIdMap.current[senderName];
        }
        if (senderName === "Me") {
          senderIdMap.current[senderName] = 0;
        } else {
          senderIdMap.current[senderName] = nextId.current++;
        }
        return senderIdMap.current[senderName];
    }

    useEffect(() => {
        async function fetchUserData() {
          if (!userDocId) return;
          const userDocRef = doc(db, "users", userDocId);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(data);
            if (data.openAiResults && Array.isArray(data.openAiResults)) {
              const sorted = [...data.openAiResults].sort((a, b) => a.Order - b.Order);
              const formatted = sorted.map(item => ({
                sender: item.Person,
                text: item.Message,
                order: item.Order
              }));
              setConversation(formatted);
            }
          }
        }
        fetchUserData();
      }, [userDocId]);

    async function saveMessage(messageObj) {
        if (!userDocId) return;
        try {
        await updateDoc(doc(db, "users", userDocId), {
            chatHistory: arrayUnion(messageObj),
            updatedAt: serverTimestamp()
        });
        } catch (err) {
        console.error("Error saving message to Firebase:", err);
        }
    }

    useEffect(() => {
        async function runAnalysis() {
        if (userDocId && userData && userData.openAiResults) {
            const normalizedResults = normalizeOpenAiResults(userData.openAiResults);
            await processAllPersonalityAnalyses(userDocId, normalizedResults);
        }
        }
        runAnalysis();
    }, [userDocId, userData]);

    useEffect(() => {
      async function generateInitialMessages() {
        if (!userDocId || !userData || !userData.openAiResults) return;
        if (conversation.length > 0) return;
        const participants = userData.openAiResults.filter(item => item.Person !== "Me");
        setLoadingResponses(true);
        const conflictDescription = userData?.conflictDescription || "No conflict description provided.";
        for (let participantObj of participants) {
          const participant = participantObj.Person;
          try {
            const personality = userData?.personalityAnalysis ? userData.personalityAnalysis[participant] : null;
            const systemMessage = `You are ${participant}. Your personality traits are: ${personality ? personality.personalityTraits : "Not available"}. Your communication style is: ${personality ? personality.communicationStyle : "Not available"}. You are in a \"${conflictDescription}\" situation. Respond only with the style of text message.`;
            const initialPrompt = systemMessage;
    
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: systemMessage },
                  { role: 'user', content: initialPrompt }
                ]
              })
            });
            const data = await response.json();
            let aiResponseText = data.choices[0].message.content.trim();
            const aiMessage = {
              sender: participant,
              text: aiResponseText,
              timestamp: new Date().toISOString()
            };
            setConversation(prev => [...prev, aiMessage]);
            await saveMessage(aiMessage);
          } catch (error) {
            console.error(`Error generating initial AI response for ${participant}:`, error);
          }
        }
        setLoadingResponses(false);
      }
      generateInitialMessages();
    }, [userDocId, userData, conversation]);

    async function getAIResponseForParticipant(participant) {
        const personality = userData?.personalityAnalysis ? userData.personalityAnalysis[participant] : null;
        const conflictDescription = userData?.conflictDescription || "No conflict description provided.";
        const conversationText = conversation.map(msg => `${msg.sender}: ${msg.text}`).join("\n");
        const prompt = `You are act as ${participant}. \nYour personality traits are: ${personality ? personality.personalityTraits : "Not available"}. \nYour communication style is: ${personality ? personality.communicationStyle : "Not available"}.\nThe conflict to resolve is: ${conflictDescription}.\nThe conversation so far is: ${conversationText}.\nPlease provide your next message as ${participant} in a natural, conversational tone. Respond only with the message text.`;
    
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [
            { role: 'system', content: `You are act as ${participant} with ${personality.personalityTraits} and ${personality.communicationStyle}.` },
            { role: 'user', content: prompt }
            ]
        })
        });
        const data = await response.json();
        const aiMessage = data.choices[0].message.content.trim();
        return aiMessage;
    }

    const handleSendMessage = async () => {
        if (inputValue.trim() === "") return;
        const userMessage = {
        sender: "Me",
        text: inputValue,
        timestamp: new Date().toISOString()
        };
        setConversation(prev => [...prev, userMessage]);
        await saveMessage(userMessage);
        setInputValue("");
    
        if (userData && userData.openAiResults) {
        const participants = userData.openAiResults.filter(item => item.Person !== "Me");
        setLoadingResponses(true);
        for (let participantObj of participants) {
            const participant = participantObj.Person;
            try {
            const aiResponseText = await getAIResponseForParticipant(participant);
            const aiMessage = {
                sender: participant,
                text: aiResponseText,
                timestamp: new Date().toISOString()
            };
            setConversation(prev => [...prev, aiMessage]);
            await saveMessage(aiMessage);
            } catch (error) {
            console.error(`Error generating AI response for ${participant}:`, error);
            }
        }
        setLoadingResponses(false);
        }
    };

    // Watch inputValue for 'you' at the start and call OpenAI for a tip
    useEffect(() => {
      async function checkInputAndSuggest() {
        if (/^you\b/i.test(inputValue.trim())) {
          // Highlight 'you' at the start
          const match = inputValue.match(/^(you)(.*)/i);
          if (match) {
            setHighlightedInput(<><span style={{ background: '#ffe066', fontWeight: 'bold' }}>{match[1]}</span>{match[2]}</>);
          } else {
            setHighlightedInput(inputValue);
          }
          // Call OpenAI for a tip
          try {
            const prompt = `A user is about to send a message starting with 'you': "${inputValue}". Suggest a short, friendly tip to encourage them to rephrase it to start with 'I' instead. Example: Try to start the sentence with 'I'.`;
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'user', content: prompt }
                ]
              })
            });
            const data = await response.json();
            const suggestion = data.choices[0].message.content.trim();
            setTip(suggestion);
          } catch (e) {
            setTip("Try to start the sentence with 'I'.");
          }
        } else {
          setTip("");
          setHighlightedInput(inputValue);
        }
      }
      checkInputAndSuggest();
    }, [inputValue]);

    // Layout
    return (
      <Container fluid className="py-4" style={{ minHeight: '100vh' }}>
        <Row>
          {/* Partner Sidebar */}
          <Col md={3} className="d-flex flex-column align-items-center border-end">
            <Card className="w-100 mb-3">
              <Card.Body>
                <Card.Title><span role="img" aria-label="partner">👤</span> Partner</Card.Title>
                {/*<div style={{ height: 120, background: '#f5f5f5', borderRadius: 8, marginBottom: 16 }} /> 
                */}
                <div className="mb-2">voice</div>
                <ProgressBar now={60} className="mb-2" />
                <ProgressBar now={30} className="mb-2" />
                <div className="mt-3">Some visualization...</div>
              </Card.Body>
            </Card>
          </Col>

          {/* Chat Center */}
          <Col md={6} className="d-flex flex-column align-items-center" style={{ borderTop: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6' }}>
            <div className="flex-grow-1 w-100 mb-3" style={{ minHeight: 400, maxHeight: 700, overflowY: 'auto' }}>
              <ChatFeed
                messages={conversation.map(msg => {
                  const uniqueId = getParticipantId(msg.sender);
                  return new Message({
                    id: uniqueId,
                    senderName: msg.sender,
                    message: msg.text
                  });
                })}
                isTyping={loadingResponses}
                hasInputField={false}
                showSenderName
              />
            </div>
            {/* Tips */}
            {tip && (
              <div className="w-100 mb-2" style={{ background: '#fff9db', borderRadius: 6, padding: '4px 12px', fontSize: 14, color: '#b59f3b' }}>
                {tip}
              </div>
            )}
            <div className="d-flex w-100 align-items-center">
              {/* Highlighted input if needed */}
              {/^you\b/i.test(inputValue.trim()) ? (
                <div style={{ flex: 1, position: 'relative' }}>
                  <Form.Control
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Type your message..."
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    style={{ fontSize: '1rem', borderRadius: '.25rem', background: 'transparent', color: 'transparent', caretColor: '#212529', position: 'absolute', top: 0, left: 0, width: '100%', zIndex: 2 }}
                  />
                  <div style={{ pointerEvents: 'none', color: '#212529', fontSize: '1rem', borderRadius: '.25rem', padding: '0.375rem 0.75rem', minHeight: '38px', background: 'none', position: 'relative', zIndex: 1 }}>
                    {highlightedInput}
                  </div>
                </div>
              ) : (
                <Form.Control
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Type your message..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  style={{ fontSize: '1rem', borderRadius: '.25rem' }}
                />
              )}
              <Button variant="primary" onClick={handleSendMessage} className="ms-2" style={{ borderRadius: '.25rem', padding: '0.375rem 0.75rem' }}>
                Send
              </Button>
            </div>
          </Col>

          {/* Me Sidebar */}
          <Col md={3} className="d-flex flex-column align-items-center border-start">
            <Card className="w-100 mb-3">
              <Card.Body>
                <Card.Title><span role="img" aria-label="me">👤</span> Me</Card.Title>
                <div style={{ height: 120, background: '#f5f5f5', borderRadius: 8, marginBottom: 16 }} />
                <div className="mb-2">voice</div>
                <ProgressBar now={80} className="mb-2" />
                <ProgressBar now={50} className="mb-2" />
                <div className="mt-3">Some visualization</div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
}

export default Chat;