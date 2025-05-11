// Gottman conflict types definition
const GOTTMAN_TYPES = {
  AVOIDANT: 'Avoidant',
  VALIDATING: 'Validating',
  VOLATILE: 'Volatile',
  HOSTILE: 'Hostile'
};

// Define characteristics and patterns
const TYPE_INFO = {
  [GOTTMAN_TYPES.AVOIDANT]: {
    negativePatterns: [
      `I avoid conflict. I don't think there is much to be gained from getting openly angry with others.
      In fact, a lot of talking about emotions and difficult issues seems to make matters worse. 
      I think that if you just relax about problems, they will have a way of working themselves out.`
    ]
  },
  [GOTTMAN_TYPES.VALIDATING]: {
    negativePatterns: [
      `I discuss difficult issues, but it is important to display a lot of self-control and to remain calm.
      I prefer to let others know that their opinions and emotions are valued even if they are different than mine.
      When arguing, I try to spend a lot of time validating others as well as trying to find a compromise.
      `
    ]
  },
  [GOTTMAN_TYPES.VOLATILE]: {
    negativePatterns: [
      `I debate and argue about issues until they are resolved. 
      Arguing openly and strongly doesn't bother me because this is how differences are resolved. 
      Although sometimes my arguing is intense, that is okay because I try to balance this with kind and loving expressions. 
      I think my passion and zest actually leads to a better relationship with lots of intensity, making up, laughing, and affection.
      `
    ]
  },
  [GOTTMAN_TYPES.HOSTILE]: {
    negativePatterns: [
      `
      I can get pretty upset when I argue. 
      When I am upset at times I insult my partner by using something like sarcasm or put downs. 
      During intense discussions I find it difficult to listen to what my partner is saying because I am trying to make my point. 
      Sometimes I have intensely negative feelings toward my partner when we have a conflict.
      `
    ]
  }
};

