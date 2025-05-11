import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Container, Card, Row, Col, Spinner, Button } from 'react-bootstrap';
import app from "./firebase";
import { analyzeConflictTypes } from "./Type";

const db = getFirestore(app);

const CONFLICT_QUESTIONS = [
  "We usually resolve conflicts by discussing the problem.",
  "When we reach a compromise, the conflict usually ends.",
  "Compromise is the best way for us to resolve conflicts.",
  "To resolve disagreements, I try to give in a little.",
  "I try to resolve disputes from my partner's perspective and wishes.",
  "My partner and I try to avoid quarrels.",
  "When we disagree, we argue loudly.",
  "Our conflicts usually last for a long time.",
  "Conflicts with my partner cause me distress.",
  "When we have a conflict, I verbally attack my partner.",
  "When conflicts arise, we take a break to cool down.",
  "When we fight, I try to gain the upper hand.",
  "In conflicts, I usually go along with my partner's opinion."
];

export function normalizeOpenAiResults(flatResults) {
  console.log("Normalizing results:", flatResults);
  
  // First, sort by Order to maintain message sequence
  const sortedResults = [...flatResults].sort((a, b) => a.Order - b.Order);
  
  // Group messages by Person
  const grouped = {};
  for (const entry of sortedResults) {
    const { Person, Message } = entry;
    if (!Person || !Message) {
      console.log("Skipping invalid entry:", entry);
      continue;
    }

    if (!grouped[Person]) {
      grouped[Person] = [];
    }
    grouped[Person].push(Message);
  }

  const result = Object.entries(grouped).map(([Person, Messages]) => ({
    Person,
    Messages
  }));
  
  console.log("Normalized results:", result);
  return result;
}

