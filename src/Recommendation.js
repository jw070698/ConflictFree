import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Container, Card, Row, Col, Spinner, Button, OverlayTrigger, Tooltip, Accordion } from 'react-bootstrap';
import app from "./firebase";
import { FaInfoCircle } from 'react-icons/fa';
import { analyzeConflictTypes } from "./Type";

const db = getFirestore(app);       

function Recommendation() {
    const navigate = useNavigate(); 
    const [searchParams] = useSearchParams();
    const userDocId = searchParams.get("userDocId");
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [partnerName, setPartnerName] = useState('Partner');
    const [gottmanAnalysis, setGottmanAnalysis] = useState(null);
    const [meType, setMeType] = useState('');
    const [partnerType, setPartnerType] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [personalityScores, setPersonalityScores] = useState(null);
    const [recommendations, setRecommendations] = useState(null);
    const [loadingRecommendations, setLoadingRecommendations] = useState(false);
    const [pastConversations, setPastConversations] = useState([]);

    // 타입별 설명을 저장하는 객체
    const typeDescriptions = {
        "Avoidant": "Tends to minimize disagreements and avoid confrontation. Values peace and harmony in relationships, often at the expense of addressing issues directly.",
        "Validating": "Prioritizes mutual understanding and validation of feelings. Tends to discuss issues calmly and seek compromise.",
        "Volatile": "Expresses emotions intensely and directly. Passionate in both positive and negative interactions, with high emotional reactivity.",
        "Hostile": "Shows high defensiveness and criticism during conflicts. May struggle with negative communication patterns that escalate disagreements."
    };
    
    // 타입 이름과 설명을 보여주는 정보 아이콘 컴포넌트
    const InfoIcon = ({ type, descriptions }) => (
        <OverlayTrigger
            placement="right"
            overlay={
                <Tooltip id={`tooltip-${type}`}>
                    <strong>{type}</strong><br />
                    {descriptions[type] || 'No description available'}
                </Tooltip>
            }
        >
            <span className="ms-2" style={{ cursor: 'help' }}>
                <FaInfoCircle color="#6c757d" />
            </span>
        </OverlayTrigger>
    );

    // Gottman 분석 실행 함수
    const runGottmanAnalysis = async (personalityData) => {
        if (!personalityData || Object.keys(personalityData).length < 2) {
            console.error("Not enough data for Gottman analysis");
            return null;
        }

        try {
            setAnalyzing(true);
            console.log("Starting Gottman analysis with data:", personalityData);
            
            // analyzeConflictTypes 함수 호출 (Type.js에서 가져온 함수)
            const analysis = await analyzeConflictTypes(personalityData);
            console.log("Gottman analysis result:", analysis);
            
            if (!analysis) {
                console.error("Analysis returned null or undefined");
                return null;
            }
            
            // Firebase에 분석 결과 저장
            if (userDocId) {
                const userDocRef = doc(db, "users", userDocId);
                await updateDoc(userDocRef, {
                    gottmanAnalysis: analysis,
                    updatedAt: serverTimestamp()
                });
                console.log("Gottman analysis saved to Firebase");
            }
            
            return analysis;
        } catch (error) {
            console.error("Error analyzing Gottman conflict types:", error);
            return null;
        } finally {
            setAnalyzing(false);
        }
    };

    // 커뮤니케이션 추천 생성 함수
    const generateCommunicationRecommendations = async () => {
        if (!meType || !partnerType) {
            console.error("Missing conflict types for recommendation");
            return;
        }

        try {
            setLoadingRecommendations(true);
            
            // Firebase에서 가져온 실제 대화 내용 준비 - 전체 대화 사용
            const conversationExamples = pastConversations
                .map(conv => `${conv.person}: ${conv.message}`)
                .join('\n\n');
            
            // OpenAI API 호출을 위한 프롬프트 구성
            const prompt = `
            You are an expert in couple communication and conflict resolution based on John Gottman's research.
            
            Analyze the following couple's conflict styles and provide tailored communication recommendations.

            Please analyze the specific *interaction dynamics* between these two styles. Focus on how this particular combination of conflict styles tends to behave during conflict—what communication pitfalls are likely to emerge, and what strengths can be leveraged.
            
            Please ensure that each suggestion feels as if it is distilled from the interaction between two individuals with different conflict styles.
            - My conflict type: ${meType}
            - Partner's conflict type: ${partnerType}
            Focus on communication dynamics that emerge from the clash or complement of these styles, and provide advice that would be realistically helpful in such mixed-style interactions. 
            
            ${pastConversations.length > 0 ? `Here are examples of our recent conversations:\n${conversationExamples}\n\n` : ''}
            
            Based on our conflict types${pastConversations.length > 0 ? ' and past conversations' : ''}, provide specific communication recommendations for:
            
            1. WHEN IT HAPPENS - What to do during a conflict
            2. AFTER - How to repair after a conflict
            3. LONG-TERM - Strategies for improving communication patterns over time
            
            For each category, provide 3 specific, actionable tips that consider both our conflict styles.
            
            Format the response as a JSON object with these three categories as keys: "whenItHappens", "after", and "longTerm".
            Each category should contain an array of strings, with each string being a recommendation.
            
            Example format:
            {
              "whenItHappens": [
                "Pause and breathe: When conflict arises, take a moment to breathe deeply before responding.",
                "Use 'I' statements: Express your feelings using 'I feel' rather than 'You always'.",
                "Take breaks: If emotions escalate too much, agree to a short timeout."
              ],
              "after": [
                "Debrief together: Discuss what happened during the conflict once emotions settle.",
                "Express appreciation: Acknowledge any positive efforts your partner made."
              ],
              "longTerm": [
                "Schedule regular check-ins: Prevent issues from escalating with planned discussion time.",
                "Practice active listening: Take turns speaking and listening without interruption."
              ]
            }
            `;
            
            console.log("prompt", prompt);
            
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
                            content: 'You are a relationship coach specializing in Gottman\'s conflict resolution methods. Provide tailored advice based on conflict types.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7
                })
            });

            // API 응답 상태 로그
            console.log("API Response status:", response.status);
            
            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }
            
            const data = await response.json();
            const content = data.choices[0].message.content.trim();
            console.log("Full API Response:", content);
            
            // JSON 파싱
            let recommendationsData;
            try {
                // 직접 파싱 시도
                recommendationsData = JSON.parse(content);
            } catch (parseError) {
                // JSON만 추출하여 파싱 시도
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    recommendationsData = JSON.parse(jsonMatch[0]);
                } else {
                    // 파싱 실패 시 텍스트 형식으로 반환
                    recommendationsData = {
                        whenItHappens: [content.split('\n\n')[0] || "Focus on active listening"],
                        after: [content.split('\n\n')[1] || "Acknowledge your partner's feelings"],
                        longTerm: [content.split('\n\n')[2] || "Practice regular check-ins"]
                    };
                }
            }
            
            // Firebase에 추천 데이터 저장
            if (userDocId) {
                const userDocRef = doc(db, "users", userDocId);
                await updateDoc(userDocRef, {
                    communicationRecommendations: recommendationsData,
                    updatedAt: serverTimestamp()
                });
                console.log("Communication recommendations saved to Firebase");
            }
            
            setRecommendations(recommendationsData);
            return recommendationsData;
        } catch (error) {
            console.error("Error generating communication recommendations:", error);
            return null;
        } finally {
            setLoadingRecommendations(false);
        }
    };

    useEffect(() => {
        async function fetchUserData() {
            if (!userDocId) return;
            
            try {
                setLoading(true);
                const userDocRef = doc(db, "users", userDocId);
                const userDoc = await getDoc(userDocRef);
                
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setUserData(data);
                    
                    // Get partner's name from openAiResults
                    if (data.openAiResults && data.openAiResults.length > 0) {
                        const partnerEntry = data.openAiResults.find(entry => entry.Person !== 'Me');
                        if (partnerEntry) {
                            setPartnerName(partnerEntry.Person);
                        }
                    }
                    
                    // 과거 대화 데이터 가져오기
                    let foundConversations = false;
                    const conversations = [];
                    
                    // 1. Check standard openAiResults array
                    if (data.openAiResults && Array.isArray(data.openAiResults)) {
                        console.log("Found openAiResults array:", data.openAiResults.length);
                        
                        // Try different property names that might contain messages
                        for (const result of data.openAiResults) {
                            if (result.Message && typeof result.Message === 'string') {
                                conversations.push({
                                    person: result.Person || 'Unknown',
                                    message: result.Message
                                });
                                foundConversations = true;
                            } else if (result.message && typeof result.message === 'string') {
                                conversations.push({
                                    person: result.Person || result.person || 'Unknown',
                                    message: result.message
                                });
                                foundConversations = true;
                            } else if (result.content && typeof result.content === 'string') {
                                conversations.push({
                                    person: result.Person || result.person || 'Unknown', 
                                    message: result.content
                                });
                                foundConversations = true;
                            }
                        }
                    }
                    
                    // 2. Check for normalized data structure from Analysis.js
                    if (!foundConversations && data.normalizedConversations) {
                        try {
                            if (Array.isArray(data.normalizedConversations)) {
                                data.normalizedConversations.forEach(item => {
                                    if (item.Person && item.Messages && Array.isArray(item.Messages)) {
                                        item.Messages.forEach(msg => {
                                            conversations.push({
                                                person: item.Person,
                                                message: msg
                                            });
                                        });
                                        foundConversations = true;
                                    }
                                });
                            }
                        } catch (e) {
                            console.error("Error processing normalizedConversations:", e);
                        }
                    }
                    
                    console.log(`Found ${conversations.length} conversation messages`);
                    setPastConversations(conversations);
                    
                    // 저장된 personalityAnalysis 데이터 설정
                    if (data.personalityAnalysis && Object.keys(data.personalityAnalysis).length >= 2) {
                        setPersonalityScores(data.personalityAnalysis);
                        
                        // 이미 저장된 gottmanAnalysis가 있다면 그것을 사용
                        if (data.gottmanAnalysis) {
                            setGottmanAnalysis(data.gottmanAnalysis);
                            
                            // 유형 설정
                            if (data.gottmanAnalysis.people) {
                                if (data.gottmanAnalysis.people['Me']) {
                                    setMeType(data.gottmanAnalysis.people['Me'].primaryType);
                                }
                                
                                if (data.gottmanAnalysis.people[partnerName] || Object.keys(data.gottmanAnalysis.people).find(p => p !== 'Me')) {
                                    const partnerKey = data.gottmanAnalysis.people[partnerName] ? 
                                        partnerName : 
                                        Object.keys(data.gottmanAnalysis.people).find(p => p !== 'Me');
                                    
                                    if (partnerKey) {
                                        setPartnerType(data.gottmanAnalysis.people[partnerKey].primaryType);
                                    }
                                }
                            }
                        } else {
                            // gottmanAnalysis가 없다면 새로 분석 실행
                            console.log("No existing analysis found, running new analysis");
                            const newAnalysis = await runGottmanAnalysis(data.personalityAnalysis);
                            
                            if (newAnalysis) {
                                setGottmanAnalysis(newAnalysis);
                                
                                // 유형 설정
                                if (newAnalysis.people) {
                                    if (newAnalysis.people['Me']) {
                                        setMeType(newAnalysis.people['Me'].primaryType);
                                    }
                                    
                                    if (newAnalysis.people[partnerName] || Object.keys(newAnalysis.people).find(p => p !== 'Me')) {
                                        const partnerKey = newAnalysis.people[partnerName] ? 
                                            partnerName : 
                                            Object.keys(newAnalysis.people).find(p => p !== 'Me');
                                        
                                        if (partnerKey) {
                                            setPartnerType(newAnalysis.people[partnerKey].primaryType);
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 저장된 추천 데이터가 있다면 사용
                        if (data.communicationRecommendations) {
                            setRecommendations(data.communicationRecommendations);
                        }
                    } else {
                        console.error("Insufficient personality data for analysis");
                    }
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
            } finally {
                setLoading(false);
            }
        }
        
        fetchUserData();
    }, [userDocId, partnerName]);

    // 컴포넌트 마운트 후 추천 데이터 없으면 생성
    useEffect(() => {
        async function loadRecommendations() {
            // 타입 정보가 있고 추천 데이터가 없을 때만 생성
            if (meType && partnerType && !recommendations && !loadingRecommendations) {
                await generateCommunicationRecommendations();
            }
        }
        
        loadRecommendations();
    }, [meType, partnerType, recommendations]);

    const handleStartClick = async () => {
        navigate(`/chat?userDocId=${userDocId}`);
    };

    const handleRetryAnalysis = async () => {
        if (personalityScores && Object.keys(personalityScores).length >= 2) {
            const newAnalysis = await runGottmanAnalysis(personalityScores);
            if (newAnalysis) {
                setGottmanAnalysis(newAnalysis);
                
                // 유형 설정
                if (newAnalysis.people) {
                    if (newAnalysis.people['Me']) {
                        setMeType(newAnalysis.people['Me'].primaryType);
                    }
                    
                    if (newAnalysis.people[partnerName] || Object.keys(newAnalysis.people).find(p => p !== 'Me')) {
                        const partnerKey = newAnalysis.people[partnerName] ? 
                            partnerName : 
                            Object.keys(newAnalysis.people).find(p => p !== 'Me');
                        
                        if (partnerKey) {
                            setPartnerType(newAnalysis.people[partnerKey].primaryType);
                        }
                    }
                }
                
                // 새 분석 결과로 추천 다시 생성
                setRecommendations(null); // 기존 추천 초기화
                await generateCommunicationRecommendations();
            }
        } else {
            console.error("Not enough data to perform analysis");
        }
    };


    if (loading) {
        return (
            <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
                <Spinner animation="border" role="status">
                    <span className="visually-hidden">Loading...</span>
                </Spinner>
            </Container>
        );
    }

    if (analyzing) {
        return (
            <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
                <div className="text-center">
                    <h3 className="mb-3">Analyzing Conflict Patterns</h3>
                    <p className="mb-4">We're analyzing your conflict resolution styles based on the questionnaire...</p>
                    <Spinner animation="border" role="status">
                        <span className="visually-hidden">Analyzing...</span>
                    </Spinner>
                </div>
            </Container>
        );
    }

    if (loadingRecommendations) {
        return (
            <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
                <div className="text-center">
                    <h3 className="mb-3">Generating Recommendations</h3>
                    <p className="mb-4">We're creating personalized communication strategies based on your conflict styles...</p>
                    <Spinner animation="border" role="status">
                        <span className="visually-hidden">Generating...</span>
                    </Spinner>
                </div>
            </Container>
        );
    }

    // Personality data exists but analysis failed
    if (personalityScores && !gottmanAnalysis) {
        return (
            <Container className="py-5">
                <div className="text-center">
                    <h3 className="mb-4">Analysis Error</h3>
                    <p>We couldn't generate your conflict analysis. Please try again.</p>
                    <Button onClick={handleRetryAnalysis} className="mt-3">
                        Retry Analysis
                    </Button>
                </div>
            </Container>
        );
    }

    // If no personality data available
    if (!personalityScores) {
        return (
            <Container className="py-5">
                <h3 className="mb-4">Conflict Data Not Available</h3>
                <p>Please complete the conflict resolution questionnaire first.</p>
                <Button onClick={() => navigate(`/analysis?userDocId=${userDocId}`)} className="mt-3">
                    Go to Questionnaire
                </Button>
            </Container>
        );
    }

    // If analysis is missing
    if (!gottmanAnalysis) {
        return (
            <Container className="py-5">
                <h3 className="mb-4">Gottman Analysis Not Available</h3>
                <p>Please complete the conflict resolution analysis first.</p>
                <Button onClick={() => navigate(`/analysis?userDocId=${userDocId}`)} className="mt-3">
                    Go to Analysis
                </Button>
            </Container>
        );
    }

    return (
        <Container className="py-5">
            {/* Personality Interface */}
            <div className="mb-5">
                <h3 className="mb-4">Communication Guide </h3>
                <div className="position-relative">
                    {/* Personality Types Row */}
                    <Row className="g-4">
                        {/* First Column */}
                        <Col md={12}>
                            <div className="rounded-pill overflow-hidden d-flex mb-3 text-center">
                                <div className="w-50 bg-danger bg-opacity-25 px-3 py-2">
                                    <small className="d-block text-muted mb-1">{partnerName}'s type</small>
                                    <div className="d-flex align-items-center justify-content-center">
                                        {partnerType}
                                        <InfoIcon type={partnerType} descriptions={typeDescriptions} />
                                    </div>
                                </div>
                                <div className="w-50 bg-info bg-opacity-25 px-3 py-2">
                                    <small className="d-block text-muted mb-1">Your type</small>
                                    <div className="d-flex align-items-center justify-content-center">
                                        {meType}
                                        <InfoIcon type={meType} descriptions={typeDescriptions} />
                                    </div>
                                </div>
                            </div>
                            <Card className="shadow-sm">
                                <Card.Body>
                                    {gottmanAnalysis.people && (
                                        <div className="mb-4">
                                            <h5 className="border-bottom pb-2 mb-3">Your Conflict Patterns</h5>
                                            {Object.entries(gottmanAnalysis.people).map(([person, analysis]) => (
                                                <div key={person} className="mb-3">
                                                    <div className="d-flex align-items-center">
                                                        <h6 className="mb-2" style={{ 
                                                            color: person === 'Me' ? '#0d6efd' : '#dc3545'
                                                        }}>
                                                            {person === 'Me' ? 'Your' : `${partnerName}'s`} Pattern:
                                                        </h6>
                                                        <span className="ms-2 badge bg-light text-dark">
                                                            {analysis.primaryType}
                                                        </span>
                                                    </div>
                                                    <p className="mb-3 ps-3 small">{analysis.negativePatterns}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    
                                    {recommendations && (
                                        <div className="mt-4">
                                            <div className="d-flex justify-content-between align-items-center mb-3">
                                                <h5 className="border-bottom pb-2 mb-0">Communication Recommendations</h5>
                                            </div>
                                            
                                            <Accordion defaultActiveKey={['0', '1', '2']} alwaysOpen className="mb-3">
                                                {/* During Conflict */}
                                                <Accordion.Item eventKey="0">
                                                    <Accordion.Header>
                                                        <strong>When Conflict Happens</strong>
                                                    </Accordion.Header>
                                                    <Accordion.Body className="p-3">
                                                        <ul className="mb-0 ps-3">
                                                            {(recommendations?.whenItHappens || []).length > 0 ? (
                                                                (recommendations.whenItHappens || []).map((tip, index) => (
                                                                    <li key={index} className="mb-3">
                                                                        {tip && tip.includes(":") ? (
                                                                            <>
                                                                                <strong className="d-block text-primary">{tip.split(":")[0].trim()}</strong>
                                                                                <p className="mb-0 mt-1 small">{tip.split(":")[1].trim()}</p>
                                                                            </>
                                                                        ) : (
                                                                            <span>{tip}</span>
                                                                        )}
                                                                    </li>
                                                                ))
                                                            ) : (
                                                                <p className="text-muted">No recommendations available for conflict situations.</p>
                                                            )}
                                                        </ul>
                                                    </Accordion.Body>
                                                </Accordion.Item>
                                                
                                                {/* After Conflict */}
                                                <Accordion.Item eventKey="1">
                                                    <Accordion.Header>
                                                        <strong>After Conflict</strong>
                                                    </Accordion.Header>
                                                    <Accordion.Body className="p-3">
                                                        <ul className="mb-0 ps-3">
                                                            {(recommendations?.after || []).length > 0 ? (
                                                                (recommendations.after || []).map((tip, index) => (
                                                                    <li key={index} className="mb-3">
                                                                        {tip && tip.includes(":") ? (
                                                                            <>
                                                                                <strong className="d-block text-primary">{tip.split(":")[0].trim()}</strong>
                                                                                <p className="mb-0 mt-1 small">{tip.split(":")[1].trim()}</p>
                                                                            </>
                                                                        ) : (
                                                                            <span>{tip}</span>
                                                                        )}
                                                                    </li>
                                                                ))
                                                            ) : (
                                                                <p className="text-muted">No recommendations available for after conflict.</p>
                                                            )}
                                                        </ul>
                                                    </Accordion.Body>
                                                </Accordion.Item>
                                                
                                                {/* Long-term Strategies */}
                                                <Accordion.Item eventKey="2">
                                                    <Accordion.Header>
                                                        <strong>Long-term Strategies</strong>
                                                    </Accordion.Header>
                                                    <Accordion.Body className="p-3">
                                                        <ul className="mb-0 ps-3">
                                                            {(recommendations?.longTerm || []).length > 0 ? (
                                                                (recommendations.longTerm || []).map((tip, index) => (
                                                                    <li key={index} className="mb-3">
                                                                        {tip && tip.includes(":") ? (
                                                                            <>
                                                                                <strong className="d-block text-primary">{tip.split(":")[0].trim()}</strong>
                                                                                <p className="mb-0 mt-1 small">{tip.split(":")[1].trim()}</p>
                                                                            </>
                                                                        ) : (
                                                                            <span>{tip}</span>
                                                                        )}
                                                                    </li>
                                                                ))
                                                            ) : (
                                                                <p className="text-muted">No recommendations available for long-term strategies.</p>
                                                            )}
                                                        </ul>
                                                    </Accordion.Body>
                                                </Accordion.Item>
                                            </Accordion>
                                        </div>
                                    )}
                                    
                                    {!recommendations && (
                                        <div className="text-center py-4">
                                            <p>No recommendations available yet.</p>
                                            <Button 
                                                onClick={generateCommunicationRecommendations} 
                                                variant="primary"
                                                disabled={loadingRecommendations}
                                            >
                                                Generate Recommendations
                                            </Button>
                                        </div>
                                    )}
                                    
                                    <div className="d-flex mt-4">
                                        <Button 
                                            variant="primary" 
                                            className="w-100 mt-3 me-2"
                                            onClick={handleStartClick}
                                        >
                                            Let's Practice
                                        </Button>
                                        {/*<Button 
                                            variant="outline-primary" 
                                            className="w-100 mt-3 ms-2"
                                        >
                                            Let's Exercise
                                        </Button>*/}
                                    </div>
                                </Card.Body>
                            </Card>
                        </Col>
                    </Row>
                </div>
            </div>
        </Container>
    );
}

export default Recommendation;
