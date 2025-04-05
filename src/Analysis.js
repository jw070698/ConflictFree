import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import app from "./firebase";

const db = getFirestore(app);

// Analysis personality of each participant: based on the messages
// NEED PAPER TO ANALYSIS PERSONALITY
export async function analyzePersonality(person, messages) {
  const prompt = `Analyze the following messages for the person "${person}": ${messages.join("\n")}
                Based on these messages, provide a detailed personality analysis that includes the person's communication style, strengths, weaknesses, and overall personality traits.
                Respond strictly in JSON format with the following keys:
                {
                "person": "${person}",
                "personalityTraits": "<a brief summary of personality traits>",
                "communicationStyle": "<description of how this person communicates>",
                }
                Do not include any additional text.`;
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
       model: 'gpt-4',
       messages: [
         { role: 'system', content: "You are a personality analysis assistant." },
         { role: 'user', content: prompt }
       ]
    })
  });
  
  const data = await response.json();
  const analysis = data.choices[0].message.content;
  
  return JSON.parse(analysis.replace(/```json|```/g, '').trim());
}

// Personality - Firebase
export async function storePersonalityAnalysis(userDocId, person, analysis) {
  const userDocRef = doc(db, "users", userDocId);
  try {
    await updateDoc(userDocRef, {
       [`personalityAnalysis.${person}`]: analysis,
       updatedAt: serverTimestamp()
    });
    console.log(`Personality analysis for ${person} saved.`);
  } catch (error) {
    console.error(`Error saving personality analysis for ${person}:`, error);
  }
}

// userData.openAiResults: 
// [
//   { Person: "name", Messages: [ ... ] },
//   { Person: "name", Messages: [ ... ] },
//   { Person: "name", Messages: [ ... ] },
//   { Person: "name", Messages: [ ... ] }
// ]
export async function processAllPersonalityAnalyses(userDocId, openAiResults) {
  const participants = openAiResults.filter(item => item.Person !== "Me");
  for (let participant of participants) {
    const { Person, Messages } = participant;
    try {
      const analysis = await analyzePersonality(Person, Messages);
      await storePersonalityAnalysis(userDocId, Person, analysis);
    } catch (error) {
      console.error(`Error processing personality analysis for ${Person}:`, error);
    }
  }
}
