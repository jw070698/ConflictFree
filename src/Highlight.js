import React, { useState, useEffect, useCallback } from 'react';
import { Form, Alert, Spinner } from 'react-bootstrap';
import { FaInfoCircle } from 'react-icons/fa';
import './Highlight.css';

const Highlight = ({ 
  inputValue, 
  setInputValue, 
  onSend, 
  apiKey,
  disabled = false 
}) => {
  const [highlightedInput, setHighlightedInput] = useState('');
  const [isYouLanguage, setIsYouLanguage] = useState(false);
  const [iLanguageSuggestion, setILanguageSuggestion] = useState('');
  const [checkingLanguage, setCheckingLanguage] = useState(false);
  const [youLanguageWords, setYouLanguageWords] = useState([]);

  // Function to check for you-language in input
  const checkForYouLanguage = useCallback(async (text) => {
    if (text.trim() === "" || text.length < 5) {
      setIsYouLanguage(false);
      setHighlightedInput('');
      setILanguageSuggestion('');
      setYouLanguageWords([]);
      return;
    }
    
    setCheckingLanguage(true);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are an AI that helps identify "you-language" in communication and suggests "I-language" alternatives.
              
              "You-language" involves statements that blame or criticize the other person directly using "you" statements, like "You never listen to me" or "You always make me wait."
              
              "I-language" focuses on expressing feelings using "I" statements, like "I feel unheard when my concerns aren't addressed" or "I feel frustrated when I have to wait."
              
              Analyze the input and identify if it contains you-language. If it does, provide:
              1. The original text with <mark></mark> HTML tags around the you-language parts
              2. A suggested I-language alternative
              3. A list of specific you-language words or phrases detected (comma-separated)`
            },
            {
              role: 'user',
              content: `Analyze this message: "${text}"`
            }
          ],
          temperature: 0.3
        })
      });

      const data = await response.json();
      console.log(data.choices);
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const content = data.choices[0].message.content;
        
        // Extract if it contains you-language
        const containsYouLanguage = content.toLowerCase().includes('yes') || 
                                   content.toLowerCase().includes('contains you-language') ||
                                   content.includes('<mark>');
        
        if (containsYouLanguage) {
          // Extract the marked text
          const markedTextMatch = content.match(/<mark>(.*?)<\/mark>/g);
          let highlightedText = text;
          let detectedWords = [];
          
          if (markedTextMatch) {
            // Extract the detected phrases
            detectedWords = markedTextMatch.map(match => 
              match.replace('<mark>', '').replace('</mark>', '')
            );
            
            // Apply highlights
            markedTextMatch.forEach(match => {
              const plainText = match.replace('<mark>', '').replace('</mark>', '');
              highlightedText = highlightedText.replace(
                new RegExp(plainText, 'g'), 
                `<span class="you-language-highlight">${plainText}</span>`
              );
            });
          }
          
          // Look for explicit word list
          if (content.includes('you-language words:')) {
            const wordListMatch = content.match(/you-language words:\s*(.*?)(?:\.|$)/i);
            if (wordListMatch && wordListMatch[1]) {
              const words = wordListMatch[1].split(',').map(word => word.trim());
              detectedWords = [...new Set([...detectedWords, ...words])];
            }
          }
          
          // Extract I-language suggestion
          let suggestion = '';
          if (content.includes('I-language alternative:')) {
            suggestion = content.split('I-language alternative:')[1].trim();
          } else if (content.includes('I-language suggestion:')) {
            suggestion = content.split('I-language suggestion:')[1].trim();
          } else if (content.includes('Suggested alternative:')) {
            suggestion = content.split('Suggested alternative:')[1].trim();
          } else if (content.includes('Alternative:')) {
            suggestion = content.split('Alternative:')[1].trim();
          }
          
          // Remove any quotation marks if they exist
          suggestion = suggestion.replace(/^"(.*)"$/, '$1').trim();
          setIsYouLanguage(true);
          setHighlightedInput(highlightedText);
          //setILanguageSuggestion(suggestion);
          setYouLanguageWords(detectedWords);
        } else {
          setIsYouLanguage(false);
          setHighlightedInput('');
          //setILanguageSuggestion('');
          setYouLanguageWords([]);
        }
      }
    } catch (error) {
      console.error("Error checking for you-language:", error);
      setIsYouLanguage(false);
      setHighlightedInput('');
      //setILanguageSuggestion('');
      setYouLanguageWords([]);
    }
    
    setCheckingLanguage(false);
  }, [apiKey]);
  
  // Real-time highlighting without waiting for API
  const highlightInRealTime = useCallback((text) => {
    if (!youLanguageWords.length) return text;
    
    let highlighted = text;
    youLanguageWords.forEach(word => {
      if (word && word.trim()) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        highlighted = highlighted.replace(regex, 
          `<span class="you-language-highlight">${word}</span>`
        );
      }
    });
    
    return highlighted;
  }, [youLanguageWords]);
  
  // Update highlighted text in real-time
  useEffect(() => {
    if (youLanguageWords.length > 0) {
      setHighlightedInput(highlightInRealTime(inputValue));
      setIsYouLanguage(true);
    }
  }, [inputValue, youLanguageWords, highlightInRealTime]);
  
  // Debounce the input for you-language checking with API
  useEffect(() => {
    const debounceTimeout = setTimeout(() => {
      checkForYouLanguage(inputValue);
    }, 800); // Adjust debounce time as needed
    
    return () => clearTimeout(debounceTimeout);
  }, [inputValue, checkForYouLanguage]);

  // Handler for sending the message
  const handleSend = () => {
    if (inputValue.trim() === "" || disabled) return;
    onSend();
  };

  return (
    <div className="d-flex w-100 align-items-center">
      <div style={{ flex: 1, position: 'relative' }}>
        {isYouLanguage && iLanguageSuggestion && (
          <div className="i-language-suggestion">
            <Alert variant="warning" className="py-1 px-2 mb-1">
              <small>
                <FaInfoCircle className="me-1" /> Consider starting your message with "I" to communicate more effectively.
              </small>
            </Alert>
          </div>
        )}
        <Form.Control
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type your message..."
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{ 
            fontSize: '1rem', 
            borderRadius: '.25rem', 
            background: 'transparent', 
            color: 'transparent', 
            caretColor: '#212529', 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            zIndex: 2 
          }}
          disabled={disabled}
        />
        <div 
          style={{ 
            pointerEvents: 'none', 
            color: '#212529', 
            fontSize: '1rem', 
            borderRadius: '.25rem', 
            padding: '0.375rem 0.75rem', 
            minHeight: '38px', 
            background: 'none', 
            position: 'relative', 
            zIndex: 1,
            border: '1px solid #ced4da',
            borderRadius: '.25rem'
          }}
          dangerouslySetInnerHTML={{ __html: isYouLanguage ? highlightedInput : inputValue }}
        />
      </div>
      <button 
        className="btn btn-primary ms-2" 
        onClick={handleSend}
        style={{ borderRadius: '.25rem', padding: '0.375rem 0.75rem' }}
        disabled={checkingLanguage || disabled}
      >
        {checkingLanguage ? <Spinner animation="border" size="sm" /> : 'Send'}
      </button>
    </div>
  );
};

export default Highlight; 