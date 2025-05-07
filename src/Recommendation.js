import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Container, Card, Row, Col, Spinner, Button } from 'react-bootstrap';
import app from "./firebase";

const db = getFirestore(app);       

function Recommendation() {
    const navigate = useNavigate(); 
    const [searchParams] = useSearchParams();
    const userDocId = searchParams.get("userDocId");
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [partnerName, setPartnerName] = useState('Partner');

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
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
            } finally {
                setLoading(false);
            }
        }
        
        fetchUserData();
    }, [userDocId]);

    const handleStartClick = async () => {
        navigate(`/chat?userDocId=${userDocId}`);
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

    return (
        <Container className="py-5">
            {/* Personality Interface */}
            <div className="mb-5">
                <h3 className="mb-4">Recommendation & Exercise</h3>
                <div className="position-relative">
                    {/* Personality Types Row */}
                    <Row className="g-4">
                        {/* Voice-Neglect Column */}
                        <Col md={4}>
                            <div className="rounded-pill overflow-hidden d-flex mb-3 text-center">
                                <div className="w-50 bg-danger bg-opacity-25 px-3 py-2">
                                    <small className="d-block text-muted mb-1">{partnerName}'s type</small>
                                    Voice
                                </div>
                                <div className="w-50 bg-info bg-opacity-25 px-3 py-2">
                                    <small className="d-block text-muted mb-1">Your type</small>
                                    Neglect
                                </div>
                            </div>
                            <Card className="shadow-sm">
                                <Card.Body>
                                    <ol>
                                        <li className="mb-3">
                                            <strong>"Stop for a step" to gain trust</strong>
                                            <p className="small mb-2">
                                                The closer you get, the more he retreats; the more you worry, the more irritated he becomes. It's not because you did something wrong, but because he can't handle his emotions and will mistake concern for control.
                                            </p>
                                            <p className="small mb-2">
                                                👉 Try to "stop for a step" moderately, don't ask questions immediately, don't explain repeatedly, let him feel that he is not being forced, and calm down first.
                                            </p>
                                            <p className="small mb-2">
                                                You can say:
                                            </p>
                                            <p className="small fst-italic">
                                                "I see you're in a bad mood. I won't force you to say anything, but I'm here. You can always find me."
                                            </p>
                                            <p className="small">
                                                This "non-controlling existence" is particularly important for avoidant types.
                                            </p>
                                        </li>
                                        <li>
                                            <strong>Use "observation + feeling" instead of "you should" dialogue</strong>
                                        </li>
                                    </ol>
                                    <Button variant="primary" className="w-100 mt-3">Let's Simulate</Button>
                                    <Button variant="primary" className="w-100 mt-3">Let's Exercise</Button>
                                </Card.Body>
                            </Card>
                        </Col>
                        
                        {/* Attack-Attack Column */}
                        <Col md={4}>
                            <div className="rounded-pill overflow-hidden d-flex mb-3 text-center">
                                <div className="w-50 bg-danger bg-opacity-25 px-3 py-2">
                                    <small className="d-block text-muted mb-1">{partnerName}'s type</small>
                                    Attack
                                </div>
                                <div className="w-50 bg-info bg-opacity-25 px-3 py-2">
                                    <small className="d-block text-muted mb-1">Your type</small>
                                    Attack
                                </div>
                            </div>
                            <Card className="shadow-sm">
                                <Card.Body>
                                    <p className="text-muted">Recommendations for Attack-Attack pattern will be shown here.</p>
                                    <Button variant="primary" className="w-100 mt-3">Let's Simulate</Button>
                                    <Button variant="primary" className="w-100 mt-3">Let's Exercise</Button>
                                </Card.Body>
                            </Card>
                        </Col>
                        
                        {/* Avoidance-Avoidance Column */}
                        <Col md={4}>
                            <div className="rounded-pill overflow-hidden d-flex mb-3 text-center">
                                <div className="w-50 bg-danger bg-opacity-25 px-3 py-2">
                                    <small className="d-block text-muted mb-1">{partnerName}'s type</small>
                                    Avoidance
                                </div>
                                <div className="w-50 bg-info bg-opacity-25 px-3 py-2">
                                    <small className="d-block text-muted mb-1">Your type</small>
                                    Avoidance
                                </div>
                            </div>
                            <Card className="shadow-sm">
                                <Card.Body>
                                    <p className="text-muted">Recommendations for Avoidance-Avoidance pattern will be shown here.</p>
                                    <Button variant="primary" className="w-100 mt-3">Let's Simulate</Button>
                                    <Button variant="primary" className="w-100 mt-3">Let's Exercise</Button>
                                </Card.Body>
                            </Card>
                        </Col>
                    </Row>
                </div>
            </div>

            {/*<Button onClick={handleStartClick} className="mt-3 w-100">Start</Button>*/}
        </Container>
    );
}

export default Recommendation;
