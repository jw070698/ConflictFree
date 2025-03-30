import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Form, Button } from 'react-bootstrap';
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import app from "./firebase";
import { ChatFeed, Message } from 'react-chat-ui';
import { processAllPersonalityAnalyses } from './Analysis';

const db = getFirestore(app);

function Chat() {
    const [searchParams] = useSearchParams(); 
    const userDocId = searchParams.get("userDocId"); // User ID
    console.log("userid:", userDocId)

    const [userData, setUserData] = useState(null);
    const [conversation, setConversation] = useState([]);
    const [inputValue, setInputValue] = useState("");
    const [loadingResponses, setLoadingResponses] = useState(false);

    const senderIdMap = React.useRef({});
    const nextId = React.useRef(1);

    // Mapping participants name and messages
    function getParticipantId(senderName) {
        if (senderIdMap.current[senderName] !== undefined) {
          return senderIdMap.current[senderName];
        }
        if (senderName === "Me") {
          senderIdMap.current[senderName] = 0; // "Me"=0
        } else {
          senderIdMap.current[senderName] = nextId.current++;
        }
        return senderIdMap.current[senderName];
      }

    // Data from firebase
    useEffect(() => {
        async function fetchUserData() {
          if (!userDocId) return;
          const userDocRef = doc(db, "users", userDocId);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(data);
            if (data.chatHistory) {
              setConversation(data.chatHistory);
            }
          }
        }
        fetchUserData();
      }, [userDocId]);
    
    // Store data into Firebase
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

    // Personality Analysis
    useEffect(() => {
        async function runAnalysis() {
        if (userDocId && userData && userData.openAiResults) {
            await processAllPersonalityAnalyses(userDocId, userData.openAiResults);
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
          // Firestore - Personality analysis
          const personality = userData?.personalityAnalysis ? userData.personalityAnalysis[participant] : null;
          const systemMessage = `You are ${participant}. Your personality traits are: ${personality ? personality.personalityTraits : "Not available"}. Your communication style is: ${personality ? personality.communicationStyle : "Not available"}. You are in a "${conflictDescription}" situation. Respond only with the style of text message.`;
          const initialPrompt = systemMessage;
  
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'gpt-4',
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
  

    // AI responses from participants except "me"
    async function getAIResponseForParticipant(participant) {
        const personality = userData?.personalityAnalysis ? userData.personalityAnalysis[participant] : null;
        const conflictDescription = userData?.conflictDescription || "No conflict description provided.";
        const conversationText = conversation.map(msg => `${msg.sender}: ${msg.text}`).join("\n");
        const prompt = `You are act as ${participant}. 
                        Your personality traits are: ${personality ? personality.personalityTraits : "Not available"}. 
                        Your communication style is: ${personality ? personality.communicationStyle : "Not available"}.
                        The conflict to resolve is: ${conflictDescription}.
                        The conversation so far is: ${conversationText}.
                        Please provide your next message as ${participant} in a natural, conversational tone. Respond only with the message text.`;
    
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

  // User's message as "me"
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

  return (
    <div style={{ padding: 20 }}>
      <h3>Simulation Chat</h3>
      <div style={{ marginBottom: 20 }}>
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
      <div className="d-flex">
        <Form.Control type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Type your message..." 
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendMessage();
                        }
                    }}
                    style={{ fontSize: '1rem', borderRadius: '.25rem' }}/>
        <Button variant="primary" onClick={handleSendMessage} className="ms-2" style={{ borderRadius: '.25rem', padding: '0.375rem 0.75rem' }}>
            Send
        </Button>
      </div>
    </div>
  );
}

export default Chat;