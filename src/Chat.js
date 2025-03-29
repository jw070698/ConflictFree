import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { env } from 'process';
import { ChatFeed, Message } from 'react-chat-ui';
import { CAlert } from '@coreui/react'
import { getInputValueAsString } from '@mui/base/unstable_useNumberInput/useNumberInput';
import { getFirestore, doc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import app from "./firebase";
//import OpenAI from "openai";
//const openai = new OpenAI(apikey:env.OPENAI_API);

function Chat() {
    const [searchParams] = useSearchParams(); 
    const userDocId = searchParams.get("userDocId"); // 로그인 페이지에서 전달된 user 문서 ID
    console.log("userid:", userDocId)
    /*const prompt = "Let's do a role-play, there is ${PeopleNum} people in ${Relationship} relationship, user want to solve ${SpecificProblem}\
                    You can give me message one by one of number of people in this format.\
                    Person's name or role: speech";
    const [messages, setMessages] = useState([
        { role: "system", content: "You are a role-play expert." },
        { role: "user", content: prompt, },]);*/
    const [Messages, setMessages] = useState([]); // Message from API
    const [inputValue, setInputValue] = useState(""); // Message from users
    const [alertMessage, setAlertMessage] = useState(""); // Feedback on users' chat 
    const [showQuestionAlert, setShowQuestionAlert] = useState(false); // Alert when clicking ? button
    // Generate many messages as the number of people
    /*useEffect(() => {
        const generatedMessages = [];
        for (let i = 0; i < PeopleNum; i++) {
            generatedMessages.push(
                new Message({ id: i % 2, senderName: `Person ${i + 1}`, message: `Hi, I am Person ${i + 1}` })
            );
        }
        setMessages(generatedMessages);
    }, [PeopleNum]);*/
    // Users' messages
    /*const handleSendMessage = () => {
        if(inputValue.trim() != ""){
            const newMessage = new Message({
                id: Messages.length % 2,
                senderName: "Me",
                message: inputValue,
            });
            setMessages((prevMessages) => [...prevMessages, newMessage]);
            setInputValue("");
        }
    }*/
    // Generate feedbacks on users' chat if the sentence includes 'You' and 'Previously'
    /*const handleInputChange = (e) => {
        const text = e.target.value;
        setInputValue(e.target.value);
        let alerts = [];
        const keywordChecks = [
            { word: "previously", message: "Focus on present" },
            { word: "not", message: "Use positive words" },
            { word: "you", message: "Use 'I' statements to efficient conflict resolution" }
        ];
        keywordChecks.forEach(({ word, message }) => {
            if (text.includes(word)) {
                alerts.push(message);
            }
        });
        setAlertMessage(alerts.join("\n"));
    };*/
    // To be able to send messages by key pressing
    /*const handleKeyPress = (e) => {
        if(e.key === 'Enter'){
            handleSendMessage();
        }
    }
    const handleQuestionMessage = () => {
        setShowQuestionAlert(true);
        setTimeout(() => {
            setShowQuestionAlert(false);
        }, 3000);
    };
    return(
        <div style={{ display: 'flex', justifyContent: 'center', height: '95vh', margin: 10, }}>
            <div style={{
                width: '60%', maxWidth: '700px', padding: '20px', borderRadius: '15px',
                backgroundColor: 'white', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
                border: '1px solid #ccc',
            }}>
                <p>Number of People: {PeopleNum}</p>
                <p>Relationship Type: {Relationship}</p>
                <p>Specific problem: {SpecificProblem}</p>
                <ChatFeed
                    messages={Messages}
                    isTyping={false}
                    hasInputField={false}
                    showSenderName
                    bubblesCentered={true}
                    bubbleStyles={
                        {text: {fontsize: 70}, chatbubble: {borderRadius: 40, padding: 10}}}
                />
                <div style={{ marginTop: 300, position: 'relative'}}>
                    <div className="input-container" style={{ position: 'relative', width: '100%' }}>
                        <textarea
                            value={inputValue}
                            onChange={handleInputChange}
                            onKeyPress={handleKeyPress}
                            placeholder="Type your message..."
                            style={{ 
                                width: '100%',
                                paddingRight: 80,
                                borderRadius: 20,
                                border: '1px solid #ccc',
                                resize: 'none',
                                minHeight: 20,
                                maxHeight: 100,
                                top: 10,
                                left: 70,
                                backgroundColor: 'transparent',
                                color: 'transparent',
                            }}
                        />
                        <div style={{
                                position: 'absolute',
                                top: 5,
                                left: 10,
                                right: 80,
                                pointerEvents: 'none',
                                whiteSpace: 'pre-wrap',
                                wordWrap: 'break-word'
                            }}>
                            {inputValue.split(/(\byou\b|\bpreviously\b|\bnot\b)/gi).map((part, index) => {
                                const lowerPart = part.toLowerCase();
                                if (lowerPart === 'you') {
                                    return <mark key={index} style={{ backgroundColor: 'yellow', padding: 0 }}>{part}</mark>;
                                }
                                else if (lowerPart === 'previously') {
                                    return <mark key={index} style={{ backgroundColor: 'red', color: 'white', padding: 0 }}>{part}</mark>;
                                }
                                else if (lowerPart === 'not'){
                                    return <mark key={index} style={{ backgroundColor: 'purple', color: 'white', padding: 0 }}>{part}</mark>;
                                }
                                return part;
                            })}
                        </div>
                        <div style={{ position: 'absolute', bottom: 60, color: 'red', whiteSpace: 'pre-line' }}>{alertMessage}</div>
                        <button onClick={handleSendMessage}
                                style={{position: 'absolute',
                                top: 5.5,
                                right: 10,
                                height: '70%',
                                padding: '0 20px',
                                borderRadius: 20,
                                border: 'none',
                                backgroundColor: '#7BC97B',
                                color: 'white',
                                cursor: 'pointer',}}>
                            Send
                        </button>
                    </div>
                </div>
            </div>
            <div style={{ position: 'relative', left: 10, top: 640}}>
                {showQuestionAlert ? (
                    <CAlert color="warning" style={{ 
                            padding: '10px 20px',
                            borderRadius: '20px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            margin: 0
                    }}> 
                        Take a deep breath for 3 seconds.
                    </CAlert>) : (
                    <button 
                        onClick={handleQuestionMessage}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '20px',
                            border: 'none',
                            backgroundColor: '#F5A623',
                            color: 'white',
                            cursor: 'pointer'
                    }}>
                        ?
                    </button>
                )}
            </div>
        </div>
    );*/
}

export default Chat;
