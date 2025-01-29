import './App.css';
import React, { useState } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
import 'bootstrap/dist/css/bootstrap.min.css';
import NumericInput from 'react-numeric-input';
import { Link } from 'react-router-dom';


function App() {
  const [PeopleNum, setPeopleNum] = useState(0);
  const [names, setNames] = useState(['']);
  const [Relationship, setRelationship] = useState('');
  const [SpecificProblem, setSpecificProblem] = useState('');
  const handleRelationshipSelect = (eventKey) => {
    setRelationship(eventKey);
  };
  const updatePeopleNum = (num) => {
    setPeopleNum(num);
    const updatedNames = [...names];
    while (updatedNames.length < num){
      updatedNames.push('');
    }
    while (updatedNames.length > num){
      updatedNames.pop();
    }
    setNames(updatedNames);
  }
  const handleNameChange = (index, value) => {
    const updatedNames = [...names];
    updatedNames[index] = value;
    setNames(updatedNames);
};

  return (
    <div style={{ margin: 10 }}>
      <a>Choose number of people </a>
      <NumericInput min={0} value={PeopleNum} onChange={setPeopleNum}/>
      <p>Name each person</p>
      {Array.from({ length: PeopleNum }).map((_, index) => (
        <div key={index} style={{ marginBottom: 10 }}>
          <label>
            Person {index + 1}:{' '}
            <input type="text" placeholder={`Person ${index+1}`} value={names[index]} onChange={(e) => handleNameChange(index, e.target.value)}/> 
          </label>
          <label>
            Person {index + 1}'s Personality
          </label>
        </div>
      ))}
      <hr/>
      <p>Choose relationships</p>
      <DropdownButton id="dropdown-relationship" title={Relationship || "Select a Relationship"} onSelect={handleRelationshipSelect}>
        <Dropdown.Item eventKey="Friendship">Friendship</Dropdown.Item>
        <Dropdown.Item eventKey="Romantic Relationship">Romantic Relationship</Dropdown.Item>
        <Dropdown.Item eventKey="Family">Family</Dropdown.Item>
      </DropdownButton>
      <hr/>
      <p>Is there any specific problem you want to solve?</p>
      <textarea name="SpecificProblem" rows={3} cols={50} onChange={(event) => setSpecificProblem(event.target.value)}/>
      <hr/>
      <Link to={`/Chat?PeopleNum=${PeopleNum}&Relationship=${Relationship}&SpecificProblem=${SpecificProblem}`}><button>Let's Start</button></Link>
    </div>
  );
}

export default App;
