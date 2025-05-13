import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Form, Button, Container, Row, Col, Card, Alert, Accordion, Spinner, Badge, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import app from "./firebase";
import { ChatFeed, Message } from 'react-chat-ui';
import { FaInfoCircle, FaLightbulb, FaSyncAlt } from 'react-icons/fa';
import Highlight from './Highlight';
import './Real.css';

const db = getFirestore(app);

function Real() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const userDocId = searchParams.get("userDocId");
    const [userData, setUserData] = useState(null);
    const [conversation, setConversation] = useState([]);
    const [inputValue, setInputValue] = useState("");
    const [loadingResponses, setLoadingResponses] = useState(false);
    const senderIdMap = React.useRef({});
    const nextId = React.useRef(1);
    const [partnerName, setPartnerName] = useState('Partner');
    const [conflictScenario, setConflictScenario] = useState('');
    const [resetPoints, setResetPoints] = useState([]);
    const [loadingResetPoints, setLoadingResetPoints] = useState(false);
    const [resetCount, setResetCount] = useState(0);
    const [practiceChat, setPracticeChat] = useState([]);
    const [relevantPracticeMessages, setRelevantPracticeMessages] = useState([]);
    const [currentConversationContext, setCurrentConversationContext] = useState('');
    const [duringRecommendations, setDuringRecommendations] = useState([]);
    
    // Refs for scrolling
    const practiceChatRef = useRef(null);
    const highlightedMessagesRefs = useRef({});

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
              // Partner gender is available
            }
            
            // Use the same scenario from practice
            if (data.conflictScenario) {
              setConflictScenario(data.conflictScenario);
            }
            
            if (data.openAiResults && Array.isArray(data.openAiResults)) {
              const partnerEntry = data.openAiResults.find(entry => entry.Person !== "Me");
              if (partnerEntry) {
                setPartnerName(partnerEntry.Person);
              }
            }
            
            // Set during-conflict recommendations if available
            if (data.communicationRecommendations && Array.isArray(data.communicationRecommendations.whenItHappens)) {
              setDuringRecommendations(data.communicationRecommendations.whenItHappens);
            }
            
            // Load existing real chat history if available
            if (data.realChatHistory && Array.isArray(data.realChatHistory) && data.realChatHistory.length > 0) {
              console.log("Loading existing real chat history:", data.realChatHistory.length, "messages");
              setConversation(data.realChatHistory);
            }
            // If no real chat history exists, try to load the practice chat history
            else if (data.chatHistory && Array.isArray(data.chatHistory) && data.chatHistory.length > 0) {
              console.log("Loading practice chat history:", data.chatHistory.length, "messages");
              setConversation(data.chatHistory);
              
              // Copy the practice chat history to realChatHistory
              await updateDoc(userDocRef, {
                realChatHistory: data.chatHistory,
                updatedAt: serverTimestamp()
              });
            } else {
              // Start with a fresh conversation
              setConversation([]);
            }

            // Load practice chat history for reference
            if (data.chatHistory && Array.isArray(data.chatHistory)) {
              setPracticeChat(data.chatHistory);
            }

            // Load reset count if available
            if (data.resetCount !== undefined) {
              setResetCount(data.resetCount);
            }
            
            // Create a real conversation entry in Firebase
            await updateDoc(userDocRef, {
              realConversationStarted: true,
              realConversationStartTime: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
        }
        fetchUserData();
    }, [userDocId]);

    // Generate initial message if conversation is empty
    useEffect(() => {
        async function generateInitialMessage() {
            // Only generate if conversation is empty
            if (conversation.length === 0 && conflictScenario && partnerName) {
                setLoadingResponses(true);
                try {
                    const initialResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                                    content: `You are ${partnerName}, in a romantic relationship. This is a REAL conversation about the following scenario: ${conflictScenario}.
                                    
                                    You need to start the conversation naturally, as if this is the first time you're bringing up this topic.
                                    Keep your opening message(s) short, natural and conversational - like text messages.
                                    You can separate multiple thoughts with |||.`
                                },
                                { 
                                    role: 'user', 
                                    content: `Please start a conversation about this scenario: "${conflictScenario}". 
                                    Remember to keep it natural, as if you're the partner in this relationship bringing up the topic for the first time.` 
                                }
                            ],
                            temperature: 0.8
                        })
                    });
                    
                    const data = await initialResponse.json();
                    const messageContent = data.choices[0].message.content.trim();
                    
                    // Split and process messages
                    const messageParts = messageContent.split('|||');
                    const aiMessages = messageParts
                        .map(part => part.trim())
                        .filter(part => part.length > 0)
                        .map(text => ({
                            sender: partnerName,
                            text: text,
                            timestamp: new Date().toISOString()
                        }));
                    
                    // Add messages to conversation with slight delay between them
                    for (const message of aiMessages) {
                        setConversation(prev => [...prev, message]);
                        await saveMessage(message);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } catch (error) {
                    console.error("Error generating initial message:", error);
                }
                setLoadingResponses(false);
            }
        }
        generateInitialMessage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation.length, conflictScenario, partnerName]);

    async function saveMessage(messageObj) {
        if (!userDocId) return;
        try {
          await updateDoc(doc(db, "users", userDocId), {
            realChatHistory: arrayUnion(messageObj),
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          console.error("Error saving message to Firebase:", err);
        }
    }

    async function getAIResponseForPartner() {
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
                content: `You are ${partnerName}, in a romantic relationship. This is a REAL conversation about the following scenario: ${conflictScenario}. 
                
                Respond as a human would, keeping messages short and conversational. If the user sends short or negative responses, acknowledge them appropriately.
                
                IMPORTANT: Keep your responses realistic. Do not suggest meeting outside of this chat.`
              },
              { 
                role: 'user', 
                content: `Here's our conversation so far:
                ${conversation.map(msg => `${msg.sender}: ${msg.text}`).join('\n')}
                
                Please provide your next message as ${partnerName}. Keep it short and natural - like a text message. You can separate multiple thoughts with |||.` 
              }
            ],
            temperature: 0.8
          })
        });
        
        const data = await response.json();
        const aiMessageContent = data.choices[0].message.content.trim();
        
        // Split into multiple messages if needed
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
    
        setLoadingResponses(true);
        try {
            // Get response from partner
            const aiResponseTexts = await getAIResponseForPartner();
            
            // Process each response
            for (const responseText of aiResponseTexts) {
                const aiMessage = {
                    sender: partnerName,
                    text: responseText,
                    timestamp: new Date().toISOString()
                };
                // Add slight delay between messages
                await new Promise(resolve => setTimeout(resolve, 500));
                setConversation(prev => [...prev, aiMessage]);
                await saveMessage(aiMessage);
            }
        } catch (error) {
            console.error(`Error generating AI response:`, error);
        }
        setLoadingResponses(false);
    };

    const handleFinishConversation = async () => {
      if (window.confirm("Are you sure you want to end this conversation?")) {
        try {
          if (userDocId) {
            await updateDoc(doc(db, "users", userDocId), {
              realConversationCompleted: true,
              realConversationEndTime: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
          
          alert("Thank you for completing the conversation!");
          // Navigate back to main page or another destination
          navigate("/");
        } catch (error) {
          console.error("Error ending conversation:", error);
        }
      }
    };

    // Function to analyze conversation and recommend reset points
    const analyzeConversationForResetPoints = async () => {
        if (conversation.length < 3) {
            // Not enough conversation to analyze
            setResetPoints([]);
            return;
        }

        setLoadingResetPoints(true);
        try {
            console.log("Analyzing conversation for reset points...");
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
                            content: `You are an AI relationship coach analyzing a conversation between partners about this scenario: "${conflictScenario}".
                            Your task is to identify the 3 best points in the conversation where they might want to reset and try a different approach.
                            These should be critical moments where the conversation could have gone in a better direction.
                            IMPORTANT: ONLY identify reset points for messages sent by "Me", not from ${partnerName}.`
                        },
                        {
                            role: 'user',
                            content: `Here's the conversation:
                            ${conversation.map(msg => `${msg.sender}: ${msg.text}`).join('\n')}
                            
                            Please identify the 3 best reset points from "Me" in this conversation, with a brief explanation of why each would be good for resetting.
                            Format your response exactly like this:
                            RESET_POINT_1: [message text to reset from]
                            REASON_1: [brief explanation]
                            
                            RESET_POINT_2: [message text to reset from]
                            REASON_2: [brief explanation]
                            
                            RESET_POINT_3: [message text to reset from]
                            REASON_3: [brief explanation]`
                        }
                    ],
                    temperature: 0.7
                })
            });

            const data = await response.json();
            if (data.choices && data.choices[0] && data.choices[0].message) {
                const content = data.choices[0].message.content;
                console.log("API Response:", content);
                
                // Parse the response to extract reset points and reasons
                const resetPointsData = [];
                
                // Extract RESET_POINT and REASON pairs - more flexible pattern
                const lines = content.split('\n');
                let currentPoint = null;
                let currentReason = null;
                
                for (const line of lines) {
                    const resetPointMatch = line.match(/RESET_POINT_\d+:\s*(.*)/i);
                    const reasonMatch = line.match(/REASON_\d+:\s*(.*)/i);
                    
                    if (resetPointMatch) {
                        currentPoint = resetPointMatch[1].trim();
                    } else if (reasonMatch && currentPoint) {
                        currentReason = reasonMatch[1].trim();
                        
                        // Find the message in conversation
                        const messageIndex = findMessageIndexInConversation(currentPoint);
                        
                        if (messageIndex !== -1) {
                            resetPointsData.push({
                                index: messageIndex,
                                messageText: currentPoint,
                                reason: currentReason,
                                sender: conversation[messageIndex].sender
                            });
                        }
                        
                        // Reset for next pair
                        currentPoint = null;
                        currentReason = null;
                    }
                }
                
                console.log("Parsed reset points:", resetPointsData);
                setResetPoints(resetPointsData);
            } else {
                console.error("Invalid API response format:", data);
            }
        } catch (error) {
            console.error("Error analyzing conversation for reset points:", error);
        }
        setLoadingResetPoints(false);
    };
    
    // Helper function to find message index in conversation
    const findMessageIndexInConversation = (messageText) => {
        // Try exact match first
        let index = conversation.findIndex(msg => msg.text === messageText);
        
        // If no exact match, try partial match (first 15 chars)
        if (index === -1 && messageText.length > 15) {
            const searchText = messageText.substring(0, 15);
            index = conversation.findIndex(msg => msg.text.includes(searchText));
        }
        
        // If still no match, try an even more lenient approach
        if (index === -1) {
            // Split into words and look for messages containing at least 2 consecutive words
            const words = messageText.split(/\s+/).filter(word => word.length > 3);
            if (words.length >= 2) {
                for (let i = 0; i < conversation.length; i++) {
                    const msgText = conversation[i].text;
                    // Look for at least 2 consecutive important words
                    for (let j = 0; j < words.length - 1; j++) {
                        if (msgText.includes(words[j]) && msgText.includes(words[j+1])) {
                            return i;
                        }
                    }
                }
            }
        }
        
        return index;
    };

    // Update reset points when conversation changes
    useEffect(() => {
        if (conversation.length >= 3) {
            const debounceTimeout = setTimeout(() => {
                analyzeConversationForResetPoints();
            }, 1500); // increased debounce time
            
            return () => clearTimeout(debounceTimeout);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation]);

    // Save reset points to Firebase whenever they change
    useEffect(() => {
        async function saveResetPointsToFirebase() {
            if (!userDocId || resetPoints.length === 0) return;
            
            try {
                await updateDoc(doc(db, "users", userDocId), {
                    realConversationResetPoints: resetPoints.map(point => ({
                        index: point.index,
                        messageText: point.messageText,
                        reason: point.reason,
                        sender: point.sender,
                        timestamp: new Date().toISOString()
                    })),
                    updatedAt: serverTimestamp()
                });
                console.log("Reset points saved to Firebase");
            } catch (error) {
                console.error("Error saving reset points to Firebase:", error);
            }
        }
        
        saveResetPointsToFirebase();
    }, [resetPoints, userDocId]);

    // Add manual refresh button for recommendations
    const handleRefreshRecommendations = () => {
        if (conversation.length >= 3) {
            analyzeConversationForResetPoints();
        }
    };

    // Function to reset conversation to a specific point
    const handleResetToPoint = async (index) => {
        if (window.confirm("Are you sure you want to reset the conversation to this point? All messages after this point will be removed.")) {
            // Get the message that's being reset from
            const resetMessage = conversation[index];
            
            const newConversation = conversation.slice(0, index);
            setConversation(newConversation);
            
            // Increment reset count
            const newResetCount = resetCount + 1;
            setResetCount(newResetCount);
            
            if (userDocId) {
                try {
                    // Update the conversation, reset count, and log the reset action
                    await updateDoc(doc(db, "users", userDocId), {
                        realChatHistory: newConversation,
                        resetCount: newResetCount,
                        resetActions: arrayUnion({
                            resetIndex: index,
                            resetMessage: resetMessage.text,
                            timestamp: new Date().toISOString(),
                            conversationLength: conversation.length,
                            resetReason: getResetPointReason(index) || "User initiated reset"
                        }),
                        updatedAt: serverTimestamp()
                    });
                } catch (error) {
                    console.error("Error updating conversation in Firebase:", error);
                }
            }
        }
    };

    // Helper function to check if message is a reset point
    const isResetPoint = (messageIndex) => {
        // First check if this message is from "Me"
        if (conversation[messageIndex]?.sender !== "Me") {
            return false;
        }
        return resetPoints.some(point => point.index === messageIndex);
    };

    // Helper function to get reset point reason
    const getResetPointReason = (messageIndex) => {
        const resetPoint = resetPoints.find(point => point.index === messageIndex);
        return resetPoint ? resetPoint.reason : null;
    };

    // Replace the "Load full message history" useEffect with comparison logic
    const getSignificantDifferences = () => {
        // If practice chat is empty, return an empty array
        if (!practiceChat || practiceChat.length === 0) {
            return [];
        }
        
        // Simple comparison to see which messages are different
        const currentTexts = conversation.map(msg => msg.text);
        
        // Return messages from practice that aren't in the current conversation
        return practiceChat.filter(msg => !currentTexts.includes(msg.text));
    };

    // Helper function to find relevant practice messages
    const updateRelevantPracticeMessages = async () => {
        if (conversation.length === 0 || practiceChat.length === 0) {
            setRelevantPracticeMessages([]);
            return;
        }
        
        // Get the last 3 messages from the current conversation as context
        const recentMessages = conversation.slice(-3);
        const contextString = recentMessages.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
        
        // If context hasn't changed, don't recalculate
        if (contextString === currentConversationContext) {
            return;
        }
        
        setCurrentConversationContext(contextString);
        
        // Filter practice messages to only include "Me" messages
        const myPracticeMessages = practiceChat.filter(msg => msg.sender === "Me");
        
        if (myPracticeMessages.length === 0) {
            setRelevantPracticeMessages([]);
            return;
        }
        
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
                            content: `You're helping find the most relevant previous messages from a practice conversation that match the current conversation context. 
                            
                            Current conversation context:
                            ${contextString}
                            
                            You need to select up to 3 most relevant "Me" messages from the practice conversation that would be most helpful to the user now.
                            Consider similarity in topic, sentiment, and conversation flow. Focus on finding messages that could help the user better navigate the current point in conversation.`
                        },
                        {
                            role: 'user',
                            content: `Here are all "Me" messages from the practice conversation:
                            ${myPracticeMessages.map((msg, idx) => `[${idx}] ${msg.text}`).join('\n')}
                            
                            Return the indices of the 1-3 most relevant messages in this format:
                            INDICES: [index numbers separated by commas]
                            
                            If none are particularly relevant, return:
                            INDICES: []`
                        }
                    ],
                    temperature: 0.3
                })
            });
            
            const data = await response.json();
            
            if (data.choices && data.choices[0] && data.choices[0].message) {
                const content = data.choices[0].message.content;
                const match = content.match(/INDICES:\s*\[(.*?)\]/);
                
                if (match && match[1]) {
                    // Parse indices
                    const indices = match[1].split(',').map(idx => idx.trim()).filter(idx => idx !== '');
                    const relevantIndices = indices.map(idx => parseInt(idx, 10)).filter(idx => !isNaN(idx) && idx >= 0 && idx < myPracticeMessages.length);
                    
                    // Get relevant messages
                    const relevantMessages = relevantIndices.map(idx => myPracticeMessages[idx]);
                    setRelevantPracticeMessages(relevantMessages);
                } else {
                    setRelevantPracticeMessages([]);
                }
            }
        } catch (error) {
            console.error("Error finding relevant practice messages:", error);
            setRelevantPracticeMessages([]);
        }
    };
    
    // Update relevant messages when conversation changes
    useEffect(() => {
        const debounceTimeout = setTimeout(() => {
            updateRelevantPracticeMessages();
        }, 2000);
        
        return () => clearTimeout(debounceTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation, practiceChat]);

    // Effect to scroll to highlighted message when relevant messages change
    useEffect(() => {
        // Wait a brief moment for the DOM to update
        const scrollTimeout = setTimeout(() => {
            if (relevantPracticeMessages.length > 0 && practiceChatRef.current) {
                // Try to find the first highlighted message
                const firstRelevantMsg = relevantPracticeMessages[0];
                
                // Find the index of this message in the full practice chat
                const msgIndex = practiceChat.findIndex(msg => 
                    msg.sender === "Me" && 
                    msg.text === firstRelevantMsg.text && 
                    msg.timestamp === firstRelevantMsg.timestamp
                );
                
                if (msgIndex !== -1 && highlightedMessagesRefs.current[msgIndex]) {
                    highlightedMessagesRefs.current[msgIndex].scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
            }
        }, 300);
        
        return () => clearTimeout(scrollTimeout);
    }, [relevantPracticeMessages, practiceChat]);

    // Effect to highlight reset points in the chat
    useEffect(() => {
        // Wait for the DOM to update
        const highlightTimeout = setTimeout(() => {
            // Find all the chat bubbles - they typically have a class like 'chat-bubble' or similar
            const chatFeedContainer = document.querySelector('.chat-feed-container');
            if (!chatFeedContainer) return;
            
            // Reset all previous highlights
            const previousHighlights = chatFeedContainer.querySelectorAll('.message-bubble-reset-point');
            previousHighlights.forEach(el => {
                el.classList.remove('message-bubble-reset-point');
            });
            
            // Find all message bubbles for "Me" and add highlighting to those that are reset points
            const messageBubbles = chatFeedContainer.querySelectorAll('.bubble');
            const resetIndices = resetPoints
                .filter(point => point.sender === "Me")
                .map(point => point.index);
            
            // Add a dashed yellow border to chat bubbles at reset point indices
            messageBubbles.forEach((bubble, idx) => {
                // Check if this bubble represents a reset point
                if (resetIndices.includes(idx)) {
                    // Apply the highlighting class
                    bubble.classList.add('message-bubble-reset-point');
                    
                    // Alternatively, we can add an after pseudo-element with CSS
                    const wrapper = document.createElement('div');
                    wrapper.classList.add('chat-bubble-reset');
                    
                    // Replace the original bubble with our wrapped version
                    bubble.parentNode.insertBefore(wrapper, bubble);
                    wrapper.appendChild(bubble);
                }
            });
        }, 500);
        
        return () => clearTimeout(highlightTimeout);
    }, [resetPoints, conversation]);

    // Layout
    return (
      <Container fluid className="py-4 mb-5" style={{ minHeight: '100vh' }}>
        <div className="text-center mb-1">
          <h4>Simulated Conversation</h4>
          <div className="scenario-container mx-auto py-2 px-3 my-1 border-start border-3 border-primary rounded-end bg-light bg-opacity-50" style={{ maxWidth: '90%', textAlign: 'left', fontSize: '0.9rem' }}>
            <span className="text-primary fw-bold me-1">Scenario:</span>
            <span style={{ lineHeight: '1.4' }}>{conflictScenario}</span>
          </div>
          <div className="mx-auto py-3 px-4 mt-2 mb-3 rounded-3 shadow-sm" style={{ maxWidth: '90%', textAlign: 'left', fontSize: '0.9rem', lineHeight: '1.5', backgroundColor: '#fff3cd', color: 'black' }}>
            <div className="d-flex align-items-start">
              <FaInfoCircle className="me-2 mt-1" />
              <div>
                <strong>Instructions:</strong> This conversation is based on your practice dialogue. You can either select reset points to restart from that point or continue the conversation without resetting.
              </div>
            </div>
          </div>
        </div>
        <Row>
          {/* Left Sidebar */}
          <Col md={3}>
            <div className="left-panel-container">
              <Card className="reset-points-card side-panel-card">
                <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
                  <strong>3 Recommended Reset Points</strong>
                </Card.Header>
                <Card.Body className="reset-points-scrollable">
                  {loadingResetPoints ? (
                    <div className="text-center p-3">
                      <Spinner animation="border" variant="primary" size="sm" />
                      <p className="mt-2 small text-muted">Analyzing conversation...</p>
                    </div>
                  ) : resetPoints.length > 0 ? (
                    <Accordion defaultActiveKey="0" flush>
                      {resetPoints.map((point, idx) => (
                        <Accordion.Item eventKey={idx.toString()} key={idx}>
                          <Accordion.Header>
                            <small className={`${point.sender === 'Me' ? 'text-primary' : 'text-success'}`}>
                              {idx + 1}. {point.messageText}
                            </small>
                          </Accordion.Header>
                          <Accordion.Body>
                            <p className="small text-muted">{point.reason}</p>
                            <div className="d-grid gap-2">
                              <Button 
                                variant="outline-primary" 
                                size="sm" 
                                onClick={() => handleResetToPoint(point.index)}
                              >
                                Reset Here
                              </Button>
                            </div>
                          </Accordion.Body>
                        </Accordion.Item>
                      ))}
                    </Accordion>
                  ) : conversation.length >= 3 ? (
                    <div className="text-center p-3">
                      <p className="text-muted small">No specific reset points identified yet.</p>
                      <Button 
                        variant="outline-primary" 
                        size="sm" 
                        onClick={handleRefreshRecommendations}
                        disabled={loadingResetPoints}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center p-3">
                      <p className="text-muted small">Need at least 3 messages for reset point analysis.</p>
                    </div>
                  )}
                </Card.Body>
              </Card>

              {/* Recommendations for continuing the conversation */}
              <Card className="tips-card side-panel-card">
                <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
                  <strong>Communication Tips</strong>
                </Card.Header>
                <Card.Body className="tips-scrollable">
                  {duringRecommendations && duringRecommendations.length > 0 ? (
                    <ul className="mb-0 ps-3 small">
                      {duringRecommendations.map((tip, idx) => (
                        <li key={idx} className="mb-2">
                          {tip && tip.includes(":") ? (
                            <>
                              <strong className="text-primary">{tip.split(":")[0].trim()}</strong>: {tip.split(":")[1].trim()}
                            </>
                          ) : tip}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small text-muted">
                      No recommendations available.
                    </p>
                  )}
                </Card.Body>
              </Card>
            </div>
          </Col>

          {/* Chat Center */}
          <Col md={6} className="chat-column">
            {/* Scenario display */}
            {/*
            <Card className="w-100 mb-3 border-primary border-top-0 border-end-0 border-bottom-0 border-3 mt-4" style={{ borderRadius: '0.75rem' }}>
              <Card.Body className="py-3">
                <div className="d-flex align-items-center">
                  <div>
                    <small className="text-primary fw-bold">Scenario: </small>
                    <p className="mb-0 mt-1 px-2">{conflictScenario}</p>
                  </div>
                </div>
              </Card.Body>
            </Card>
            */}
            <div className="flex-grow-1 w-100 mb-3" style={{ minHeight: 400, maxHeight: 700, overflowY: 'auto' }}>
              {/* Chat with Reset Points */}
              <div className="chat-feed-container">
                <ChatFeed
                  messages={conversation.map((msg, idx) => {
                    const uniqueId = getParticipantId(msg.sender);
                    
                    // Check if this message is a reset point
                    const isReset = isResetPoint(idx);
                    let customMessage = msg.text;
                    
                    // Add Reset Here button to all "Me" messages
                    if (msg.sender === "Me") {
                      customMessage = (
                        <div className={`message-box-wrapper ${isReset ? "reset-point-container" : ""}`} style={{ position: 'relative', overflow: 'visible'}}>
                            {/* 메시지 내용 */}
                            {msg.text}

                            {/* 버튼 */}
                            <span style={{ display: 'block', marginTop: '4px', textAlign: 'right' }}>
                            {isReset ? (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                  <Button 
                                      size="sm" 
                                      variant="warning" 
                                      onClick={() => handleResetToPoint(idx)}
                                      style={{ 
                                          fontSize: '0.7em', 
                                          padding: '2px 6px',
                                          fontWeight: 'bold'
                                      }}
                                  >
                                      Reset From Here
                                  </Button>
                                  <OverlayTrigger
                                  placement="right"
                                  overlay={
                                      <Tooltip id={`reset-reason-${idx}`}>
                                      {getResetPointReason(idx)}
                                      </Tooltip>
                                  }
                                  >
                                      <FaSyncAlt
                                      style={{
                                      marginLeft: '5px',
                                      backgroundColor: '#ffc107', 
                                      color: 'white',
                                      borderRadius: '50%',
                                      padding: '4px',
                                      fontSize: '20px',
                                      zIndex: 10
                                      }}
                                      />
                                  </OverlayTrigger>
                                </div>
                            ) : (
                              <Button 
                                  size="sm" 
                                  variant="warning" 
                                  onClick={() => handleResetToPoint(idx)}
                                  style={{ 
                                    fontSize: '0.7em', 
                                    padding: '2px 6px',
                                    fontWeight: 'normal'
                                  }}
                              >
                                  Reset From Here
                              </Button>
                            )}
                            </span>
                        </div>
                      );
                    }
                    
                    return new Message({
                      id: uniqueId,
                      senderName: msg.sender,
                      message: customMessage,
                      data: { isResetPoint: isReset && msg.sender === "Me" }
                    });
                  })}
                  isTyping={loadingResponses}
                  hasInputField={false}
                  showSenderName
                  bubbleStyles={{
                    text: {
                      fontSize: '1rem',
                    },
                    chatbubble: {
                      borderRadius: 10,
                      padding: 10,
                      marginTop: 0,
                      marginBottom: 2
                    }
                  }}
                />
              </div>
            </div>
            
            {/* 입력 영역 */}
            <div className="chat-input-area">
              <div className="d-flex w-100 align-items-center">
                <Highlight
                  inputValue={inputValue}
                  setInputValue={setInputValue}
                  onSend={handleSendMessage}
                  apiKey={process.env.REACT_APP_OPENAI_API_KEY}
                  disabled={loadingResponses}
                />
              </div>
              
              {/* Bottom buttons */}
              <div className="d-flex justify-content-center mt-2">
                <Button 
                  variant="outline-success" 
                  style={{ borderRadius: '.25rem', padding: '0.375rem 1.5rem' }}
                  onClick={handleFinishConversation}
                  disabled={loadingResponses}
                >
                  Finish Conversation
                </Button>
              </div>
            </div>
          </Col>

          {/* Right Sidebar */}
          <Col md={3}>
            <div className="panel-container">
              {/* Practice Chat History Section */}
              <Card className="mb-3 side-panel-card" style={{ height: "calc(100vh)", overflowY: "auto" }}>
                <Card.Header className="bg-primary text-white d-flex align-items-center" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <strong>Original Conversation</strong>
                  <OverlayTrigger
                    placement="bottom"
                    overlay={
                      <Tooltip id="conversation-info-tooltip" style={{ maxWidth: '300px' }}>
                        Highlighted messages may be relevant to your current conversation. As you chat, we'll identify messages from your practice that could be helpful now.
                      </Tooltip>
                    }
                  >
                    <div className="ms-2">
                      <FaInfoCircle className="text-white" style={{ fontSize: '0.9rem', cursor: 'pointer' }} />
                    </div>
                  </OverlayTrigger>
                </Card.Header>
                <Card.Body className="p-1" ref={practiceChatRef} style={{ overflow: "auto", maxHeight: "calc(100vh - 60px)" }}>
                  {/* Full Practice Chat History with highlighted relevant messages */}
                  {practiceChat.length > 0 ? (
                    <div className="p-1">
                      <div className="chat-container py-1">
                        {practiceChat.map((msg, idx) => {
                          // Check if this message is relevant (only for "Me" messages)
                          const isRelevant = msg.sender === "Me" && 
                            relevantPracticeMessages.some(relevantMsg => 
                              relevantMsg.text === msg.text && 
                              relevantMsg.timestamp === msg.timestamp
                            );
                          
                          return (
                            <div 
                              key={idx}
                              className={`d-flex mb-3 ${msg.sender === 'Me' ? 'justify-content-end' : 'justify-content-start'}`}
                              ref={el => {
                                if (isRelevant) {
                                  highlightedMessagesRefs.current[idx] = el;
                                }
                              }}
                            >
                              <div 
                                className={`message-bubble p-2 px-3 rounded-3 ${
                                  msg.sender === 'Me' 
                                    ? 'bg-primary bg-opacity-10 text-primary' 
                                    : 'bg-success bg-opacity-10 text-success'
                                } ${isRelevant ? 'relevant-highlight relevant-message' : ''}`}
                                style={{maxWidth: '85%'}}
                              >
                                {isRelevant && (
                                  <div className="lightbulb-icon">
                                    <FaLightbulb />
                                  </div>
                                )}
                                <div className="small fw-bold mb-1">
                                  {msg.sender}
                                </div>
                                <div className="message-text">
                                  {msg.text}
                                </div>
                                <div className="message-time text-muted">
                                  {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 text-center text-muted">
                      <small>No practice chat history available</small>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </div>
          </Col>
        </Row>
      </Container>
    );
}

export default Real; 