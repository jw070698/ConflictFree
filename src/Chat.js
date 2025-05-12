import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Form, Button, Container, Row, Col, ProgressBar, Card, Alert, Accordion, Modal } from 'react-bootstrap';
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
    
    // 음주 관련 시나리오
    const [conflictScenario, setConflictScenario] = useState('');

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
            const scenario = `${actualPartnerName} has always enjoyed playing video games, but lately, especially when ${actualPartnerName} is feeling stressed or upset, ${actualPartnerName} tends to stay up all night gaming alone. I'm not against ${actualPartnerName} playing games, I know it's something ${actualPartnerName} enjoys, but I worry about ${actualPartnerName} sleep and health. I also wish ${actualPartnerName} could talk to me about what's bothering ${actualPartnerName} instead of shutting me out and turning to games every time.`;
            setConflictScenario(scenario);
            
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
                
                The conflict scenario is: "${conflictScenario}"
                
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

    useEffect(() => {
      async function generateInitialMessages() {
        if (!userDocId || !userData || !userData.openAiResults) return;
        if (conversation.length > 0) return;
        
        // 하나의 대화 상대만 가져오기
        const participant = partnerName || userData.openAiResults.find(item => item.Person !== "Me")?.Person;
        if (!participant) return;
        
        setLoadingResponses(true);
        
        try {
          // 대화 시작자 결정
          const conversationStarter = await determineConversationStarter();
          
          // 채팅 히스토리 가져오기
          const userDocRef = doc(db, "users", userDocId);
          const docSnap = await getDoc(userDocRef);
          let previousChat = [];
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.chatHistory && Array.isArray(data.chatHistory)) {
              previousChat = data.chatHistory;
              
              // 채팅 히스토리가 있으면 대화 상태에 설정하고 함수 종료
              if (previousChat.length > 0) {
                setConversation(previousChat);
                setLoadingResponses(false);
                return;
              }
            }
          }
          
          // 파트너가 시작하는 경우에만 AI 응답 생성
          if (conversationStarter === participant) {
            const personality = userData?.personalityAnalysis ? userData.personalityAnalysis[participant] : null;
            
            // 갓트만 분석 정보 추가
            const gottmanInfo = gottmanAnalysis?.people?.[participant] 
                ? `Your Gottman conflict type is: ${gottmanAnalysis.people[participant].primaryType}. 
                    Your negative patterns: ${gottmanAnalysis.people[participant].negativePatterns}`
                : "";
                
            // 추천 정보 추가
            //let recommendationInfo = "";
            //if (recommendations) {
            //    const tips = [
            //        ...(recommendations.whenItHappens || []).slice(0, 1),
            //        ...(recommendations.after || []).slice(0, 1)
            //    ].join("; ");
                
            //    recommendationInfo = tips ? `Consider this communication tip: ${tips}` : "";
            //}
            
            const systemMessage = `You are ${participant}. 
                Your personality traits are: ${personality ? personality.personalityTraits : "Not available"}. 
                Your communication style is: ${personality ? personality.communicationStyle : "Not available"}. 
                ${gottmanInfo}
                You are in a "${conflictScenario}" situation. 
                
                IMPORTANT INSTRUCTIONS:
                1. Keep your message concise and short.
                2. If you want to express a complex thought, break it into multiple short messages instead of one long one.
                3. Respond with 1-2 separate messages by separating them with a triple pipe delimiter (|||).
                4. Each message should sound natural as a text message.
                5. Do NOT suggest meeting or resolving the issue outside of this chat. All resolution must occur within this conversation only.
                `;
                
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
                  { 
                    role: 'system', 
                    content: systemMessage 
                  },
                  { 
                    role: 'user', 
                    content: `You are in a conflict situation about: "${conflictScenario}". You are the one who needs to start this conversation about the gaming issue. What would be your opening message(s)? Remember to keep them short and break longer thoughts into multiple messages.` 
                  }
                ],
                temperature: 0.8
              })
            });
            const data = await response.json();
            let aiResponseText = data.choices[0].message.content.trim();
            
            // 메시지를 여러 개로 나누기
            const messageParts = aiResponseText.split('|||');
            const aiMessages = messageParts
              .map(part => part.trim())
              .filter(part => part.length > 0)
              .map(text => ({
                sender: participant,
                text: text,
                timestamp: new Date().toISOString()
              }));
              
            // 각 메시지를 대화에 추가하고 저장
            for (const message of aiMessages) {
              setConversation(prev => [...prev, message]);
              await saveMessage(message);
            }
          }
        } catch (error) {
          console.error(`Error generating initial AI response:`, error);
        }
        
        setLoadingResponses(false);
      }
      generateInitialMessages();
    }, [userDocId, userData, conversation, gottmanAnalysis, recommendations, partnerName, conflictScenario]);

    async function getAIResponseForParticipant(participant) {
        const personality = userData?.personalityAnalysis ? userData.personalityAnalysis[participant] : null;
        
        // 이전 대화 내용을 문자열로 변환
        const conversationText = conversation.map(msg => `${msg.sender}: ${msg.text}`).join("\n");
        
        // 갓트만 분석 정보 추가
        const gottmanInfo = gottmanAnalysis?.people?.[participant] 
            ? `Your Gottman conflict type is: ${gottmanAnalysis.people[participant].primaryType}. 
               Your negative patterns: ${gottmanAnalysis.people[participant].negativePatterns}`
            : "";
        
        const prompt = `You are act as ${participant}, you are in romantic relationship. 
            Your personality traits are: ${personality ? personality.personalityTraits : "Not available"}. 
            Your communication style is: ${personality ? personality.communicationStyle : "Not available"}.
            ${gottmanInfo}
            The conflict to resolve is: ${conflictScenario}.
            
            The conversation so far:
            ${conversationText}
                        
            Please provide your next message as ${participant} in a natural, conversational tone.
            Your response should directly connect to what was just said in the conversation.
            
            IMPORTANT INSTRUCTIONS:
            1. Keep your message concise and short.
            2. If you want to express a complex thought, break it into multiple short messages instead of one long one.
            3. Respond with 1-2 separate messages by separating them with a triple pipe delimiter (|||).
            4. Each message should sound natural as a text message.
            5. Do NOT suggest meeting or resolving the issue outside of this chat. All resolution must occur within this conversation only.
            
            Respond only with the message text(s).`;
    
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
                    content: `You are act as ${participant} with the following characteristics:
                    - Personality traits: ${personality ? personality.personalityTraits : "Not available"}
                    - Communication style: ${personality ? personality.communicationStyle : "Not available"}
                    - ${gottmanInfo}
                    
                    Respond naturally as ${participant} would, considering the communication patterns and conflict style.
                    Break your responses into short, text-message style chunks rather than one long message.`
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.8
        })
        });
        const data = await response.json();
        const aiMessageContent = data.choices[0].message.content.trim();
        
        // 메시지를 여러 개로 나누기
        const messageParts = aiMessageContent.split('|||');
        return messageParts.map(part => part.trim()).filter(part => part.length > 0);
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
            setLoadingResponses(true);
            try {
                // partnerName이 있으면 해당 파트너만, 없으면 첫 번째 Me가 아닌 참가자 사용
                const participant = partnerName || openAiResults.find(item => item.Person !== "Me")?.Person;
                
                if (participant) {
                    // 여러 응답 메시지 받기
                    const aiResponseTexts = await getAIResponseForParticipant(participant);
                    
                    // 응답 메시지 각각을 처리
                    for (const responseText of aiResponseTexts) {
                        const aiMessage = {
                            sender: participant,
                            text: responseText,
                            timestamp: new Date().toISOString()
                        };
                        // 약간의 시간 차이를 두고 메시지 추가 (더 자연스러운 대화 느낌을 위해)
                        await new Promise(resolve => setTimeout(resolve, 500));
                        setConversation(prev => [...prev, aiMessage]);
                        await saveMessage(aiMessage);
                    }
                } else {
                    console.error("No partner found for conversation");
                }
            } catch (error) {
                console.error(`Error generating AI response:`, error);
            }
            setLoadingResponses(false);
        }
    };

    // Watch inputValue and provide communication tips based on content
    useEffect(() => {
      async function checkInputAndSuggest() {
        // 입력값이 비어있으면 팁을 표시하지 않음
        if (!inputValue.trim()) {
          setTip("");
          setHighlightedInput("");
          return;
        }
        
        let shouldHighlight = false;
        let tipToShow = "";
        
        // 'you'로 시작하면 강조 표시
        if (/^you\b/i.test(inputValue.trim())) {
          shouldHighlight = true;
          const match = inputValue.match(/^(you)(.*)/i);
          if (match) {
            setHighlightedInput(<><span style={{ background: '#ffe066', fontWeight: 'bold' }}>{match[1]}</span>{match[2]}</>);
          } else {
            setHighlightedInput(inputValue);
          }
          
          // 추천 데이터가 있으면 이를 활용한 팁 제공
          if (recommendations && recommendations.whenItHappens && recommendations.whenItHappens.length > 0) {
            // "Use 'I' statements" 같은 팁이 있는지 확인
            const iStatementTip = recommendations.whenItHappens.find(tip => 
              tip.toLowerCase().includes("'i' statement") || tip.toLowerCase().includes("i feel")
            );
            
            if (iStatementTip) {
              tipToShow = iStatementTip;
            } else {
              tipToShow = "Try to start your message with 'I feel...' instead of 'You...' to express your feelings without blame.";
            }
          } else {
            // 추천 데이터가 없으면 일반적인 팁 제공
            tipToShow = "Try to start the sentence with 'I' instead of 'You' to avoid sounding accusatory.";
          }
          
          setTip(tipToShow);
        } else {
          setHighlightedInput(inputValue);
          
          // 다른 부정적인 단어나 표현이 있는지 확인
          const negativeWords = ['never', 'always', 'hate', 'stupid', 'ridiculous', 'whatever'];
          const foundNegativeWord = negativeWords.find(word => inputValue.toLowerCase().includes(word));
          
          if (foundNegativeWord) {
            shouldHighlight = true;
            
            // 갓트만 분석 결과가 있으면 이를 활용한 맞춤형 팁 제공
            if (gottmanAnalysis && gottmanAnalysis.people && gottmanAnalysis.people['Me']) {
              const myType = gottmanAnalysis.people['Me'].primaryType;
              
              if (myType === 'Volatile') {
                tipToShow = "As someone with a volatile communication style, try to moderate your intensity by using more specific language instead of absolutes like 'never' or 'always'.";
              } else if (myType === 'Avoidant') {
                tipToShow = "Instead of using strong negative words that might escalate conflict, try expressing what you need in a more direct but gentle way.";
              } else if (myType === 'Validating') {
                tipToShow = "Consider how these strong words might affect your partner's feelings. Try rephrasing to acknowledge both perspectives.";
              } else {
                tipToShow = `Be careful with words like "${foundNegativeWord}" as they can escalate conflict. Try using more specific and neutral language.`;
              }
            } else {
              tipToShow = `Be careful with words like "${foundNegativeWord}" as they can escalate conflict. Try using more specific and neutral language.`;
            }
            
            setTip(tipToShow);
          } else {
            setTip("");
          }
        }
      }
      checkInputAndSuggest();
    }, [inputValue, recommendations, gottmanAnalysis]);

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
          
          setLoadingResponses(false);
          
          // After a brief delay, reload the page to get fresh state
          setTimeout(() => {
            window.location.reload();
          }, 500);
          
        } catch (error) {
          console.error("Error resetting chat:", error);
          setLoadingResponses(false);
        }
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

    // Layout
    return (
      <Container fluid className="py-4 mb-5" style={{ minHeight: '100vh' }}>
        <Row>
          {/* Partner Sidebar */}
          <Col md={3} className="d-flex flex-column align-items-center border-end">
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
                {!gottmanAnalysis && (
                  <div>
                    <div className="mb-2">voice</div>
                    <ProgressBar now={60} className="mb-2" />
                    <ProgressBar now={30} className="mb-2" />
                    <div className="mt-3">Some visualization...</div>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          {/* Chat Center */}
          <Col md={6} className="d-flex flex-column align-items-center" style={{ borderTop: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6' }}>
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
              <Card className="w-100 mb-3 border-primary border-top-0 border-end-0 border-bottom-0 border-3 mt-4" style={{ borderRadius: '0.75rem' }}>
                <Card.Body className="py-3">
                  <div className="d-flex align-items-center">
                    <div>
                      <small className="text-primary fw-bold">New Scenario: </small>
                      <p className="mb-0 mt-1 px-2">{conflictScenario}</p>
                      {/*<Alert variant="info" className="w-100 mb-3 py-2">
                        {conflictScenario}
                      </Alert>*/}
                    </div>
                  </div>
                </Card.Body>
              </Card>
            )}
            
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
            <div className="d-flex w-100 align-items-center mb-4">
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
            
            {/* Bottom buttons */}
            <div className="d-flex justify-content-between mt-2 mb-2">
              <Button 
                variant="outline-secondary" 
                style={{ borderRadius: '.25rem', padding: '0.375rem 0.75rem' }}
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

          {/* Me Sidebar */}
          <Col md={3} className="d-flex flex-column align-items-center border-start">
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