function Analysis() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate(); 
  const userDocId = searchParams.get("userDocId");
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzingPersonality, setAnalyzingPersonality] = useState(false);
  const [localScores, setLocalScores] = useState({});
  const [gottmanAnalysis, setGottmanAnalysis] = useState(null);
  const [analyzingGottman, setAnalyzingGottman] = useState(false);

  useEffect(() => {
    if (userData?.personalityAnalysis) {
      setLocalScores(userData.personalityAnalysis);
    }
    
    // If gottmanAnalysis exists in userData, set it to state
    if (userData?.gottmanAnalysis) {
      console.log("Loading existing Gottman analysis:", userData.gottmanAnalysis);
      setGottmanAnalysis(userData.gottmanAnalysis);
    }
  }, [userData]);

  // Force an immediate analysis if needed
  const triggerAnalysis = async () => {
    if (Object.keys(localScores).length >= 2) {
      console.log("Manually triggering Gottman analysis");
      const analysis = await analyzeConflictTypes(localScores);
      console.log("Manual analysis result:", analysis);
      setGottmanAnalysis(analysis);
    } else {
      console.log("Not enough data to perform analysis");
    }
  };

  const handleScoreChange = async (person, questionIndex, newValue) => {
    const currentScores = localScores[person]?.scores || Array(CONFLICT_QUESTIONS.length).fill(3);
    
    const updatedScores = {
      ...localScores,
      [person]: {
        ...localScores[person],
        scores: currentScores.map((score, idx) => 
          idx === questionIndex ? parseInt(newValue) : score
        )
      }
    };
    setLocalScores(updatedScores);
    
    try {
      const userDocRef = doc(db, "users", userDocId);
      await updateDoc(userDocRef, {
        [`personalityAnalysis.${person}`]: {
          ...localScores[person],
          scores: updatedScores[person].scores
        },
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error updating score:", error);
    }
  };

  const handleStartClick = async () => {
    try {
      const userDocRef = doc(db, "users", userDocId);
      
      // Save scores for each person separately
      const updatePromises = Object.entries(localScores).map(async ([person, analysis]) => {
        await updateDoc(userDocRef, {
          [`personalityAnalysis.${person}`]: {
            scores: analysis.scores
          },
          updatedAt: serverTimestamp()
        });
        console.log(`Scores saved for ${person}`);
      });

      // Wait for all updates to complete
      await Promise.all(updatePromises);
      
      console.log("All scores saved successfully");
      
      // Navigate to recommendation page without analyzing here
      navigate(`/recommendation?userDocId=${userDocId}`);
    } catch (error) {
      console.error("Error saving analysis results:", error);
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
          
          // Load gottman analysis if available
          if (data.gottmanAnalysis) {
            setGottmanAnalysis(data.gottmanAnalysis);
          }
          
          if (data.openAiResults && (!data.personalityAnalysis || Object.keys(data.personalityAnalysis || {}).length === 0)) {
            setAnalyzingPersonality(true);
            console.log("Analyzing conflict resolution scores...");
            await processAllPersonalityAnalyses(userDocId, data.openAiResults);
            
            const updatedUserDoc = await getDoc(userDocRef);
            if (updatedUserDoc.exists()) {
              setUserData(updatedUserDoc.data());
            }
            setAnalyzingPersonality(false);
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

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  if (analyzingPersonality) {
    return (
      <Container className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
        <h3 className="mb-4">Analyzing conversation...</h3>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Analyzing...</span>
        </Spinner>
      </Container>
    );
  }

  if (!userData) {
    return <Container className="mt-5"><h3>User data not found</h3></Container>;
  }

  return (
    <Container className="py-5">
      <h3 className="mb-3">Conflict Resolution Analysis</h3>
      
      {localScores && Object.keys(localScores).length > 0 ? (
        <Row>
          {Object.entries(localScores)
            .sort(([personA], [personB]) => {
              // 'Me'는 항상 마지막(오른쪽)에 오도록 정렬
              if (personA === 'Me') return 1;
              if (personB === 'Me') return -1;
              return 0;
            })
            .map(([person, analysis]) => {
            const scores = analysis?.scores || Array(CONFLICT_QUESTIONS.length).fill(3);
            return (
              <Col md={6} className="mb-4" key={person}>
                <Card>
                  <Card.Header 
                    as="h5" 
                    className="p-2" 
                    style={{ 
                      backgroundColor: person === 'Me' ? '#D4F4FF' : '#FFD4D4',
                      border: 'none'
                    }}
                  >
                    {person}
                  </Card.Header>
                  <Card.Body style={{ maxHeight: '500px', overflowY: 'auto' }}>
                    {CONFLICT_QUESTIONS.map((q, idx) => (
                      <div key={q} className="mb-3">
                        <div style={{ fontSize: 14, marginBottom: '8px' }}>{idx + 1}. {q}</div>
                        <div className="d-flex align-items-center">
                          <input
                            type="range"
                            min={1}
                            max={5}
                            value={scores[idx]}
                            onChange={(e) => handleScoreChange(person, idx, e.target.value)}
                            style={{ width: "100%", margin: '0 10px' }}
                          />
                          <span style={{ minWidth: '20px', textAlign: 'right', fontSize: 14 }}>
                            {scores[idx]}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between", color: '#666' }}>
                          <span>Strongly disagree</span>
                          <span>Strongly agree</span>
                        </div>
                      </div>
                    ))}
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
        </Row>
      ) : (
        <p>No conflict resolution analysis available</p>
      )}

      <Button onClick={handleStartClick} className="mt-3 w-100">Start</Button>
    </Container> 
  );
}

export async function analyzeConflictScores(person, messages, allPeople) {
  console.log(`Analyzing scores for ${person} with ${messages.length} messages:`, messages);
  
  const prompt = `You are a conflict resolution analysis system. Analyze the following chat messages and rate the participant's conflict resolution style.

Your task is to rate "${person}" on ${CONFLICT_QUESTIONS.length} conflict resolution questions, based on their chat messages.
Assign a score from 1 (Strongly disagree) to 5 (Strongly agree) for each question.

IMPORTANT: You must respond ONLY with a JSON object containing scores array. No other text, no explanations.
Example response format:
{"scores":[3,4,4,2,5,3,1,2,2,1,4,2,5]}

Questions to rate:
${CONFLICT_QUESTIONS.map((q, i) => `${i+1}. ${q}`).join('\n')}

Chat messages to analyze:
${messages.join('\n')}

Remember: Respond ONLY with the JSON object containing the scores array. No other text.`;

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
            content: 'You are a JSON-only response system. Only output valid JSON objects containing scores array. No other text.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3 
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid API response structure');
    }

    const content = data.choices[0].message.content.trim();
    console.log(`Raw API response for ${person}:`, content);

    try {
      // Try to parse the response directly first
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.scores) || parsed.scores.length !== CONFLICT_QUESTIONS.length) {
        throw new Error('Invalid scores array');
      }
      return parsed.scores;
    } catch (parseError) {
      // If direct parsing fails, try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }
      const extracted = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(extracted.scores) || extracted.scores.length !== CONFLICT_QUESTIONS.length) {
        throw new Error('Invalid scores array in extracted JSON');
      }
      return extracted.scores;
    }
  } catch (error) {
    console.error(`Error analyzing ${person}:`, error);
    // Return default scores in case of error
    return Array(CONFLICT_QUESTIONS.length).fill(3);
  }
}

export async function storePersonalityAnalysis(userDocId, person, analysis) {
  const userDocRef = doc(db, "users", userDocId);
  try {
    await updateDoc(userDocRef, {
       [`personalityAnalysis.${person}`]: analysis,
       updatedAt: serverTimestamp()
    });
    console.log(`Conflict scores for ${person} saved.`);
  } catch (error) {
    console.error(`Error saving conflict scores for ${person}:`, error);
  }
}

export async function processAllPersonalityAnalyses(userDocId, openAiResults) {
  console.log("Processing personality analyses with:", openAiResults);
  
  // Normalize the results first
  const normalizedResults = normalizeOpenAiResults(openAiResults);
  console.log("Normalized results:", normalizedResults);
  
  // Create a new object to store all analyses
  const analyses = {};
  
  // Process each person's messages sequentially
  for (const { Person, Messages } of normalizedResults) {
    if (!Messages || Messages.length === 0) {
      console.log(`No messages for ${Person}`);
      continue;
    }
    
    try {
      console.log(`Processing ${Person}'s messages:`, Messages);
      const scores = await analyzeConflictScores(Person, Messages, normalizedResults.map(p => p.Person));
      console.log(`Generated scores for ${Person}:`, scores);
      
      // Store scores in the analyses object
      analyses[Person] = { scores };
    } catch (error) {
      console.error(`Failed to analyze ${Person}:`, error);
      analyses[Person] = { scores: Array(CONFLICT_QUESTIONS.length).fill(3) };
    }
  }
  
  // Save all analyses to Firebase in a single update
  try {
    console.log("Saving all analyses:", analyses);
    const userDocRef = doc(db, "users", userDocId);
    await updateDoc(userDocRef, {
      personalityAnalysis: analyses,
      updatedAt: serverTimestamp()
    });
    console.log("All analyses saved successfully");
  } catch (error) {
    console.error("Failed to save analyses:", error);
    
    for (const [person, analysis] of Object.entries(analyses)) {
      try {
        const userDocRef = doc(db, "users", userDocId);
        await updateDoc(userDocRef, {
          [`personalityAnalysis.${person}`]: analysis,
          updatedAt: serverTimestamp()
        });
        console.log(`Saved analysis for ${person}:`, analysis);
      } catch (saveError) {
        console.error(`Failed to save analysis for ${person}:`, saveError);
      }
    }
  }
  
  return analyses;
}

export default Analysis;