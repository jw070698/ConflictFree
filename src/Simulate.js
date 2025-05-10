import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Container, Card, Row, Col, Spinner, Button } from 'react-bootstrap';
import app from "./firebase";

const db = getFirestore(app);       

function simulate() {
    const [searchParams] = useSearchParams();
    const userDocId = searchParams.get("userDocId");
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    
}

export default Simulate;