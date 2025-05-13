import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Form, Button, Container, Row, Col, ProgressBar, Card, Alert, Accordion, Modal, Spinner, Dropdown, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import app from "./firebase";
import { ChatFeed, Message } from 'react-chat-ui';
import { normalizeOpenAiResults, processAllPersonalityAnalyses } from './Analysis';
import { FaInfoCircle, FaLightbulb, FaSyncAlt, FaCheck, FaTimes } from 'react-icons/fa';
import './Chat.css'; // Import custom CSS file

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
    
    // Annotation 관련 상태
    const [messageAnnotations, setMessageAnnotations] = useState({});
    const [annotationResults, setAnnotationResults] = useState({});
    const [evaluatingAnnotation, setEvaluatingAnnotation] = useState(false);
    const [annotationAttempts, setAnnotationAttempts] = useState({});
    
    // Annotation 옵션과 설명
    const annotationOptions = [
      "Criticism",
      "Contempt",
      "Defensiveness",
      "Guilt-tripping",
      "Gaslighting",
      "Invalidation",
      "Avoidant",
      "Deflecting",
      "Vague",
      "Interrupting",
      "None"
    ];
    
    // Annotation 설명
    const annotationDescriptions = {
      "Criticism": "Attacking someone's character instead of their behavior",
      "Contempt": "Disrespect, mockery, sarcasm, name-calling",
      "Defensiveness": "Seeing self as victim, warding off perceived attack",
      "Guilt-tripping": "Making someone feel guilty to control them",
      "Gaslighting": "Making someone doubt their reality or perceptions",
      "Invalidation": "Dismissing or rejecting someone's feelings",
      "Avoidant": "Withdrawing from conflict, stonewalling",
      "Deflecting": "Changing the topic to avoid addressing issues",
      "Vague": "Being unclear, not expressing needs directly",
      "Interrupting": "Cutting off or talking over someone",
      "None": "No negative communication pattern present"
    };
    
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
          // 전체 annotation 통계 계산
          const totalMessages = conversation.length;
          const annotatedMessages = Object.keys(messageAnnotations).length;
          const correctAnnotations = Object.values(annotationResults).filter(result => result.isCorrect).length;
          
          // 평균 시도 횟수 계산 (맞춘 것들에 대해서만)
          let totalAttempts = 0;
          let correctWithAttempts = 0;
          
          Object.keys(annotationResults).forEach(messageIndex => {
            if (annotationResults[messageIndex].isCorrect) {
              totalAttempts += annotationAttempts[messageIndex] || 0;
              correctWithAttempts++;
            }
          });
          
          const averageAttemptsUntilCorrect = correctWithAttempts > 0 
            ? totalAttempts / correctWithAttempts 
            : 0;
          
          // 사용자(Me)의 정확하게 식별된 메시지 패턴 수집
          const myCorrectPatterns = [];
          conversation.forEach((msg, index) => {
            if (
              msg.sender === "Me" && 
              messageAnnotations[index] && 
              annotationResults[index]?.isCorrect
            ) {
              myCorrectPatterns.push({
                text: msg.text,
                pattern: messageAnnotations[index]
              });
            }
          });
          
          // Save practice completion status to Firebase
          if (userDocId) {
            await updateDoc(doc(db, "users", userDocId), {
              practiceCompleted: true,
              practiceEndTime: serverTimestamp(),
              messageCount: conversation.length,
              annotationSummary: {
                totalMessages,
                annotatedMessages,
                correctAnnotations,
                averageAttemptsUntilCorrect,
                completedAt: serverTimestamp()
              },
              myCorrectPatterns: myCorrectPatterns,
              updatedAt: serverTimestamp()
            });
            
            // Get conversation feedback from OpenAI with personalized advice
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
                    
                    The user (Me) correctly identified these communication patterns in their own messages:
                    ${myCorrectPatterns.map(p => `- "${p.text}" - Pattern: ${p.pattern}`).join("\n")}
                    
                    Provide feedback that includes:
                    1. A positive comment on what went well (1-2 sentences)
                    2. One suggestion for improvement (1-2 sentences)
                    3. Personalized communication advice based on the patterns the user correctly identified in their own messages (2-3 sentences)
                    4. A brief note of encouragement`
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

    // Annotation 관련 함수들
    const handleAnnotationSelect = async (messageIndex, annotation) => {
      // 시도 횟수 증가
      const currentAttempts = annotationAttempts[messageIndex] || 0;
      const updatedAttempts = {
        ...annotationAttempts,
        [messageIndex]: currentAttempts + 1
      };
      setAnnotationAttempts(updatedAttempts);
      
      // 선택한 annotation 저장
      const updatedAnnotations = {
        ...messageAnnotations,
        [messageIndex]: annotation
      };
      setMessageAnnotations(updatedAnnotations);
      
      // OpenAI로 annotation 평가 요청
      await evaluateAnnotation(messageIndex, annotation, currentAttempts + 1);
    };
    
    const evaluateAnnotation = async (messageIndex, selectedAnnotation, attempts) => {
      const message = conversation[messageIndex];
      if (!message) return;
      
      setEvaluatingAnnotation(true);
      
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
                content: `You are an expert in communication patterns and conflict analysis. You'll analyze if the user's annotation of a message in a conversation is appropriate.
                
                Here are descriptions of different communication patterns:
                - Criticism: Attacking someone's character, not their behavior
                - Contempt: Disrespect, mockery, sarcasm, name-calling
                - Defensiveness: Seeing self as victim, warding off perceived attack
                - Guilt-tripping: Making someone feel guilty to control them
                - Gaslighting: Making someone doubt their reality/perceptions
                - Invalidation: Dismissing or rejecting someone's feelings
                - Avoidant: Withdrawing from conflict, stonewalling
                - Deflecting: Changing topic to avoid addressing issues
                - Vague: Being unclear, not expressing needs directly
                - Interrupting: Cutting off or talking over someone
                - None: No negative pattern present
                
                You'll analyze if the selected label matches the message's actual communication pattern.` 
              },
              { 
                role: 'user', 
                content: `Here's a message from a conversation:
                
                Speaker: ${message.sender}
                Message: "${message.text}"
                
                The user selected this annotation: "${selectedAnnotation}"
                
                Please determine if this annotation is correct for this message.
                
                Respond with only one of these options:
                CORRECT: If it's the best or a reasonable annotation for this message.
                INCORRECT: If it's clearly not appropriate for this message.
                
                Then add a one-sentence explanation.` 
              }
            ],
            temperature: 0.3
        })
        });
        
        const data = await response.json();
        const resultText = data.choices[0].message.content.trim();
        
        // Parse response
        const isCorrect = resultText.startsWith('CORRECT');
        const explanation = resultText.split('\n')[1] || '';
        
        // Save result
        setAnnotationResults({
          ...annotationResults,
          [messageIndex]: {
            isCorrect,
            explanation
          }
        });
        
        // Save to Firebase if needed
        if (userDocId) {
          try {
            await updateDoc(doc(db, "users", userDocId), {
              [`messageAnnotations.${messageIndex}`]: {
                messageText: message.text,
                sender: message.sender,
                selectedAnnotation,
                isCorrect,
                explanation,
                attempts: attempts,
                timestamp: serverTimestamp()
              },
              updatedAt: serverTimestamp()
            });
            
            // 올바른 annotation을 맞췄을 때 총 시도 횟수 저장
            if (isCorrect) {
              await updateDoc(doc(db, "users", userDocId), {
                [`annotationStats.${messageIndex}`]: {
                  attemptsUntilCorrect: attempts,
                  timestamp: serverTimestamp()
                },
                updatedAt: serverTimestamp()
              });
            }
          } catch (error) {
            console.error("Error saving annotation to Firebase:", error);
          }
        }
      } catch (error) {
        console.error("Error evaluating annotation:", error);
      } finally {
        setEvaluatingAnnotation(false);
      }
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
        <div className="text-center mb-1">
          <h4>Let's Practice!</h4>
          <div className="scenario-container mx-auto py-2 px-3 my-1 border-start border-3 border-primary rounded-end bg-light bg-opacity-50" style={{ maxWidth: '90%', textAlign: 'left', fontSize: '0.9rem' }}>
            <span className="text-primary fw-bold me-1">New Scenario:</span>
            <span style={{ lineHeight: '1.4' }}>{conflictScenario}</span>
          </div>
          <div className="mx-auto py-3 px-4 mt-2 mb-3 rounded-3 shadow-sm" style={{ maxWidth: '90%', textAlign: 'left', fontSize: '0.9rem', lineHeight: '1.5', backgroundColor: '#fff3cd', color: 'black' }}>
            <div className="d-flex align-items-start">
              <FaInfoCircle className="me-2 mt-1" />
              <div>
                <strong>Instructions:</strong> This conversation is automatically generated based on you and your partner's conflict types and communication patterns. Please select the communication pattern for each message from the dropdown menu. The system will evaluate your annotation and show if it's <span style={{ color: '#28a745' }}>correct</span> or <span style={{ color: '#dc3545' }}>incorrect</span> with visual indicators.
              </div>
            </div>
          </div>
        </div>
        <Row className="flex-grow-1" style={{ height: 'calc(100vh - 150px)' }}>
          {/* Sidebar Row with Partner and Me cards side by side */}
          <Col md={3} className="d-flex flex-column border-end px-3" style={{ overflowY: 'auto', height: '100%' }}>
            <Row className="mb-3">
              {/* Partner Card */}
              <Col md={6} className="pe-1">
                <Card className="w-100 h-100">
                  <Card.Body>
                    <Card.Title><span role="img" aria-label="partner">👤</span> {partnerName}</Card.Title>
                    {gottmanAnalysis && gottmanAnalysis.people && gottmanAnalysis.people[partnerName] && (
                      <div className="mt-2 mb-1">
                        <small className="text-muted me-2">{partnerName}'s conflict type:</small>
                        <h6 className="mb-0">{gottmanAnalysis.people[partnerName].primaryType}</h6>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
              
              {/* Me Card */}
              <Col md={6} className="ps-1">
                <Card className="w-100 h-100">
                  <Card.Body>
                    <Card.Title><span role="img" aria-label="me">👤</span> Me</Card.Title>
                    {gottmanAnalysis && gottmanAnalysis.people && gottmanAnalysis.people['Me'] && (
                      <div className="mt-2 mb-1">
                        <small className="text-muted me-2">Your conflict type:</small>
                        <h6 className="mb-0">{gottmanAnalysis.people['Me'].primaryType}</h6>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>
            
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
            
            <div className="flex-grow-1 w-100 mb-3" style={{ minHeight: 400, maxHeight: 700, overflowY: 'auto' }}>
            {loadingResponses && conversation.length === 0 && (
              <div className="d-flex flex-column align-items-center justify-content-center h-100">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3">Generating conversation...</p>
              </div>
            )}
            
            {evaluatingAnnotation && (
              <div className="position-absolute" style={{ 
                top: '50%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)',
                zIndex: 999,
                backgroundColor: 'rgba(255,255,255,0.8)',
                padding: '20px',
                borderRadius: '10px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                textAlign: 'center'
              }}>
                <Spinner animation="border" variant="primary" />
                <p className="mt-2 mb-0">Evaluating annotation...</p>
              </div>
            )}
            
            {/* Custom Chat Feed with Annotations */}
            <div className="custom-chat-container">
              {conversation.map((msg, index) => {
                const isUserMessage = msg.sender === "Me";
                const selectedAnnotation = messageAnnotations[index];
                const annotationResult = annotationResults[index];
                
                // 결과에 따른 테두리 색상 설정
                let borderColor = "transparent";
                if (annotationResult) {
                  borderColor = annotationResult.isCorrect ? "#28a745" : "#dc3545"; // 초록 또는 빨간색
                }
                
                return (
                  <div 
                    key={index} 
                    className={`d-flex mb-3 ${isUserMessage ? 'justify-content-end' : 'justify-content-start'}`}
                  >
                    <div 
                      className={`message-container p-3 rounded-3 ${
                        isUserMessage 
                          ? 'bg-primary bg-opacity-10' 
                          : 'bg-success bg-opacity-10'
                      }`}
                      style={{
                        maxWidth: '80%',
                        position: 'relative',
                        border: selectedAnnotation ? `2px solid ${borderColor}` : 'none'
                      }}
                    >
                      <div className="sender-name fw-bold mb-1" style={{ 
                        color: isUserMessage ? '#0d6efd' : '#198754'
                      }}>
                        {msg.sender}
                      </div>
                      
                      <div className="message-text">{msg.text}</div>
                      
                      <div className="mt-2 d-flex justify-content-between align-items-center">
                        <div className="message-time text-muted small">
                          {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                        
                        <div className="d-flex align-items-center">
                          {annotationResult && (
                            <div 
                              className="me-2"
                              title={annotationResult.explanation}
                            >
                              {annotationResult.isCorrect ? (
                                <FaCheck style={{ color: "#28a745" }} />
                              ) : (
                                <FaTimes style={{ color: "#dc3545" }} />
                              )}
                            </div>
                          )}
                          
                        <Dropdown>
                              <Dropdown.Toggle 
                                variant={selectedAnnotation ? (annotationResult?.isCorrect ? "success" : "danger") : "light"} 
                                size="sm"
                                disabled={evaluatingAnnotation}
                              >
                                {selectedAnnotation || "Choose"}
                              </Dropdown.Toggle>
                              <Dropdown.Menu>
                                {annotationOptions.map((option) => (
                                  <OverlayTrigger
                                    key={option}
                                    placement="left"
                                    overlay={
                                      <Tooltip id={`tooltip-option-${option}`}>
                                        {annotationDescriptions[option]}
                                      </Tooltip>
                                    }
                                  >
                                    <Dropdown.Item 
                                      onClick={() => handleAnnotationSelect(index, option)}
                                    >
                                      {option}
                                    </Dropdown.Item>
                                  </OverlayTrigger>
                                ))}
                              </Dropdown.Menu>
                            </Dropdown>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
          size="lg"
          dialogClassName="wider-modal"
        >
          <Modal.Header closeButton>
            <Modal.Title>Practice Completed</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="mb-3 feedback-section">
              <h5 className="mb-2">Feedback:</h5>
              {feedbackContent.split('\n').map((paragraph, idx) => {
                // Parse Markdown-style bold formatting (**text**)
                const parsedText = paragraph.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                return (
                  <p key={idx} dangerouslySetInnerHTML={{ __html: parsedText }}></p>
                );
              })}
            </div>
            
            <div className="p-3 mb-3 bg-light rounded">
              <h5>Your Communication Patterns:</h5>              
              
              {/* Display user's correctly identified patterns - only unique patterns */}
              {(() => {
                // Get unique patterns that were correctly identified
                const uniquePatterns = {};
                
                conversation.forEach((msg, index) => {
                  if (
                    msg.sender === "Me" && 
                    messageAnnotations[index] && 
                    annotationResults[index]?.isCorrect
                  ) {
                    const pattern = messageAnnotations[index];
                    uniquePatterns[pattern] = true;
                  }
                });
                
                // Render each unique pattern once
                return Object.keys(uniquePatterns).map((pattern, idx) => (
                  <div key={`unique-pattern-${idx}`} className="mb-2">
                    <p className="mb-1">
                      Pattern identified: <span className="text-danger">{pattern}</span>
                    </p>
                  </div>

                ));
              })()}
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