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
  const [Relationship, setRelationship] = useState('');
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
  
  const handleRelationshipSelect = (eventKey) => {
    setRelationship(eventKey);
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
      Relationship &&
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

  const processImagesAndSendToOpenAI = async () => {
    setIsLoading(true);
    try {
      // OCR (Tesseract.js)
      const texts = await Promise.all(
        files.map(async (fileObj) => {
          const { data: { text } } = await Tesseract.recognize(fileObj.file, 'eng');
          return text;
        })
      );
      const combinedText = texts.join("\n\n");
      console.log("Extracted Text:", combinedText);

      // Prompt: relationship + text ver. of images
      const prompt = `Analyze the following chat conversation extracted from screenshots, which occurred in a "${Relationship}" context.
                      Identify the participants in the conversation and group the messages they each sent.
                      - If the sender cannot be identified clearly from the context or the image, assume the message was sent by "Me".
                      - If a participant appears multiple times with the same name or identifier, group all their messages under a single entry.
                      - Make sure to include every message found in the screenshots — do not skip or summarize.
                      Please respond exclusively in the following JSON format without any additional commentary or text:
                      \n
                      Output format: 
                      [
                        {
                          "Person": "Me",
                          "Messages": ["Message", "Message", "Message", ...]
                        },
                        {
                          "Person": "[Name or Identifier]",
                          "Messages": ["Message", "Message", "Message", ...]
                        }
                        // ... more participants if any
                      ]
                      \n
                      Here is the conversation text:
                      ${combinedText}`;

      // OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json();
      const analysis = data.choices[0].message.content;
      console.log("Result from OpenAI:", analysis);
      const parsed = JSON.parse(analysis.replace(/```json|```/g, '').trim());
      setOpenAiConversation(parsed);
      setIdentifiedPeople(parsed.map(p => p.Person));
      } catch (error) {
        console.error("Error processing images and sending to OpenAI:", error);
      } finally {
        setIsLoading(false);
      }
    };

  const handleStartClick = async () => {
    if (isFormValid()) {
      await updateDoc(doc(db, "users", userDocId), {
        relationship: Relationship,
        openAiResults: openAiConversation,
        renamedPeople: renamedPeople,
        conflictDescription: SpecificProblem,
        createdAt: serverTimestamp()
      });
      navigate(`/chat?userDocId=${userDocId}`);
    } else {
      alert("Please fill out all fields before proceeding.");
    }
  };

  return (
    <Container fluid style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "#f8f9fa" }}>
        <Card className="p-4 shadow-sm" style={{ width: "100%", maxWidth: "700px" }}>
        <h4 className="mb-4">Simulation Setup</h4>

        {/* Relationship */}
        <Form.Group as={Row} className="mb-3 align-items-center">
          <Form.Label column sm={4} >Select a relationship</Form.Label>
          <Col sm={4} style={{ padding: 0 }}>
            <DropdownButton
              id="dropdown-relationship"
              title={Relationship || "Choose Relationship"}
              onSelect={handleRelationshipSelect}
              size="sm"
              style={{ margin: 0, padding: 0 }}
            >
              <Dropdown.Item eventKey="Friendship">Friendship</Dropdown.Item>
              <Dropdown.Item eventKey="Romantic Relationship">Romantic Relationship</Dropdown.Item>
              <Dropdown.Item eventKey="Family">Family</Dropdown.Item>
            </DropdownButton>
          </Col>
        </Form.Group>

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

        {/* Start Button */}
        <Button onClick={handleStartClick} disabled={!isFormValid()} variant="primary" className="mt-3 w-100">
          Let's Start
        </Button>
      </Card>
    </Container>
  );
}

export default Input;
