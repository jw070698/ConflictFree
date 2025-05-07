import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Row, Col, Form, Card, Button, Spinner } from 'react-bootstrap';
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
//import NumericInput from 'react-numeric-input';
import { ReactSortable } from 'react-sortablejs';
import Tesseract from 'tesseract.js';
import 'bootstrap/dist/css/bootstrap.min.css';
import app from "./firebase";
import { getFirestore, collection, doc, updateDoc, serverTimestamp } from "firebase/firestore";
const db = getFirestore(app);

function Input() {
  const [PeopleNum, setPeopleNum] = useState(0);
  const [names, setNames] = useState(['']);
  const [Gender, setGender] = useState('');
  const [PartnerGender, setPartnerGender] = useState('');
  const [SpecificProblem, setSpecificProblem] = useState('');
  const [files, setFiles] = useState([]);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [openAiConversation, setOpenAiConversation] = useState([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userDocId = searchParams.get("userDocId");
  const [identifiedPeople, setIdentifiedPeople] = useState([]);
  const [renamedPeople, setRenamedPeople] = useState({});
  
  const handleGenderSelect = (eventKey) => {
    setGender(eventKey);
  };

  const handlePartnerGenderSelect = (eventKey) => {
    setPartnerGender(eventKey);
  };

  const updatePeopleNum = (num) => {
    setPeopleNum(num);
    const updatedNames = [...names];
    while (updatedNames.length < num) updatedNames.push('');
    while (updatedNames.length > num) updatedNames.pop();
    setNames(updatedNames);
  };

  const handleNameChange = (index, value) => {
    const updatedNames = [...names];
    updatedNames[index] = value;
    setNames(updatedNames);
  };

  const handleImgChange = (index, e) => {
    const updatedFiles = [...files];
    updatedFiles[index] = URL.createObjectURL(e.target.files[0]);
    setFiles(updatedFiles);
  };

  const isFormValid = () => {
    return (
      Gender &&
      isConfirmed &&
      SpecificProblem.trim() !== ""
    );
  };
  
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });

  {/* OCR & Summary */}
  const processImagesAndSendToOpenAI = async () => {
    setIsLoading(true);
    try {
      const imageContents = await Promise.all(
        files.map(async (fileObj) => {
          const file = fileObj.file;
          const reader = new FileReader();
          return new Promise((resolve, reject) => {
            reader.onload = () => {
              const base64 = reader.result.split(',')[1];
              resolve({
                type: "image_url",
                image_url: {
                  url: `data:${file.type};base64,${base64}`
                }
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        })
      );
      // Prompt: text ver. of images
      //- If a participant sends multiple messages in a row with the same name or identifier, group all their messages under a single entry.
      const introPrompt = {
        type: "text",
        text: `You will be shown a series of chat screenshots.
               Identify the participants in the conversation and group the messages they each sent.
               - If the sender is on the right side of the screen or if the sender cannot be identified clearly from the context or the image, assume the message was sent by "Me".
               - Make sure to include every message found in the screenshots (do not skip or summarize).
               Please respond exclusively in the following JSON format without any additional commentary or text: Extract **every single message** as its own entry, in the **exact order it appeared** in the original chat.  
               For each message, include:
               - "Person": the name or identifier of the person who sent it. Messages with "Side": "right" are sent by "Me". Messages with "Side": "left" are sent by someone else.
               - "Message": the exact text of the message.
               - "Order": a number representing the chronological order (starting from 1, increasing by 1).

               Output format: 
               [
                {
                  "Person": "Me",
                  "Message": "Can anyone find the shared word document?",
                  "Order": 1
                },
                {
                  "Person": "Y",
                  "Message": "Yeah we haven't written anything on conclusion and future work.",
                  "Order": 2
                },
                ...
                ]`};
      
      const messages = [
        {
          role: "user",
          content: [introPrompt, ...imageContents]
        }
      ];

      // OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages,
          max_tokens: 4000
        }),
      });
      const result = await response.json();
      const rawOutput = result.choices[0].message.content;
      const cleaned = rawOutput.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setOpenAiConversation(parsed);
      console.log(parsed)

      const uniquePeople = Array.from(new Set(parsed.map(entry => entry.Person)));
      setIdentifiedPeople(uniquePeople);

    // Summary
    const summaryPrompt = `
      Based on the following chat messages, briefly summarize (1-2 sentences) what the core conflict between each participant(${uniquePeople.join(', ')}) seems to be.
      Messages:
      ${JSON.stringify(parsed, null, 2)}
    `;
    const summaryRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: summaryPrompt }],
      }),
    });
    const summaryJson = await summaryRes.json();
    const summaryText = summaryJson.choices[0].message.content.trim();

    // textarea
    setSpecificProblem(summaryText);

  } catch (error) {
    console.error("Error processing images or sending to OpenAI:", error);
  } finally {
    setIsLoading(false);
  }
};

  const handleStartClick = async () => {
    if (isFormValid()) {
      const renamedConversation = openAiConversation.map((entry) => ({
        ...entry,
        Person: renamedPeople[entry.Person] || entry.Person
      }));

      await updateDoc(doc(db, "users", userDocId), {
        gender: Gender,
        partnerGender: PartnerGender,
        openAiResults: renamedConversation,
        conflictDescription: SpecificProblem,
        createdAt: serverTimestamp()
      });
      navigate(`/analysis?userDocId=${userDocId}`);
    } else {
      alert("Please fill out all fields before proceeding.");
    }
  };

  return (
    <Container fluid style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "#f8f9fa" }}>
        <Card className="p-4 shadow-sm" style={{ width: "100%", maxWidth: "700px" }}>
        <h4 className="mb-4">Simulation Setup</h4>

        {/* Upload Screenshots */}
        <Form.Group className="mb-4">
        <Form.Label>Upload screenshots of messages with people you want to include in the simulation</Form.Label>
        <Form.Control
          type="file"
          accept="image/*"
          multiple
          disabled={isConfirmed} // No upload after clicking confirmed button
          onChange={(e) => {
            const fileArray = Array.from(e.target.files).map(file => ({file, preview: URL.createObjectURL(file)}));
            setFiles(prevFiles => [...prevFiles, ...fileArray]);
          }}
        />

        {/* Sortable & Removable */}
        {!isConfirmed? (
          <ReactSortable className="d-flex flex-wrap gap-2 mt-3" tag="div" list={files} setList={setFiles} >
            {files.map((file, index) => (
              <div key={index} style={{ position: "relative", display: "inline-block" }}>
                <img
                  key={index}
                  data-id={index}
                  src={file.preview}
                  alt={`Uploaded preview ${index + 1}`}
                  className="rounded"
                  width="100"
                  style={{ cursor: 'move' }}
                />
              <button onClick={() => { setFiles(prev => prev.filter((_, i) => i !== index)); }}
                      style={{ position: "absolute", top: "0", right: "0", background: "rgba(255, 0, 0, 0.8)", border: "none", color: "white", borderRadius: "50%", width: "20px", height: "20px", cursor: "pointer", fontSize: "12px", lineHeight: "20px", textAlign: "center", padding: "0", }}>
                X
              </button>
              </div>
            ))}
          </ReactSortable>
        ) : (
          //
          <div className="d-flex flex-wrap gap-2 mt-3">
            {files.map((file, index) => (
              <div key={index} style={{ position: "relative", display: "inline-block" }}>
                <img
                  src={file.preview}
                  alt={`Uploaded preview ${index + 1}`}
                  className="rounded"
                  width="100"
                  style={{ cursor: 'default' }}
                />
              </div>
            ))}
          </div>
        )}
          <div className="d-flex justify-content-center mt-4">
            <Button variant="primary" size="sm" onClick={async ()=> {setIsConfirmed(true); await processImagesAndSendToOpenAI();}} disabled={isConfirmed}>
              Confirm Uploads
            </Button>
          </div>
          {/* Loading */}
          {isLoading && (
            <div className="d-flex justify-content-center align-items-center mt-3">
              <Spinner animation="border" role="status">
                <span className="visually-hidden">Loading...</span>
              </Spinner>
            </div>
          )}
          {/* People Number & Names */}
          {!isLoading && identifiedPeople.length > 0 && (
            <Card className="p-3 mt-4">
              <h6>Review Identified Participants</h6>
              <Form.Text className="mb-2 text-muted">
                If you want to rename any participant, enter the new name below.
              </Form.Text>

              {identifiedPeople.map((person, index) => (
                <Form.Group key={index} className="mb-3">
                  <Form.Label>Person {index + 1}: <strong>{person}</strong></Form.Label>
                  <Form.Control
                    type="text"
                    placeholder={person === "Me" ? "Cannot rename 'Me'" : "Enter new name (optional)"}
                    value={renamedPeople[person] || ''}
                    onChange={(e) =>
                      setRenamedPeople(prev => ({
                        ...prev,
                        [person]: e.target.value
                      }))
                    }
                    disabled={person === "Me"}
                  />
                </Form.Group>
              ))}
            </Card>
          )}
      </Form.Group>

        {/* Conflict Textarea */}
        <Form.Group className="mb-4">
          <Form.Label>Describe a conflict or situation to simulate</Form.Label>
          <Form.Control as="textarea" rows={3} value={SpecificProblem} onChange={(e) => setSpecificProblem(e.target.value)}/>
        </Form.Group>

        {/* Gender */}
        <Form.Group as={Row} className="mb-3 align-items-center">
          <Form.Label column sm={5}>Tell us a bit about yourself</Form.Label>
          <Col sm={3} style={{ padding: 0 }}>
            <DropdownButton
              id="dropdown-gender"
              title={Gender || "I identify as..."}
              onSelect={handleGenderSelect}
              size="sm"
            >
              <Dropdown.Item eventKey="She/Her">She/Her</Dropdown.Item>
              <Dropdown.Item eventKey="He/Him">He/Him</Dropdown.Item>
            </DropdownButton>
          </Col>
        </Form.Group>
        
        <Form.Group as={Row} className="mb-3 align-items-center">
          <Form.Label column sm={5}>Tell us about your partner</Form.Label>
          <Col sm={3} style={{ padding: 0 }}>
            <DropdownButton
              id="dropdown-partner-gender"
              title={PartnerGender || "My partner uses..."}
              onSelect={handlePartnerGenderSelect}
              size="sm"
              style={{ margin: 0, padding: 0 }}
            >
              <Dropdown.Item eventKey="She/Her">She/Her</Dropdown.Item>
              <Dropdown.Item eventKey="He/Him">He/Him</Dropdown.Item>
            </DropdownButton>
          </Col>
        </Form.Group>

        {/* Start Button */}
        <Button onClick={handleStartClick} disabled={!isFormValid()} variant="primary" className="mt-3 w-100">
          Let's Analyze
        </Button>
      </Card>
    </Container>
  );
}

export default Input;
