import React, { useState, useEffect, useCallback } from 'react';
import { Form, Alert, Spinner } from 'react-bootstrap';
import { FaInfoCircle, FaLightbulb } from 'react-icons/fa';
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
  
  // 강한 어조 관련 상태
  const [isStrongTone, setIsStrongTone] = useState(false);
  const [mildToneSuggestion, setMildToneSuggestion] = useState('');
  const [strongToneWords, setStrongToneWords] = useState([]);
  
  // 비난 없는 불평 관련 상태
  const [isBlaming, setIsBlaming] = useState(false);
  const [nonBlamingSuggestion, setNonBlamingSuggestion] = useState('');
  const [blamingWords, setBlamingWords] = useState([]);

  // 길게 말하기(Be Concise) 관련 상태
  const [isNotConcise, setIsNotConcise] = useState(false);
  const [conciseSuggestion, setConciseSuggestion] = useState('');
  const CONCISE_THRESHOLD = 150; // 글자 수 임계값 - 이 이상이면 길다고 판단
  
  // 긍정적인 시작(Starting with Positivity) 관련 상태
  const [isPositiveStart, setIsPositiveStart] = useState(false);
  const [positivitySuggestion, setPositivitySuggestion] = useState('');
  const [positiveStartPhrases, setPositiveStartPhrases] = useState([]);
  
  // 평가 없는 서술(Describing without Judging) 관련 상태
  const [hasJudgment, setHasJudgment] = useState(false);
  const [objectiveDescriptionSuggestion, setObjectiveDescriptionSuggestion] = useState('');
  const [judgmentalPhrases, setJudgmentalPhrases] = useState([]);
  
  // 합의 지향적(Working Towards Agreement) 관련 상태
  const [needsAgreement, setNeedsAgreement] = useState(false);
  const [agreementSuggestion, setAgreementSuggestion] = useState('');
  const [disagreementPhrases, setDisagreementPhrases] = useState([]);

  // Function to check for you-language and strong tone in input
  const checkLanguage = useCallback(async (text) => {
    if (text.trim() === "" || text.length < 5) {
      setIsYouLanguage(false);
      setHighlightedInput('');
      setILanguageSuggestion('');
      setYouLanguageWords([]);
      setIsStrongTone(false);
      setMildToneSuggestion('');
      setStrongToneWords([]);
      setIsBlaming(false);
      setNonBlamingSuggestion('');
      setBlamingWords([]);
      setIsNotConcise(false);
      setConciseSuggestion('');
      setIsPositiveStart(false);
      setPositivitySuggestion('');
      setPositiveStartPhrases([]);
      setHasJudgment(false);
      setObjectiveDescriptionSuggestion('');
      setJudgmentalPhrases([]);
      setNeedsAgreement(false);
      setAgreementSuggestion('');
      setDisagreementPhrases([]);
      return;
    }
    
    // 길이 체크 (Be Concise)
    if (text.length > CONCISE_THRESHOLD) {
      setIsNotConcise(true);
      setConciseSuggestion('Try to be more concise. Clear and brief messages are often more effective.');
    } else {
      setIsNotConcise(false);
      setConciseSuggestion('');
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
              content: `You are an AI that helps identify problematic language in communication and suggests better alternatives. Analyze for six types of issues:

              1. "You-language": Statements that blame or criticize the other person directly using "you" statements, like "You never listen to me" or "You always make me wait."
              
              2. "Strong tone": Words or phrases that sound harsh, accusatory, absolute, or emotionally charged, like "never", "always", "hate", "disaster", "terrible", "ridiculous", etc.
              
              3. "Blaming language": Statements that place blame, make accusations, or focus on what others did wrong rather than the speaker's feelings or needs. Examples: "This is all your fault", "You made me feel bad", "He ruined everything".
              
              4. "Starting with positivity": Check if the message starts with positive language or appreciation before addressing concerns. Detect if the beginning is neutral/negative when it could benefit from a positive opening.
              
              5. "Judgmental language": Identify phrases where the speaker is evaluating or judging events rather than describing them objectively. Look for evaluative adjectives, loaded terms, and subjective judgments that present opinions as facts. Example: "The meeting was terrible" (judgment) vs. "The meeting ran 30 minutes over time" (objective description).
              
              6. "Working towards agreement": Detect when language focuses on disagreement or is adversarial rather than seeking common ground and agreement. Look for statements that reject others' ideas, present rigid positions, or lack willingness to compromise. Example: "That will never work" vs. "I see your point, and we could try that approach with some modifications."
              
              For each type, provide:
              1. The original text with <mark-you></mark-you> HTML tags around the you-language parts, <mark-strong></mark-strong> tags around strong tone parts, <mark-blame></mark-blame> tags around blaming language, <mark-positive></mark-positive> tags around any positive opening that exists (or the first few words if there is no positive opening), <mark-judgment></mark-judgment> tags around judgmental phrases, and <mark-agreement></mark-agreement> tags around phrases that could be more agreement-focused
              2. A suggested "I-language" alternative for you-language
              3. A suggested milder tone alternative for strong tone
              4. A suggested way to "complain without blaming" alternative for blaming language
              5. A suggested positive opening if the message doesn't start positively
              6. A suggested objective description without judgment
              7. A suggested agreement-focused alternative
              8. Lists of specific detected words or phrases for each type (comma-separated)
              
              Format your response exactly as:
              YOU_LANGUAGE: yes/no
              MARKED_YOU_TEXT: original text with <mark-you> tags
              I_LANGUAGE_SUGGESTION: alternative text
              YOU_LANGUAGE_WORDS: word1, word2, etc.
              
              STRONG_TONE: yes/no
              MARKED_STRONG_TEXT: original text with <mark-strong> tags
              MILD_TONE_SUGGESTION: alternative text
              STRONG_TONE_WORDS: word1, word2, etc.
              
              BLAMING_LANGUAGE: yes/no
              MARKED_BLAME_TEXT: original text with <mark-blame> tags
              NON_BLAMING_SUGGESTION: alternative text
              BLAMING_WORDS: word1, word2, etc.
              
              POSITIVE_START: yes/no
              MARKED_POSITIVE_TEXT: original text with <mark-positive> tags
              POSITIVITY_SUGGESTION: alternative text with positive opening
              POSITIVE_START_PHRASES: phrases that are positive or could be made positive
              
              JUDGMENTAL_LANGUAGE: yes/no
              MARKED_JUDGMENT_TEXT: original text with <mark-judgment> tags
              OBJECTIVE_DESCRIPTION: alternative text describing without judging
              JUDGMENTAL_PHRASES: phrases that contain judgment or evaluation
              
              WORKING_TOWARDS_AGREEMENT: yes/no
              MARKED_AGREEMENT_TEXT: original text with <mark-agreement> tags
              AGREEMENT_SUGGESTION: alternative text suggesting agreement
              DISAGREEMENT_PHRASES: phrases that show disagreement or rigid positions`
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
      
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const content = data.choices[0].message.content;
        
        // 응답 파싱
        const hasYouLanguage = content.includes('YOU_LANGUAGE: yes');
        const hasStrongTone = content.includes('STRONG_TONE: yes');
        const hasBlaming = content.includes('BLAMING_LANGUAGE: yes');
        const hasPositiveStart = content.includes('POSITIVE_START: no'); // "no"일 때 긍정적 시작이 필요함
        const hasJudgmentalLanguage = content.includes('JUDGMENTAL_LANGUAGE: yes');
        const hasWorkingTowardsAgreement = content.includes('WORKING_TOWARDS_AGREEMENT: yes');
        
        // 초기화
        let highlightedText = text;
        let youDetectedWords = [];
        let strongDetectedWords = [];
        let blamingDetectedWords = [];
        let positiveStartDetectedPhrases = [];
        let judgmentalDetectedPhrases = [];
        let agreementDetectedPhrases = [];
        let disagreementDetectedPhrases = [];
        
        // You-language 처리
        if (hasYouLanguage) {
          // 마크된 텍스트 추출
          const markedYouText = content.match(/MARKED_YOU_TEXT:\s*(.*?)(?:\n|$)/i);
          if (markedYouText && markedYouText[1]) {
            // 마크된 단어 추출
            const youMarkedWords = markedYouText[1].match(/<mark-you>(.*?)<\/mark-you>/g);
            if (youMarkedWords) {
              youDetectedWords = youMarkedWords.map(match => 
                match.replace('<mark-you>', '').replace('</mark-you>', '')
              );
              
              // 하이라이트 적용
              youMarkedWords.forEach(match => {
                const plainText = match.replace('<mark-you>', '').replace('</mark-you>', '');
                highlightedText = highlightedText.replace(
                  new RegExp(plainText, 'g'), 
                  `<span class="you-language-highlight">${plainText}</span>`
                );
              });
            }
          }
          
          // You-language 단어 목록
          const youWordsList = content.match(/YOU_LANGUAGE_WORDS:\s*(.*?)(?:\n|$)/i);
          if (youWordsList && youWordsList[1]) {
            const words = youWordsList[1].split(',').map(word => word.trim());
            youDetectedWords = [...new Set([...youDetectedWords, ...words])];
          }
          
          // I-language 제안
          const iLanguageMatch = content.match(/I_LANGUAGE_SUGGESTION:\s*(.*?)(?:\n|$)/i);
          if (iLanguageMatch && iLanguageMatch[1]) {
            setILanguageSuggestion(iLanguageMatch[1].trim());
          }
          
          setIsYouLanguage(true);
          setYouLanguageWords(youDetectedWords);
        } else {
          setIsYouLanguage(false);
          setILanguageSuggestion('');
          setYouLanguageWords([]);
        }
        
        // Strong tone 처리
        if (hasStrongTone) {
          // 마크된 텍스트 추출
          const markedStrongText = content.match(/MARKED_STRONG_TEXT:\s*(.*?)(?:\n|$)/i);
          if (markedStrongText && markedStrongText[1]) {
            // 마크된 단어 추출
            const strongMarkedWords = markedStrongText[1].match(/<mark-strong>(.*?)<\/mark-strong>/g);
            if (strongMarkedWords) {
              strongDetectedWords = strongMarkedWords.map(match => 
                match.replace('<mark-strong>', '').replace('</mark-strong>', '')
              );
              
              // 하이라이트 적용
              strongMarkedWords.forEach(match => {
                const plainText = match.replace('<mark-strong>', '').replace('</mark-strong>', '');
                highlightedText = highlightedText.replace(
                  new RegExp(plainText, 'g'), 
                  `<span class="strong-tone-highlight">${plainText}</span>`
                );
              });
            }
          }
          
          // Strong-tone 단어 목록
          const strongWordsList = content.match(/STRONG_TONE_WORDS:\s*(.*?)(?:\n|$)/i);
          if (strongWordsList && strongWordsList[1]) {
            const words = strongWordsList[1].split(',').map(word => word.trim());
            strongDetectedWords = [...new Set([...strongDetectedWords, ...words])];
          }
          
          // Mild tone 제안
          const mildToneMatch = content.match(/MILD_TONE_SUGGESTION:\s*(.*?)(?:\n|$)/i);
          if (mildToneMatch && mildToneMatch[1]) {
            setMildToneSuggestion(mildToneMatch[1].trim());
          }
          
          setIsStrongTone(true);
          setStrongToneWords(strongDetectedWords);
        } else {
          setIsStrongTone(false);
          setMildToneSuggestion('');
          setStrongToneWords([]);
        }
        
        // Blaming language 처리
        if (hasBlaming) {
          // 마크된 텍스트 추출
          const markedBlameText = content.match(/MARKED_BLAME_TEXT:\s*(.*?)(?:\n|$)/i);
          if (markedBlameText && markedBlameText[1]) {
            // 마크된 단어 추출
            const blameMarkedWords = markedBlameText[1].match(/<mark-blame>(.*?)<\/mark-blame>/g);
            if (blameMarkedWords) {
              blamingDetectedWords = blameMarkedWords.map(match => 
                match.replace('<mark-blame>', '').replace('</mark-blame>', '')
              );
              
              // 하이라이트 적용
              blameMarkedWords.forEach(match => {
                const plainText = match.replace('<mark-blame>', '').replace('</mark-blame>', '');
                highlightedText = highlightedText.replace(
                  new RegExp(plainText, 'g'), 
                  `<span class="blaming-language-highlight">${plainText}</span>`
                );
              });
            }
          }
          
          // Blaming 단어 목록
          const blameWordsList = content.match(/BLAMING_WORDS:\s*(.*?)(?:\n|$)/i);
          if (blameWordsList && blameWordsList[1]) {
            const words = blameWordsList[1].split(',').map(word => word.trim());
            blamingDetectedWords = [...new Set([...blamingDetectedWords, ...words])];
          }
          
          // Non-blaming 제안
          const nonBlamingMatch = content.match(/NON_BLAMING_SUGGESTION:\s*(.*?)(?:\n|$)/i);
          if (nonBlamingMatch && nonBlamingMatch[1]) {
            setNonBlamingSuggestion(nonBlamingMatch[1].trim());
          }
          
          setIsBlaming(true);
          setBlamingWords(blamingDetectedWords);
        } else {
          setIsBlaming(false);
          setNonBlamingSuggestion('');
          setBlamingWords([]);
        }
        
        // Positive Start 처리
        if (hasPositiveStart) {
          // 마크된 텍스트 추출
          const markedPositiveText = content.match(/MARKED_POSITIVE_TEXT:\s*(.*?)(?:\n|$)/i);
          if (markedPositiveText && markedPositiveText[1]) {
            // 첫 부분 단어 추출 (긍정적이지 않은 시작 부분)
            const positiveMarkedPhrases = markedPositiveText[1].match(/<mark-positive>(.*?)<\/mark-positive>/g);
            if (positiveMarkedPhrases) {
              positiveStartDetectedPhrases = positiveMarkedPhrases.map(match => 
                match.replace('<mark-positive>', '').replace('</mark-positive>', '')
              );
              
              // 하이라이트 적용 (첫 부분에만 적용)
              const firstPhrase = positiveMarkedPhrases[0];
              if (firstPhrase) {
                const plainText = firstPhrase.replace('<mark-positive>', '').replace('</mark-positive>', '');
                // 첫 부분만 교체하기 위해 한 번만 교체
                const index = highlightedText.indexOf(plainText);
                if (index !== -1) {
                  highlightedText = 
                    highlightedText.substring(0, index) + 
                    `<span class="positive-start-highlight">${plainText}</span>` + 
                    highlightedText.substring(index + plainText.length);
                }
              }
            }
          }
          
          // Positive Start 단어/구문 목록
          const positiveStartPhrasesList = content.match(/POSITIVE_START_PHRASES:\s*(.*?)(?:\n|$)/i);
          if (positiveStartPhrasesList && positiveStartPhrasesList[1]) {
            const phrases = positiveStartPhrasesList[1].split(',').map(phrase => phrase.trim());
            positiveStartDetectedPhrases = [...new Set([...positiveStartDetectedPhrases, ...phrases])];
          }
          
          // Positivity 제안
          const positivityMatch = content.match(/POSITIVITY_SUGGESTION:\s*(.*?)(?:\n|$)/i);
          if (positivityMatch && positivityMatch[1]) {
            setPositivitySuggestion(positivityMatch[1].trim());
          }
          
          setIsPositiveStart(true);
          setPositiveStartPhrases(positiveStartDetectedPhrases);
        } else {
          setIsPositiveStart(false);
          setPositivitySuggestion('');
          setPositiveStartPhrases([]);
        }
        
        // Judgmental Language 처리
        if (hasJudgmentalLanguage) {
          // 마크된 텍스트 추출
          const markedJudgmentText = content.match(/MARKED_JUDGMENT_TEXT:\s*(.*?)(?:\n|$)/i);
          if (markedJudgmentText && markedJudgmentText[1]) {
            // 마크된 단어 추출
            const judgmentalMarkedPhrases = markedJudgmentText[1].match(/<mark-judgment>(.*?)<\/mark-judgment>/g);
            if (judgmentalMarkedPhrases) {
              judgmentalDetectedPhrases = judgmentalMarkedPhrases.map(match => 
                match.replace('<mark-judgment>', '').replace('</mark-judgment>', '')
              );
              
              // 하이라이트 적용
              judgmentalMarkedPhrases.forEach(match => {
                const plainText = match.replace('<mark-judgment>', '').replace('</mark-judgment>', '');
                highlightedText = highlightedText.replace(
                  new RegExp(plainText, 'g'), 
                  `<span class="non-judgmental-highlight">${plainText}</span>`
                );
              });
            }
          }
          
          // Judgmental 단어/구문 목록
          const judgmentalPhrasesList = content.match(/JUDGMENTAL_PHRASES:\s*(.*?)(?:\n|$)/i);
          if (judgmentalPhrasesList && judgmentalPhrasesList[1]) {
            const phrases = judgmentalPhrasesList[1].split(',').map(phrase => phrase.trim());
            judgmentalDetectedPhrases = [...new Set([...judgmentalDetectedPhrases, ...phrases])];
          }
          
          // Objective Description 제안
          const objectiveDescriptionMatch = content.match(/OBJECTIVE_DESCRIPTION:\s*(.*?)(?:\n|$)/i);
          if (objectiveDescriptionMatch && objectiveDescriptionMatch[1]) {
            setObjectiveDescriptionSuggestion(objectiveDescriptionMatch[1].trim());
          }
          
          setHasJudgment(true);
          setJudgmentalPhrases(judgmentalDetectedPhrases);
        } else {
          setHasJudgment(false);
          setObjectiveDescriptionSuggestion('');
          setJudgmentalPhrases([]);
        }
        
        // Working Towards Agreement 처리
        if (hasWorkingTowardsAgreement) {
          // 마크된 텍스트 추출
          const markedAgreementText = content.match(/MARKED_AGREEMENT_TEXT:\s*(.*?)(?:\n|$)/i);
          if (markedAgreementText && markedAgreementText[1]) {
            // 마크된 단어 추출
            const agreementMarkedPhrases = markedAgreementText[1].match(/<mark-agreement>(.*?)<\/mark-agreement>/g);
            if (agreementMarkedPhrases) {
              disagreementDetectedPhrases = agreementMarkedPhrases.map(match => 
                match.replace('<mark-agreement>', '').replace('</mark-agreement>', '')
              );
              
              // 하이라이트 적용
              agreementMarkedPhrases.forEach(match => {
                const plainText = match.replace('<mark-agreement>', '').replace('</mark-agreement>', '');
                highlightedText = highlightedText.replace(
                  new RegExp(plainText, 'g'), 
                  `<span class="agreement-highlight">${plainText}</span>`
                );
              });
            }
          }
          
          // Disagreement 단어/구문 목록
          const disagreementPhrasesList = content.match(/DISAGREEMENT_PHRASES:\s*(.*?)(?:\n|$)/i);
          if (disagreementPhrasesList && disagreementPhrasesList[1]) {
            const phrases = disagreementPhrasesList[1].split(',').map(phrase => phrase.trim());
            disagreementDetectedPhrases = [...new Set([...disagreementDetectedPhrases, ...phrases])];
          }
          
          // Agreement 제안
          const agreementMatch = content.match(/AGREEMENT_SUGGESTION:\s*(.*?)(?:\n|$)/i);
          if (agreementMatch && agreementMatch[1]) {
            setAgreementSuggestion(agreementMatch[1].trim());
          }
          
          setNeedsAgreement(true);
          setDisagreementPhrases(disagreementDetectedPhrases);
        } else {
          setNeedsAgreement(false);
          setAgreementSuggestion('');
          setDisagreementPhrases([]);
        }
        
        // Be Concise 처리 (API 분석과 별개로 길이 체크)
        if (isNotConcise) {
          highlightedText = `<span class="not-concise-highlight">${highlightedText}</span>`;
        }
        
        setHighlightedInput(highlightedText);
      }
    } catch (error) {
      console.error("Error checking language:", error);
      setIsYouLanguage(false);
      setHighlightedInput('');
      setILanguageSuggestion('');
      setYouLanguageWords([]);
      setIsStrongTone(false);
      setMildToneSuggestion('');
      setStrongToneWords([]);
      setIsBlaming(false);
      setNonBlamingSuggestion('');
      setBlamingWords([]);
      // Concise 상태는 API 결과와 관계없이 유지
      setIsPositiveStart(false);
      setPositivitySuggestion('');
      setPositiveStartPhrases([]);
      setHasJudgment(false);
      setObjectiveDescriptionSuggestion('');
      setJudgmentalPhrases([]);
      setNeedsAgreement(false);
      setAgreementSuggestion('');
      setDisagreementPhrases([]);
    }
    
    setCheckingLanguage(false);
  }, [apiKey]);
  
  // Real-time highlighting without waiting for API
  const highlightInRealTime = useCallback((text) => {
    if (!youLanguageWords.length && !strongToneWords.length && !blamingWords.length && !isNotConcise && !positiveStartPhrases.length && !judgmentalPhrases.length && !needsAgreement && !disagreementPhrases.length) return text;
    
    let highlighted = text;
    
    // You-language 하이라이트
    youLanguageWords.forEach(word => {
      if (word && word.trim()) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        highlighted = highlighted.replace(regex, 
          `<span class="you-language-highlight">${word}</span>`
        );
      }
    });
    
    // Strong tone 하이라이트
    strongToneWords.forEach(word => {
      if (word && word.trim()) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        highlighted = highlighted.replace(regex, 
          `<span class="strong-tone-highlight">${word}</span>`
        );
      }
    });
    
    // Blaming language 하이라이트
    blamingWords.forEach(word => {
      if (word && word.trim()) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        highlighted = highlighted.replace(regex, 
          `<span class="blaming-language-highlight">${word}</span>`
        );
      }
    });
    
    // Judgmental language 하이라이트
    judgmentalPhrases.forEach(phrase => {
      if (phrase && phrase.trim()) {
        const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedPhrase, 'gi');
        highlighted = highlighted.replace(regex, 
          `<span class="non-judgmental-highlight">${phrase}</span>`
        );
      }
    });
    
    // Disagreement phrases 하이라이트
    disagreementPhrases.forEach(phrase => {
      if (phrase && phrase.trim()) {
        const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedPhrase, 'gi');
        highlighted = highlighted.replace(regex, 
          `<span class="agreement-highlight">${phrase}</span>`
        );
      }
    });
    
    // Positive Start 하이라이트 (첫 부분만)
    if (positiveStartPhrases.length > 0 && text.length > 0) {
      // 첫 몇 단어에 대해서만 하이라이트 적용
      const firstFewWords = text.split(' ').slice(0, 3).join(' ');
      const index = highlighted.indexOf(firstFewWords);
      
      if (index === 0) { // 문장 시작 부분인 경우에만
        highlighted = 
          `<span class="positive-start-highlight">${firstFewWords}</span>` + 
          highlighted.substring(firstFewWords.length);
      }
    }
    
    // Be Concise 하이라이트 - 전체 텍스트에 적용
    if (isNotConcise) {
      highlighted = `<span class="not-concise-highlight">${highlighted}</span>`;
    }
    
    return highlighted;
  }, [youLanguageWords, strongToneWords, blamingWords, isNotConcise, positiveStartPhrases, judgmentalPhrases, needsAgreement, disagreementPhrases]);
  
  // Update highlighted text in real-time
  useEffect(() => {
    // 길이 체크 (Be Concise)
    if (inputValue.length > CONCISE_THRESHOLD) {
      setIsNotConcise(true);
      setConciseSuggestion('Try to be more concise. Clear and brief messages are often more effective.');
    } else {
      setIsNotConcise(false);
      setConciseSuggestion('');
    }
    
    if (youLanguageWords.length > 0 || strongToneWords.length > 0 || blamingWords.length > 0 || isNotConcise || positiveStartPhrases.length > 0 || judgmentalPhrases.length > 0 || needsAgreement || disagreementPhrases.length > 0) {
      setHighlightedInput(highlightInRealTime(inputValue));
      setIsYouLanguage(youLanguageWords.length > 0);
      setIsStrongTone(strongToneWords.length > 0);
      setIsBlaming(blamingWords.length > 0);
      setIsPositiveStart(positiveStartPhrases.length > 0);
      setHasJudgment(judgmentalPhrases.length > 0);
      setNeedsAgreement(disagreementPhrases.length > 0);
    }
  }, [inputValue, youLanguageWords, strongToneWords, blamingWords, highlightInRealTime, CONCISE_THRESHOLD, positiveStartPhrases, judgmentalPhrases, needsAgreement, disagreementPhrases]);
  
  // Debounce the input for language checking with API
  useEffect(() => {
    const debounceTimeout = setTimeout(() => {
      checkLanguage(inputValue);
    }, 800); // Adjust debounce time as needed
    
    return () => clearTimeout(debounceTimeout);
  }, [inputValue, checkLanguage]);

  // Handler for sending the message
  const handleSend = () => {
    if (inputValue.trim() === "" || disabled) return;
    onSend();
  };

  return (
    <div className="d-flex flex-column w-100">
      {/* 알림 컨테이너 */}
      {(isYouLanguage && iLanguageSuggestion) || (isStrongTone && mildToneSuggestion) || (isBlaming && nonBlamingSuggestion) || (isNotConcise && conciseSuggestion) || (isPositiveStart && positivitySuggestion) || (hasJudgment && objectiveDescriptionSuggestion) || (needsAgreement && agreementSuggestion) ? (
        <div className="suggestions-container">
          {isYouLanguage && iLanguageSuggestion && (
            <div className="i-language-suggestion">
              <Alert variant="warning" className="py-1 px-2 mb-0">
                <small>
                  <FaLightbulb className="me-1" /> <span className="fw-bold">Try I-language:</span> {iLanguageSuggestion}
                </small>
              </Alert>
            </div>
          )}
          {isStrongTone && mildToneSuggestion && (
            <div className="mild-tone-suggestion">
              <Alert variant="info" className="py-1 px-2 mb-0">
                <small>
                  <FaLightbulb className="me-1" /> <span className="fw-bold">Try Milder Tone:</span> {mildToneSuggestion}
                </small>
              </Alert>
            </div>
          )}
          {isBlaming && nonBlamingSuggestion && (
            <div className="non-blaming-suggestion">
              <Alert variant="success" className="py-1 px-2 mb-0">
                <small>
                  <FaLightbulb className="me-1" /> <span className="fw-bold">Complain Without Blaming:</span> {nonBlamingSuggestion}
                </small>
              </Alert>
            </div>
          )}
          {isNotConcise && conciseSuggestion && (
            <div className="be-concise-suggestion">
              <Alert variant="dark" className="py-1 px-2 mb-0">
                <small>
                  <FaLightbulb className="me-1" /> <span className="fw-bold">Be Concise:</span> {conciseSuggestion}
                </small>
              </Alert>
            </div>
          )}
          {isPositiveStart && positivitySuggestion && (
            <div className="positive-start-suggestion">
              <Alert variant="warning" className="py-1 px-2 mb-0" style={{ backgroundColor: 'white', color: '#ff6f00' }}>
                <small>
                  <FaLightbulb className="me-1" /> <span className="fw-bold">Start with Positivity:</span> {positivitySuggestion}
                </small>
              </Alert>
            </div>
          )}
          {hasJudgment && objectiveDescriptionSuggestion && (
            <div className="non-judgmental-suggestion">
              <Alert variant="info" className="py-1 px-2 mb-0" style={{ backgroundColor: 'white', color: '#3f51b5' }}>
                <small>
                  <FaLightbulb className="me-1" /> <span className="fw-bold">Describe Without Judging:</span> {objectiveDescriptionSuggestion}
                </small>
              </Alert>
            </div>
          )}
          {needsAgreement && agreementSuggestion && (
            <div className="agreement-suggestion">
              <Alert variant="success" className="py-1 px-2 mb-0" style={{ backgroundColor: '#e0f2f1', color: '#00796b' }}>
                <small>
                  <FaLightbulb className="me-1" /> <span className="fw-bold">Find Common Ground:</span> {agreementSuggestion}
                </small>
              </Alert>
            </div>
          )}
        </div>
      ) : null}
      
      {/* 입력 컨테이너 */}
      <div className="d-flex w-100 align-items-center">
        <div style={{ flex: 1, position: 'relative' }}>
          <div className="input-container">
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
              dangerouslySetInnerHTML={{ __html: (isYouLanguage || isStrongTone || isBlaming || isNotConcise || isPositiveStart || hasJudgment || needsAgreement) ? highlightedInput : inputValue }}
            />
          </div>
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
    </div>
  );
};

export default Highlight; 