// Conflict type analysis function
export async function analyzeGottmanType(scores) {
  try {
    console.log("analyzeGottmanType received scores:", scores);
    
    // Ensure scores is an array and has the right length
    if (!Array.isArray(scores)) {
      console.error("Scores is not an array:", scores);
      scores = Array(13).fill(3); // Default scores
    }
    
    if (scores.length !== 13) {
      console.warn(`Expected 13 scores but got ${scores.length}, adjusting...`);
      // If too short, pad with default values
      if (scores.length < 13) {
        scores = [...scores, ...Array(13 - scores.length).fill(3)];
      } 
      // If too long, truncate
      else if (scores.length > 13) {
        scores = scores.slice(0, 13);
      }
    }
    
    // Make sure all values are numbers between 1-5
    scores = scores.map(score => {
      const num = Number(score);
      if (isNaN(num)) return 3;
      return Math.max(1, Math.min(5, num));
    });
    
    console.log("Normalized scores for analysis:", scores);
    
    // Define the conflict questions for context
    const CONFLICT_QUESTIONS = [
      "We usually resolve conflicts by discussing the problem.",
      "When we reach a compromise, the conflict usually ends.",
      "Compromise is the best way for us to resolve conflicts.",
      "To resolve disagreements, I try to give in a little.",
      "I try to resolve disputes from my partner's perspective and wishes.",
      "My partner and I try to avoid quarrels.",
      "When we disagree, we argue loudly.",
      "Our conflicts usually last for a long time.",
      "Conflicts with my partner cause me distress.",
      "When we have a conflict, I verbally attack my partner.",
      "When conflicts arise, we take a break to cool down.",
      "When we fight, I try to gain the upper hand.",
      "In conflicts, I usually go along with my partner's opinion."
    ];
    
    // Create description of Gottman conflict types for the API
    const typesDescription = {
      "Avoidant": "Avoids conflict. Believes little is gained from getting openly angry. Thinks talking about emotions and difficult issues makes matters worse. Prefers to relax about problems and let them work themselves out.",
      "Validating": "Discusses difficult issues with self-control and calm. Values others' opinions and emotions even when different from their own. Spends time validating others and finding compromise during arguments.",
      "Volatile": "Debates and argues issues until resolved. Comfortable with open and strong arguments as a way to resolve differences. Balances intense arguments with kind and loving expressions. Values passionate interactions.",
      "Hostile": "Gets upset during arguments. May use sarcasm or put-downs when upset. Finds it difficult to listen during intense discussions. Can experience intensely negative feelings toward partner during conflicts."
    };
    
    // Call OpenAI API to analyze the conflict type
    const prompt = `
    You are an expert in John Gottman's conflict resolution theory. Analyze the following conflict resolution scores to determine the person's primary conflict type.
    
    The scores (1-5 scale) are responses to these questions:
    ${CONFLICT_QUESTIONS.map((q, i) => `${i+1}. ${q} - Score: ${scores[i]}`).join('\n')}
    
    Gottman conflict types:
    ${Object.entries(typesDescription).map(([type, desc]) => `- ${type}: ${desc}`).join('\n')}
    
    Based only on these scores, determine the primary conflict type of this person. Return ONLY the exact name of the primary type.
    
    Your response should be a JSON object with the following format:
    {"primaryType": "Avoidant"}
    
    Choose exactly one of these types: Avoidant, Validating, Volatile, Hostile.
    DO NOT include any explanation, only the JSON object.
    `;
    
    console.log("Sending prompt to OpenAI");
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { 
              role: 'system', 
              content: 'You are a research assistant specializing in Gottman conflict theory. Return ONLY a JSON object with the primary conflict type.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3
        })
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }
      
      const content = data.choices[0].message.content.trim();
      console.log("OpenAI response:", content);
      
      let result;
      try {
        // Try to parse the response directly
        result = JSON.parse(content);
        if (!result.primaryType || !Object.values(GOTTMAN_TYPES).includes(result.primaryType)) {
          throw new Error('Invalid primary type');
        }
      } catch (parseError) {
        // If direct parsing fails, try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No valid JSON found in response');
        }
        result = JSON.parse(jsonMatch[0]);
        if (!result.primaryType || !Object.values(GOTTMAN_TYPES).includes(result.primaryType)) {
          throw new Error('Invalid primary type in extracted JSON');
        }
      }
      
      const primaryType = result.primaryType;
      console.log("Determined primary type:", primaryType);
      
      // Return the analysis result
      return {
        primaryType,
        ...TYPE_INFO[primaryType]
      };
    } catch (apiError) {
      console.error("Error calling OpenAI API:", apiError);
      
      // Return default Validator type if there's an error
      return {
        primaryType: GOTTMAN_TYPES.VALIDATING,
        ...TYPE_INFO[GOTTMAN_TYPES.VALIDATING]
      };
    }
    
  } catch (error) {
    console.error("Error in analyzeGottmanType:", error);
    
    // Return default Validator type if there's an error
    return {
      primaryType: GOTTMAN_TYPES.VALIDATING,
      ...TYPE_INFO[GOTTMAN_TYPES.VALIDATING]
    };
  }
}

// Analysis function that combines all methods
export async function analyzeConflictTypes(personalityAnalysis) {
  try {
    console.log("Starting analyzeConflictTypes with data:", personalityAnalysis);
    
    // Separate the two people (Me and partner)
    const people = Object.entries(personalityAnalysis).map(([person, data]) => ({
      person,
      scores: data.scores || []
    }));
    
    console.log("Extracted people data:", people);
    
    if (people.length < 2) {
      console.error("Not enough people data for analysis");
      throw new Error("At least two people's data is needed for analysis");
    }
    
    // Analyze each person's conflict type
    const peopleAnalysis = {};
    
    // Process each person sequentially
    for (const person of people) {
      console.log(`Analyzing ${person.person}'s conflict type with scores:`, person.scores);
      peopleAnalysis[person.person] = await analyzeGottmanType(person.scores);
      console.log(`Analysis result for ${person.person}:`, peopleAnalysis[person.person]);
    }
    
    return {
      people: peopleAnalysis
    };
  } catch (error) {
    console.error("Error during conflict type analysis:", error);
    return null;
  }
}

export default {
  GOTTMAN_TYPES,
  analyzeGottmanType,
  analyzeConflictTypes
};