import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Form, Button, Container, Row, Col, ProgressBar, Card, Alert, Accordion, Modal, Spinner } from 'react-bootstrap';
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import app from "./firebase";
import { ChatFeed, Message } from 'react-chat-ui';
import { normalizeOpenAiResults, processAllPersonalityAnalyses } from './Analysis';

const db = getFirestore(app);

function Chat() {
    const [searchParams] = useSearchParams(); 
    const navigate = useNavigate();
    const userDocId = searchParams.get("userDocId");
    const [userData, setUserData] = useState(null);
    const [conversation, setConversation] = useState([]);
    const [inputValue, setInputValue] = useState("");
    const [loadingResponses, setLoadingResponses] = useState(false);
    const senderIdMap = React.useRef({});
    const nextId = React.useRef(1);
    const [tip, setTip] = useState("");
    const [highlightedInput, setHighlightedInput] = useState("");
    const [gottmanAnalysis, setGottmanAnalysis] = useState(null);
    const [recommendations, setRecommendations] = useState(null);
    const [openAiResults, setOpenAiResults] = useState([]);
    const [partnerName, setPartnerName] = useState('Partner');
    const [partnerGender, setPartnerGender] = useState('they');
    const [practiceCompleted, setPracticeCompleted] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [feedbackContent, setFeedbackContent] = useState('');
    const [generatingConversation, setGeneratingConversation] = useState(false);
    
    // 음주 관련 시나리오
    const [conflictScenario, setConflictScenario] = useState('');
    // 새로운 시나리오
    const [scenario, setScenario] = useState('');
    
    // 대화 생성 트리거 상태
    const [resetTrigger, setResetTrigger] = useState(0);

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
            
            if (data.partnerGender) {
              setPartnerGender(data.partnerGender);
            }
            
            // First, get the partner name
            let actualPartnerName = "Partner"; // Default name
            if (data.openAiResults && Array.isArray(data.openAiResults)) {
              const partnerEntry = data.openAiResults.find(entry => entry.Person !== "Me");
              if (partnerEntry) {
                actualPartnerName = partnerEntry.Person;
                setPartnerName(partnerEntry.Person);
              }
            }
            
            // New scenario
            const pronoun = data.partnerGender || 'they';
            const newScenario = `I have always enjoyed playing video games, but lately, especially when I'm feeling stressed or upset, I tend to stay up all night gaming alone. ${actualPartnerName} is not against me playing games, ${actualPartnerName} knows it's something I enjoy, but ${actualPartnerName} worries about my sleep and health. ${actualPartnerName} also wishes I could talk to ${actualPartnerName} about what's bothering me instead of shutting ${actualPartnerName} out and turning to games every time.`;
            setConflictScenario(newScenario);
            setScenario(newScenario);
            
            if (data.gottmanAnalysis) {
              setGottmanAnalysis(data.gottmanAnalysis);
            }
            
            if (data.communicationRecommendations) {
              setRecommendations(data.communicationRecommendations);
            }
            
            if (data.openAiResults && Array.isArray(data.openAiResults)) {
              setOpenAiResults(data.openAiResults);
              
              // 기존 대화 내용은 초기화 (새 시나리오 사용)
              setConversation([]);
            }
            
            // 기존 채팅 히스토리가 있으면 로드
            if (data.chatHistory && Array.isArray(data.chatHistory) && data.chatHistory.length > 0) {
              setConversation(data.chatHistory);
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

    // Decide who should start the conversation
    async function determineConversationStarter() {
      if (!userData || !gottmanAnalysis || !gottmanAnalysis.people) return "Me";
      try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
            model: 'gpt-4o',
              messages: [
              { 
                role: 'system', 
                content: `You are an expert relationship therapist analyzing who should initiate a conversation about a conflict.` 
              },
              { 
                role: 'user', 
                content: `Based on the following data about two people in a relationship, determine who should start the conversation about their conflict.
                
                Person 1 (Me):
                - Conflict type: ${gottmanAnalysis.people['Me']?.primaryType || 'Unknown'}
                - Communication patterns: ${gottmanAnalysis.people['Me']?.negativePatterns || 'Unknown'}
                
                Person 2 (${partnerName}):
                - Conflict type: ${gottmanAnalysis.people[partnerName]?.primaryType || 'Unknown'}
                - Communication patterns: ${gottmanAnalysis.people[partnerName]?.negativePatterns || 'Unknown'}
                
                The conflict scenario is: "${scenario}"
                
                Choose either "Me" or "${partnerName}" and provide a very brief reasoning (1-2 sentences). Format your response exactly like this:
                STARTER: [name]
                REASON: [1-2 sentence explanation]`
              }
            ],
            temperature: 0.7
            })
          });
        
          const data = await response.json();
        const aiResponseText = data.choices[0].message.content.trim();
        
        // Response parsing
        const starterMatch = aiResponseText.match(/STARTER:\s*(.*)/i);
        const reasonMatch = aiResponseText.match(/REASON:\s*(.*)/i);
        
        const starter = starterMatch ? starterMatch[1].trim() : "Me";
        const reason = reasonMatch ? reasonMatch[1].trim() : "";
        
        console.log(`Conversation starter: ${starter}, Reason: ${reason}`);
        return starter === partnerName ? partnerName : "Me";
      } catch (error) {
        console.error("Error determining conversation starter:", error);
        return "Me"; // Default to Me if there's an error
      }
    }

    // Reset chat function
    const handleResetChat = async () => {
      if (window.confirm("Are you sure you want to reset this conversation? All messages will be cleared.")) {
        setLoadingResponses(true);
        
        try {
          // Clear conversation from state
          setConversation([]);
          
          // Clear conversation from Firebase if needed
          if (userDocId) {
            await updateDoc(doc(db, "users", userDocId), {
              chatHistory: [],
              lastReset: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
          
          // resetTrigger 증가시켜 새로운 대화 생성 트리거
          setResetTrigger(prev => prev + 1);
          
        } catch (error) {
          console.error("Error resetting chat:", error);
          setLoadingResponses(false);
        }
      }
    };

    // Handle practice completion
    const handlePracticeComplete = async () => {
      if (window.confirm("Are you sure you want to end this conversation practice?")) {
        setPracticeCompleted(true);
        setLoadingResponses(true);
        
        try {
          // Save practice completion status to Firebase
          if (userDocId) {
            await updateDoc(doc(db, "users", userDocId), {
              practiceCompleted: true,
              practiceEndTime: serverTimestamp(),
              messageCount: conversation.length,
              updatedAt: serverTimestamp()
            });
            
            // Get conversation feedback from OpenAI
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
                model: 'gpt-4o',
            messages: [
                  { 
                    role: 'system', 
                    content: `You are a relationship therapist analyzing a practice conversation between partners.` 
                  },
                  { 
                    role: 'user', 
                    content: `Analyze the following conversation about this scenario:
                    "${conflictScenario}"
                    
                    Conversation:
                    ${conversation.map(msg => `${msg.sender}: ${msg.text}`).join("\n")}
                    
                    Provide feedback on this practice conversation. Include:
                    1. A positive comment on what went well (2-3 sentences)
                    2. One suggestion for improvement (1-2 sentences)
                    3. A brief note of encouragement`
                  }
                ],
                temperature: 0.7
              })
            });
            
            const data = await response.json();
            const feedback = data.choices[0].message.content;
            
            // Show feedback in modal instead of alert
            setFeedbackContent(feedback);
            setShowFeedbackModal(true);
          } else {
            setFeedbackContent("Practice session completed! Now you're ready for the real conversation. Good luck!");
            setShowFeedbackModal(true);
          }
        } catch (error) {
          console.error("Error completing practice:", error);
          setFeedbackContent("Practice session completed! Now you're ready for the real conversation. Good luck!");
          setShowFeedbackModal(true);
        }
        
        setLoadingResponses(false);
        }
    };

    // Handle when user moves to real conversation
    const handleMoveToRealConversation = () => {
      setShowFeedbackModal(false);
      
      // Save the scenario to Firebase for Real component to use
      if (userDocId) {
        updateDoc(doc(db, "users", userDocId), {
          conflictScenario: conflictScenario,
          practiceCompletedAt: serverTimestamp(),
          movingToRealConversation: true,
          updatedAt: serverTimestamp()
        }).catch(error => {
          console.error("Error saving scenario before navigation:", error);
        });
      }
      
      // Navigate to the Real component with the userDocId
      navigate(`/real?userDocId=${userDocId}`);
    };

    // 자동 대화 생성 - 단일 useEffect로 통합
    useEffect(() => {
      async function generateFullConversation() {
        // 필수 데이터가 모두 있는지 확인
        if (!userDocId || !userData || !partnerName || !scenario || !gottmanAnalysis) {
          console.log("Required data missing, cannot generate conversation yet");
          return;
        }
        
        // 대화가 이미 있으면 스킵 (resetTrigger가 변경됐을 때는 항상 실행)
        if (conversation.length > 0) {
          console.log("Conversation already exists, skipping generation");
          return;
        }
        
        console.log("Starting conversation generation...");
        setLoadingResponses(true);
        
        try {
          // 이전 채팅 기록 확인 및 초기화
          const userDocRef = doc(db, "users", userDocId);
          const docSnap = await getDoc(userDocRef);
          let previousChat = [];
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.chatHistory && Array.isArray(data.chatHistory)) {
              previousChat = data.chatHistory;
              
              // 채팅 기록이 이미 있으면 사용하고 종료 (reset 후에는 무시)
              if (previousChat.length > 0 && resetTrigger === 0) {
                console.log("Using existing chat history:", previousChat.length);
                setConversation(previousChat);
                setLoadingResponses(false);
                return;
              }
            }
          }
          
          // 대화 시작자 결정
          const conversationStarter = await determineConversationStarter();
          console.log(`Conversation starter determined: ${conversationStarter}`);
          
          // 전체 대화 생성 요청
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { 
                  role: 'system', 
                  content: `Create a natural conversation between "Me" and "${partnerName}" about this conflict scenario: "${scenario}".
                  Person 1 (Me):
                  - Conflict type: ${gottmanAnalysis.people['Me']?.primaryType || 'Unknown'}
                  - Communication patterns: ${gottmanAnalysis.people['Me']?.negativePatterns || 'Unknown'}
                  
                  Person 2 (${partnerName}):
                  - Conflict type: ${gottmanAnalysis.people[partnerName]?.primaryType || 'Unknown'}
                  - Communication patterns: ${gottmanAnalysis.people[partnerName]?.negativePatterns || 'Unknown'}

                  IMPORTANT: The first speaker MUST be "${conversationStarter}".
                  
                  Generate exactly 15 messages total, alternating between speakers. The conversation should:
                  1. Be natural and conversational based on their conflict types and communication patterns
                  2. Have concise messages (max 1-3 sentences each)
                  3. Show realistic emotions and reactions
                  4. Include a lot of communication problems based on their conflict types and communication patterns
                  5. End with unsolved conflicts, and no attempt to resolve them
                  
                  Format your response EXACTLY as follows:
                  SENDER: ${conversationStarter}
                  MESSAGE: [First message]
                  ===
                  SENDER: ${conversationStarter === "Me" ? partnerName : "Me"}
                  MESSAGE: [Response]
                  ===
                  
                  Continue alternating with "===" separating each message, for EXACTLY 15 total messages.`
                }
              ],
              temperature: 0.7,
              max_tokens: 2000
            })
          });
          
          if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
          }
          
          const data = await response.json();
          console.log("API response received");
          const messagesText = data.choices[0].message.content.trim();
          
          // 메시지 파싱
          const messageBlocks = messagesText.split('===').map(block => block.trim()).filter(block => block);
          console.log(`Parsed ${messageBlocks.length} message blocks`);
          
          // 기존 대화 기록 초기화 (Firebase에 저장된 값 초기화)
          if (userDocId) {
            await updateDoc(userDocRef, {
              chatHistory: [],
              updatedAt: serverTimestamp()
            });
            console.log("Cleared existing chat history in Firebase");
          }
          
          // 각 메시지 추가 및 저장
          for (const block of messageBlocks) {
            const senderMatch = block.match(/SENDER:\s*(.*?)(?:\n|$)/i);
            const messageMatch = block.match(/MESSAGE:\s*([\s\S]*?)$/i);
            
            if (senderMatch && messageMatch) {
              const sender = senderMatch[1].trim();
              const text = messageMatch[1].trim();
              
              const messageObj = {
                sender: sender,
                text: text,
                timestamp: new Date().toISOString()
            };
              
              await saveMessage(messageObj);
              setConversation(prev => [...prev, messageObj]);
              
              // 시각적 딜레이를 위한 일시 중지 (300ms)
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
          
          console.log(`Successfully added ${messageBlocks.length} messages to conversation`);
        } catch (error) {
          console.error("Error generating conversation:", error);
        } finally {
        setLoadingResponses(false);
        }
      }
      
      generateFullConversation();
    }, [userDocId, userData, partnerName, scenario, gottmanAnalysis, resetTrigger, conversation.length]);

    // Layout
  return (
      <Container fluid className="py-4 mb-5" style={{ minHeight: '100vh' }}>
        <Row className="flex-grow-1" style={{ height: 'calc(100vh - 150px)' }}>
          {/* Partner Sidebar */}
          <Col md={3} className="d-flex flex-column border-end px-3" style={{ overflowY: 'auto', height: '100%' }}>
            <Card className="w-100 mb-3">
              <Card.Body>
                <Card.Title><span role="img" aria-label="partner">👤</span> {partnerName}</Card.Title>
                {gottmanAnalysis && gottmanAnalysis.people && gottmanAnalysis.people[partnerName] && (
                  <div className="mt-2 mb-3">
                    <small className="text-muted">{partnerName}'s conflict type:</small>
                    <h6 className="mb-0">{gottmanAnalysis.people[partnerName].primaryType}</h6>
                  </div>
                )}
                {/* 갓트만 분석 결과 표시 */}
                {/*
                {gottmanAnalysis && gottmanAnalysis.people && gottmanAnalysis.people[partnerName] && (
                  <Alert variant="light" className="p-2 mb-3">
                    <small className="d-block mb-1 text-muted">Their pattern:</small>
                    <p className="small mb-0">{gottmanAnalysis.people[partnerName]?.negativePatterns || "Not available"}</p>
                  </Alert>
                )}
                */}
              </Card.Body>
            </Card>
            {/* Me Sidebar */}
            <Card className="w-100 mb-3">
              <Card.Body>
                <Card.Title><span role="img" aria-label="me">👤</span> Me</Card.Title>
                {gottmanAnalysis && gottmanAnalysis.people && gottmanAnalysis.people['Me'] && (
                  <div className="mt-2 mb-3">
                    <small className="text-muted">Your conflict type:</small>
                    <h6 className="mb-0">{gottmanAnalysis.people['Me'].primaryType}</h6>
                  </div>
                )}
                {/* 갓트만 분석 결과 표시 */}
                {/*
                {gottmanAnalysis && gottmanAnalysis.people && (
                  <Alert variant="light" className="p-2 mb-3">
                    <small className="d-block mb-1 text-muted">Your pattern:</small>
                    <p className="small mb-0">{gottmanAnalysis.people['Me']?.negativePatterns || "Not available"}</p>
                  </Alert>
                )}
                */}
              </Card.Body>
            </Card>
            {/* 추천 정보 표시 */}
            {recommendations && (
              <Card className="w-100 mb-3">
                <Card.Header className="bg-white">
                  <h6 className="mb-0">Communication Tips</h6>
                </Card.Header>
                <Card.Body className="p-0">
                  <Accordion defaultActiveKey="0" flush>
                    <Accordion.Item eventKey="0">
                      <Accordion.Header>
                        <small className="text-primary">During Conflict</small>
                      </Accordion.Header>
                      <Accordion.Body className="py-2 px-3">
                        <ul className="mb-0 ps-3 small">
                          {(recommendations.whenItHappens || []).map((tip, idx) => (
                            <li key={idx} className="mb-2">
                              {tip && tip.includes(":") ? (
                                <>
                                  <strong className="text-primary">{tip.split(":")[0].trim()}</strong>: {tip.split(":")[1].trim()}
                                </>
                              ) : tip}
                            </li>
                          ))}
                        </ul>
                      </Accordion.Body>
                    </Accordion.Item>
                    <Accordion.Item eventKey="1">
                      <Accordion.Header>
                        <small className="text-primary">After Conflict</small>
                      </Accordion.Header>
                      <Accordion.Body className="py-2 px-3">
                        <ul className="mb-0 ps-3 small">
                          {(recommendations.after || []).map((tip, idx) => (
                            <li key={idx} className="mb-2">
                              {tip && tip.includes(":") ? (
                                <>
                                  <strong className="text-primary">{tip.split(":")[0].trim()}</strong>: {tip.split(":")[1].trim()}
                                </>
                              ) : tip}
                            </li>
                          ))}
                        </ul>
                      </Accordion.Body>
                    </Accordion.Item>
                    <Accordion.Item eventKey="2">
                      <Accordion.Header>
                        <small className="text-primary">Long-term Strategies</small>
                      </Accordion.Header>
                      <Accordion.Body className="py-2 px-3">
                        <ul className="mb-0 ps-3 small">
                          {(recommendations.longTerm || []).map((tip, idx) => (
                            <li key={idx} className="mb-2">
                              {tip && tip.includes(":") ? (
                                <>
                                  <strong className="text-primary">{tip.split(":")[0].trim()}</strong>: {tip.split(":")[1].trim()}
                                </>
                              ) : tip}
                            </li>
                          ))}
                        </ul>
                      </Accordion.Body>
                    </Accordion.Item>
                  </Accordion>
                </Card.Body>
              </Card>
            )}
          </Col>

          {/* Chat Center */}
          <Col md={9} className="d-flex flex-column border-end px-3 py-3" style={{ borderTop: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6', overflowY: 'auto', height: '100%' }}>
            {/* 대화 목적 표시 */}
            {/*
            {userData?.conflictDescription && (
              <Alert variant="info" className="w-100 mb-3 py-2">
                <small className="fw-bold">Conversation topic:</small> {userData.conflictDescription}
              </Alert>
            )}
            */}
            {/* 대화 관련 팁 표시 */}
            {recommendations && recommendations.whenItHappens && recommendations.whenItHappens.length > 0 && (
              <Card className="w-100 mb-2 mt-2" style={{ borderRadius: '0.75rem', border: 'none' }}>
                <Card.Body className="py-1">
                  <div className="scenario-container mx-auto py-1 px-3 my-0 border-start border-3 border-primary rounded-end bg-light bg-opacity-50" style={{ maxWidth: '90%', textAlign: 'right', fontSize: '0.9rem' }}>
                    <div>
                    <span className="text-primary fw-bold me-1">New Scenario:</span>
                      
                      <p className="mb-0 mt-0 px-2 text-right">{conflictScenario}</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            )}
            
            <div className="flex-grow-1 w-100 mb-3" style={{ minHeight: 400, maxHeight: 700, overflowY: 'auto' }}>
            {loadingResponses && conversation.length === 0 && (
              <div className="d-flex flex-column align-items-center justify-content-center h-100">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3">Generating conversation...</p>
              </div>
            )}
            
        <ChatFeed
          messages={conversation.map(msg => {
            const uniqueId = getParticipantId(msg.sender);
            return new Message({
              id: uniqueId,
              senderName: msg.sender,
              message: msg.text
            });
          })}
              isTyping={loadingResponses && conversation.length > 0}
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

            {/* Bottom buttons - moved inside the message area with right alignment */}
            <div className="d-flex justify-content-end mt-2 mb-2">
              <Button 
                variant="outline-secondary" 
                style={{ borderRadius: '.25rem', padding: '0.375rem 0.75rem', marginRight: '0.5rem' }}
                onClick={handleResetChat}
                disabled={loadingResponses}
              >
                Reset Chat
              </Button>
              
              <Button 
                variant="outline-success" 
                style={{ borderRadius: '.25rem', padding: '0.375rem 1.5rem' }}
                onClick={handlePracticeComplete}
                disabled={practiceCompleted || loadingResponses}
              >
                {practiceCompleted ? "Practice Completed" : loadingResponses ? "Processing..." : "Done with Practice"}
        </Button>
      </div>
          </Col>
        </Row>
        
        {/* Feedback Modal */}
        <Modal 
          show={showFeedbackModal} 
          onHide={() => setShowFeedbackModal(false)}
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Practice Completed</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="mb-4">
              <h5 className="mb-2">Feedback:</h5>
              {feedbackContent.split('\n').map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
            
            <div className="text-center">
              <p className="text-success">Now you're ready for the real conversation!</p>
    </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowFeedbackModal(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={handleMoveToRealConversation}>
              Move on to the real conversation
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
  );
}

export default Chat;