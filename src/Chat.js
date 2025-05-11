import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Form, Button, Container, Row, Col, ProgressBar, Card, Alert, Accordion } from 'react-bootstrap';
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
    const [gottmanAnalysis, setGottmanAnalysis] = useState(null);
    const [recommendations, setRecommendations] = useState(null);
    const [openAiResults, setOpenAiResults] = useState([]);
    const [partnerName, setPartnerName] = useState('Partner');

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
            
            if (data.gottmanAnalysis) {
              setGottmanAnalysis(data.gottmanAnalysis);
            }
            
            if (data.communicationRecommendations) {
              setRecommendations(data.communicationRecommendations);
            }
            
            if (data.openAiResults && Array.isArray(data.openAiResults)) {
              setOpenAiResults(data.openAiResults);
              
              const partnerEntry = data.openAiResults.find(entry => entry.Person !== 'Me');
              if (partnerEntry) {
                setPartnerName(partnerEntry.Person);
              }
              
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
        
        // 하나의 대화 상대만 가져오기
        const participant = partnerName || userData.openAiResults.find(item => item.Person !== "Me")?.Person;
        if (!participant) return;
        
        setLoadingResponses(true);
        const conflictDescription = userData?.conflictDescription || "No conflict description provided.";
        
        try {
          const personality = userData?.personalityAnalysis ? userData.personalityAnalysis[participant] : null;
          
          // 갓트만 분석 정보 추가
          const gottmanInfo = gottmanAnalysis?.people?.[participant] 
              ? `Your Gottman conflict type is: ${gottmanAnalysis.people[participant].primaryType}. 
                  Your negative patterns: ${gottmanAnalysis.people[participant].negativePatterns}`
              : "";
              
          // 추천 정보 추가
          let recommendationInfo = "";
          if (recommendations) {
              const tips = [
                  ...(recommendations.whenItHappens || []).slice(0, 1),
                  ...(recommendations.after || []).slice(0, 1)
              ].join("; ");
              
              recommendationInfo = tips ? `Consider this communication tip: ${tips}` : "";
          }
          
          const systemMessage = `You are ${participant}. 
              Your personality traits are: ${personality ? personality.personalityTraits : "Not available"}. 
              Your communication style is: ${personality ? personality.communicationStyle : "Not available"}. 
              ${gottmanInfo}
              You are in a \"${conflictDescription}\" situation. 
              ${recommendationInfo}
              
              IMPORTANT INSTRUCTIONS:
              1. Keep your message concise and short - no more than 1-2 sentences per message.
              2. If you want to express a complex thought, break it into multiple short messages instead of one long one.
              3. Respond with 1-3 separate messages by separating them with a triple pipe delimiter (|||).
              4. Each message should sound natural as a text message.
              
              Example response format:
              Hi, I see your point.||| I'm feeling frustrated about this situation though.||| Can we try to find a compromise?`;
              
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
                  content: `You are in a conflict situation about: "${conflictDescription}". What would be your opening message(s)? Remember to keep them short and break longer thoughts into multiple messages.` 
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
        } catch (error) {
          console.error(`Error generating initial AI response:`, error);
        }
        
        setLoadingResponses(false);
      }
      generateInitialMessages();
    }, [userDocId, userData, conversation, gottmanAnalysis, recommendations, partnerName]);

    async function getAIResponseForParticipant(participant) {
        const personality = userData?.personalityAnalysis ? userData.personalityAnalysis[participant] : null;
        const conflictDescription = userData?.conflictDescription || "No conflict description provided.";
        const conversationText = conversation.map(msg => `${msg.sender}: ${msg.text}`).join("\n");
        
        // 갓트만 분석 정보 추가
        const gottmanInfo = gottmanAnalysis?.people?.[participant] 
            ? `Your Gottman conflict type is: ${gottmanAnalysis.people[participant].primaryType}. 
               Your negative patterns: ${gottmanAnalysis.people[participant].negativePatterns}`
            : "";
            
        // 추천 정보 추가
        let recommendationInfo = "";
        if (recommendations) {
            const tips = [
                ...(recommendations.whenItHappens || []),
                ...(recommendations.after || [])
            ].slice(0, 3).join("; ");
            
            recommendationInfo = `
            Consider these communication tips in your response:
            ${tips}
            `;
        }
        
        const prompt = `You are act as ${participant}. 
            Your personality traits are: ${personality ? personality.personalityTraits : "Not available"}. 
            Your communication style is: ${personality ? personality.communicationStyle : "Not available"}.
            ${gottmanInfo}
            The conflict to resolve is: ${conflictDescription}.
            The conversation so far is: 
            ${conversationText}
                        
            Please provide your next message as ${participant} in a natural, conversational tone.
            
            IMPORTANT INSTRUCTIONS:
            1. Keep your message concise and short; no more than 1-2 sentences per message.
            2. If you want to express a complex thought, break it into multiple short messages instead of one long one.
            3. Respond with 1-3 separate messages by separating them with a triple pipe delimiter (|||).
            4. Each message should sound natural as a text message.
            
            Example response format:
            Hi, I see your point.||| I'm feeling frustrated about this situation though.||| Can we try to find a compromise?
            
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

    // Layout
    return (
      <Container fluid className="py-4" style={{ minHeight: '100vh' }}>
        <Row>
          {/* Partner Sidebar */}
          <Col md={3} className="d-flex flex-column align-items-center border-end">
            <Card className="w-100 mb-3">
              <Card.Body>
                <Card.Title><span role="img" aria-label="partner">👤</span> {partnerName}</Card.Title>
                {gottmanAnalysis && gottmanAnalysis.people && gottmanAnalysis.people[partnerName] && (
                  <div className="mt-2 mb-3">
                    <small className="text-muted">Their conflict type:</small>
                    <h6 className="mb-0">{gottmanAnalysis.people[partnerName].primaryType}</h6>
                  </div>
                )}
                {/* 갓트만 분석 결과 표시 */}
                {gottmanAnalysis && gottmanAnalysis.people && gottmanAnalysis.people[partnerName] && (
                  <Alert variant="light" className="p-2 mb-3">
                    <small className="d-block mb-1 text-muted">Their pattern:</small>
                    <p className="small mb-0">{gottmanAnalysis.people[partnerName]?.negativePatterns || "Not available"}</p>
                  </Alert>
                )}
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
            {userData?.conflictDescription && (
              <Alert variant="info" className="w-100 mb-3 py-2">
                <small className="fw-bold">Conversation topic:</small> {userData.conflictDescription}
              </Alert>
            )}
            
            {/* 대화 관련 팁 표시 */}
            {recommendations && recommendations.whenItHappens && recommendations.whenItHappens.length > 0 && (
              <Card className="w-100 mb-3 border-primary border-top-0 border-end-0 border-bottom-0 border-3">
                <Card.Body className="py-2">
                  <div className="d-flex align-items-center">
                    <div className="text-primary me-2">💡</div>
                    <div>
                      <small className="text-primary fw-bold">Communication Tip:</small>
                      <p className="mb-0 small">
                        {recommendations.whenItHappens[0]}
                      </p>
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
                {gottmanAnalysis && gottmanAnalysis.people && gottmanAnalysis.people['Me'] && (
                  <div className="mt-2 mb-3">
                    <small className="text-muted">Your conflict type:</small>
                    <h6 className="mb-0">{gottmanAnalysis.people['Me'].primaryType}</h6>
                  </div>
                )}
                {/* 갓트만 분석 결과 표시 */}
                {gottmanAnalysis && gottmanAnalysis.people && (
                  <Alert variant="light" className="p-2 mb-3">
                    <small className="d-block mb-1 text-muted">Your pattern:</small>
                    <p className="small mb-0">{gottmanAnalysis.people['Me']?.negativePatterns || "Not available"}</p>
                  </Alert>
                )}
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
      </Container>
    );
}

export default Chat;