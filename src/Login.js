import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Card, Form, Button, Spinner } from 'react-bootstrap';
import app from "./firebase";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

const db = getFirestore(app);

function Login() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!userId || !email) {
      setError('Please fill out all fields.');
      return;
    }
    setIsLoggingIn(true);
    setError('');
    try {
      const docRef = await addDoc(collection(db, "users"), {
        userId: userId,
        email: email,
        createdAt: serverTimestamp()
      });
      console.log("User document created with ID:", docRef.id);
      navigate(`/Input?userDocId=${docRef.id}`);
    } catch (err) {
      console.error("Error creating user:", err);
      setError('An error occurred during login.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <Container 
      fluid 
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f8f9fa' }}
    >
      <Card className="p-4 shadow-sm" style={{ width: "100%", maxWidth: "400px" }}>
        <h3 className="mb-4 text-center">Login</h3>
        <Form onSubmit={handleLogin}>
          <Form.Group className="mb-3">
            <Form.Label>User ID</Form.Label>
            <Form.Control 
              type="text" 
              placeholder="Enter user ID" 
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Email</Form.Label>
            <Form.Control 
              type="email" 
              placeholder="Enter email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Form.Group>
          {error && <p className="text-danger">{error}</p>}
          <Button variant="primary" type="submit" className="w-100" disabled={isLoggingIn}>
            {isLoggingIn ? <Spinner animation="border" size="sm" /> : "Login"}
          </Button>
        </Form>
      </Card>
    </Container>
  );
}

export default Login;

